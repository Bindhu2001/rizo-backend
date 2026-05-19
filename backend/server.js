const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Root route to check if server is live
app.get('/', (req, res) => {
  res.send('<h1>Rizo Backend Server is Running!</h1><p>API endpoints are available at /api/...</p>');
});

// Database setup - uses Railway env vars or falls back to local defaults
const dbConfig = process.env.MYSQL_URL || {
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'rizo_mobile',
  port: parseInt(process.env.MYSQLPORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.MYSQL_URL ? { rejectUnauthorized: false } : null
};

console.log(`[INIT] Cloud Database detected: ${process.env.MYSQL_URL ? 'YES' : 'Local envs'}`);
const pool = mysql.createPool(dbConfig);

// Automatic Table Creation
const initializeDatabase = async () => {
  try {
    console.log('[DB] Verifying tables...');
    
    // 1. Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        type ENUM('IN', 'OUT') NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        client_punch_time DATETIME NOT NULL,
        sync_status TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Client Visits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_visits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        contact_number VARCHAR(50),
        contact_person VARCHAR(255),
        purpose TEXT,
        location VARCHAR(255),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        start_time DATETIME,
        step_in_time DATETIME,
        end_time DATETIME,
        status VARCHAR(50) DEFAULT 'SCHEDULED',
        sync_status TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Auto-migrate new columns if table existed before
    try { await pool.query('ALTER TABLE client_visits ADD COLUMN contact_number VARCHAR(50)'); } catch(e){}
    try { await pool.query('ALTER TABLE client_visits ADD COLUMN contact_person VARCHAR(255)'); } catch(e){}
    try { await pool.query('ALTER TABLE client_visits ADD COLUMN purpose TEXT'); } catch(e){}
    try { await pool.query('ALTER TABLE client_visits ADD COLUMN step_in_time DATETIME'); } catch(e){}

    // 4. Leaves table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        leave_type VARCHAR(100) NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        from_half VARCHAR(50) DEFAULT 'Full Day',
        to_half VARCHAR(50) DEFAULT 'Full Day',
        status VARCHAR(50) DEFAULT 'PENDING',
        reason TEXT,
        authorized_by VARCHAR(255),
        approved_by VARCHAR(255),
        contact_no VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Attendance Regularization table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_reg (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        punch_date DATE NOT NULL,
        actual_time VARCHAR(20),
        expected_time VARCHAR(20),
        type VARCHAR(50),
        reason TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Push tokens — stores Expo push token per user for server-side notifications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        user_id VARCHAR(50) PRIMARY KEY,
        push_token TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // 7. Notified refs — dedup guard so the same approval never fires twice
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notified_refs (
        ref_key VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Clean up notification history older than 90 days to keep the table small
    await pool.query(`DELETE FROM notified_refs WHERE notified_at < NOW() - INTERVAL 90 DAY`);

    console.log('✅ Database tables verified/created');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
  }
};

// ─── API Endpoints ───────────────────────────────────────────────────────────

// [ATTENDANCE] POST punch
app.post('/api/attendance/punch', async (req, res) => {
  try {
    const { userId, type, latitude, longitude, clientPunchTime } = req.body;
    const [result] = await pool.query(
      'INSERT INTO attendance (user_id, type, latitude, longitude, client_punch_time, sync_status) VALUES (?, ?, ?, ?, ?, 1)',
      [userId, type, latitude, longitude, clientPunchTime]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [ATTENDANCE] GET status
app.get('/api/attendance/status/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT type as lastType FROM attendance WHERE user_id = ? ORDER BY client_punch_time DESC LIMIT 1',
      [req.params.userId]
    );
    const [history] = await pool.query(
      'SELECT * FROM attendance WHERE user_id = ? AND DATE(client_punch_time) = CURDATE() ORDER BY client_punch_time DESC',
      [req.params.userId]
    );
    res.json({
      lastType: rows.length > 0 ? rows[0].lastType : 'NONE',
      todayHistory: history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [ATTENDANCE] GET history
app.get('/api/attendance/history/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance WHERE user_id = ? ORDER BY client_punch_time DESC LIMIT 50',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [VISITS] POST visit
app.post('/api/visits', async (req, res) => {
  try {
    const { 
      userId, clientName, location, status,
      contactNumber, contactPerson, purpose,
      latitude, longitude, startTime, stepInTime, endTime 
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO client_visits 
        (user_id, client_name, contact_number, contact_person, purpose, location, latitude, longitude, start_time, step_in_time, end_time, status, sync_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [userId, clientName, contactNumber, contactPerson, purpose, location, latitude || null, longitude || null, startTime || null, stepInTime || null, endTime || null, status || 'SCHEDULED']
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [VISITS] GET history
app.get('/api/visits/history/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM client_visits WHERE user_id = ? ORDER BY id DESC LIMIT 50',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [LEAVES] POST leave
app.post('/api/leaves', async (req, res) => {
  try {
    const { userId, leaveType, fromDate, toDate, fromHalf, toHalf, reason, authorizedBy, approvedBy, contactNo } = req.body;
    const [result] = await pool.query(
      `INSERT INTO leaves (user_id, leave_type, from_date, to_date, from_half, to_half, reason, authorized_by, approved_by, contact_no, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [userId, leaveType, fromDate, toDate, fromHalf, toHalf, reason, authorizedBy, approvedBy, contactNo]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [LEAVES] GET history
app.get('/api/leaves/history/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM leaves WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [REGULARIZATION] POST reg
app.post('/api/regularization', async (req, res) => {
  try {
    const { userId, punchDate, actualTime, expectedTime, type, reason } = req.body;
    const [result] = await pool.query(
      'INSERT INTO attendance_reg (user_id, punch_date, actual_time, expected_time, type, reason, status) VALUES (?, ?, ?, ?, ?, ?, "PENDING")',
      [userId, punchDate, actualTime, expectedTime, type, reason]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [REGULARIZATION] GET history
app.get('/api/regularization/history/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM attendance_reg WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { user_id, password } = req.body;

    // Check if user exists in the MySQL 'users' table
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [user_id]);

    if (rows.length > 0) {
      const user = rows[0];
      if (user.password === password) {
        res.json({ success: 1, data: { user_id: user.id, employee_name: user.name, designation: 'Developer' } });
      } else {
        res.json({ success: 0, message: 'Invalid password' });
      }
    } else {
      // Auto-create user for testing purposes so you don't need a separate signup form
      await pool.query(
        'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
        [user_id, 'Admin Member', `${user_id}@greatleap.com`, password]
      );
      res.json({ success: 1, data: { user_id, id: user_id, employee_name: 'Admin Member', designation: 'Developer' } });
    }
  } catch (error) {
    res.status(500).json({ success: 0, error: error.message });
  }
});

// ─── Register Push Token ────────────────────────────────────────────────────
app.post('/api/register-push-token', async (req, res) => {
  try {
    const { user_id, push_token } = req.body || {};
    if (!user_id || !push_token) return res.status(400).json({ success: 0, error: 'user_id and push_token required' });
    await pool.query(
      'INSERT INTO push_tokens (user_id, push_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE push_token = ?, updated_at = NOW()',
      [user_id, push_token, push_token]
    );
    return res.json({ success: 1 });
  } catch (error) {
    return res.status(500).json({ success: 0, error: error.message });
  }
});

// ─── Push Notifications ─────────────────────────────────────────────────────
// Forwards a notification to Expo's push service. Call this from any approver
// flow (leave / expense / regularisation, approve / reject / cancel) after the
// status has been persisted. Expo delivers to APNs (iOS) and FCM (Android),
// so the user is notified even when the app is fully closed.
//
// Body:
// {
//   "push_token": "ExponentPushToken[xxxxxxxx]",  // required
//   "title": "Leave Approved",                    // required
//   "body":  "Your leave for 2026-05-20 was approved.", // required
//   "data":  { "type": "LEAVE", "status": "APPROVED" }  // optional, free-form
// }
app.post('/api/send-push', async (req, res) => {
  try {
    const { push_token, title, body, data } = req.body || {};
    if (!push_token || !title || !body) {
      return res.status(400).json({ success: 0, error: 'push_token, title and body are required' });
    }
    if (!/^ExponentPushToken\[.+\]$/.test(push_token)) {
      return res.status(400).json({ success: 0, error: 'push_token must look like ExponentPushToken[...]' });
    }

    const expoRes = await axios.post(
      'https://exp.host/--/api/v2/push/send',
      {
        to: push_token,
        title,
        body,
        data: data || {},
        sound: 'default',
        channelId: 'default',
        priority: 'high',
      },
      { headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' }, timeout: 10000 }
    );

    const ticket = expoRes.data?.data;
    if (ticket?.status === 'error') {
      return res.status(502).json({ success: 0, error: ticket.message || 'Expo rejected the push', details: ticket.details });
    }
    return res.json({ success: 1, ticket });
  } catch (error) {
    console.error('[send-push] error', error?.response?.data || error.message);
    return res.status(500).json({ success: 0, error: error.message });
  }
});

// ─── Server-side push notification poller ───────────────────────────────────
// Runs every 60 s. For every user who has a push token registered, it fetches
// their expense / regularisation / leave status from the production API and
// fires an Expo push notification the moment a status becomes APPROVED /
// REJECTED / AUTHORISED. Works even when the mobile app is fully closed.

const PROD_API = 'https://v1.mypayrollmaster.online/api/v1/newapp';
let pollerRunning = false;

const sendExpoPush = async (pushToken, title, body, data = {}) => {
  if (!/^ExponentPushToken\[.+\]$/.test(pushToken)) return;
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken, title, body, data, sound: 'default', channelId: 'default', priority: 'high',
    }, { headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' }, timeout: 10000 });
  } catch (e) {
    console.error('[notify] Expo push send error:', e.message);
  }
};

const alreadyNotified = async (refKey) => {
  const [rows] = await pool.query('SELECT 1 FROM notified_refs WHERE ref_key = ?', [refKey]);
  return rows.length > 0;
};

const markNotified = async (userId, refKey) => {
  try {
    await pool.query('INSERT IGNORE INTO notified_refs (ref_key, user_id) VALUES (?, ?)', [refKey, userId]);
  } catch (_) {}
};

const checkUserNotifications = async (userId, pushToken) => {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;

  // 1. Expenses
  try {
    const res = await axios.get(`${PROD_API}/get_submitted_expenses?user_id=${userId}`, { timeout: 8000 });
    if (res.data?.success === 1 && Array.isArray(res.data.data)) {
      for (const exp of res.data.data) {
        const st = (exp.expense_status || '').toUpperCase();
        const isAuth = st === 'AUTHORISED' || st === 'AUTHORIZED';
        const isSelfAuth = isAuth && exp.authorized_by && exp.approved_by && exp.authorized_by === exp.approved_by;
        const effective = isSelfAuth ? 'APPROVED' : st;
        if (!['APPROVED', 'REJECTED', 'CANCELLED', 'CANCELED', 'AUTHORISED', 'AUTHORIZED'].includes(st)) continue;
        const refKey = `exp_${exp.emp_expenses_pkey}_${effective}`;
        if (await alreadyNotified(refKey)) continue;
        const date = exp.expense_date || 'your request';
        let title, body;
        if (effective === 'APPROVED')    { title = 'Expense Approved ✅';   body = `Your expense for ${date} was approved.`; }
        else if (st === 'REJECTED')      { title = 'Expense Rejected ❌';   body = `Your expense for ${date} was rejected.`; }
        else if (isAuth)                 { title = 'Expense Authorised 🛡️'; body = `Your expense for ${date} was authorised.`; }
        else                             { title = 'Expense Cancelled ⚠️';  body = `Your expense for ${date} was cancelled.`; }
        await sendExpoPush(pushToken, title, body, { type: 'EXPENSE' });
        await markNotified(userId, refKey);
      }
    }
  } catch (e) { console.log(`[notify] expense error for ${userId}:`, e.message); }

  // 2. Regularisation (current + prev month)
  for (const month of [currentMonth, prevMonth]) {
    try {
      const res = await axios.post(`${PROD_API}/regularisation_logs`, { user_id: userId, month }, { timeout: 8000 });
      if (res.data?.success === 1 && Array.isArray(res.data.data)) {
        for (const reg of res.data.data) {
          const st = (reg.status || '').toUpperCase();
          if (!['APPROVED', 'REJECTED', 'CANCELLED', 'CANCELED'].includes(st)) continue;
          const regId = reg.reg_id || reg.id || reg.regularisation_id;
          const refKey = `reg_${regId}_${st}`;
          if (await alreadyNotified(refKey)) continue;
          const date = reg.punch_date || reg.reg_date || reg.date || 'your request';
          let title, body;
          if (st === 'APPROVED')  { title = 'Regularization Approved ✅'; body = `Your regularization for ${date} was approved.`; }
          else if (st === 'REJECTED') { title = 'Regularization Rejected ❌'; body = `Your regularization for ${date} was rejected.`; }
          else                    { title = 'Regularization Cancelled ⚠️'; body = `Your regularization for ${date} was cancelled.`; }
          await sendExpoPush(pushToken, title, body, { type: 'REGULARIZATION' });
          await markNotified(userId, refKey);
        }
      }
    } catch (e) { console.log(`[notify] reg error for ${userId}/${month}:`, e.message); }
  }

  // 3. Leaves
  try {
    const res = await axios.post(`${PROD_API}/leave_history`, { user_id: userId, filter: 'all' }, { timeout: 8000 });
    if (res.data?.success === 1 && Array.isArray(res.data.data)) {
      for (const leave of res.data.data) {
        const st = (leave.leave_status || leave.status || '').toUpperCase();
        const isAuth = st === 'AUTHORISED' || st === 'AUTHORIZED';
        const isCancel = st === 'CANCELLED' || st === 'CANCELED';
        if (!['APPROVED', 'REJECTED', 'AUTHORISED', 'AUTHORIZED', 'CANCELLED', 'CANCELED'].includes(st)) continue;
        const leaveId = leave.leave_id || leave.id;
        const normalized = isAuth ? 'AUTHORISED' : isCancel ? 'CANCELLED' : st;
        const refKey = `leave_${leaveId}_${normalized}`;
        if (await alreadyNotified(refKey)) continue;
        const date = leave.from_date || 'your request';
        const name = leave.leave_name || 'request';
        let title, body;
        if (st === 'APPROVED')  { title = 'Leave Approved ✅';   body = `Your leave (${name}) for ${date} was approved.`; }
        else if (st === 'REJECTED') { title = 'Leave Rejected ❌';   body = `Your leave (${name}) for ${date} was rejected.`; }
        else if (isAuth)        { title = 'Leave Authorised 🛡️'; body = `Your leave (${name}) for ${date} was authorised.`; }
        else                    { title = 'Leave Cancelled ⚠️';  body = `Your leave (${name}) for ${date} was cancelled.`; }
        await sendExpoPush(pushToken, title, body, { type: 'LEAVE' });
        await markNotified(userId, leaveId ? refKey : `leave_noId_${userId}_${normalized}_${date}`);
      }
    }
  } catch (e) { console.log(`[notify] leave error for ${userId}:`, e.message); }
};

const startNotificationPoller = () => {
  setInterval(async () => {
    if (pollerRunning) return;
    pollerRunning = true;
    try {
      const [tokens] = await pool.query('SELECT user_id, push_token FROM push_tokens');
      if (tokens.length === 0) { pollerRunning = false; return; }
      console.log(`[notify] Polling ${tokens.length} user(s)...`);
      for (const { user_id, push_token } of tokens) {
        await checkUserNotifications(user_id, push_token).catch(e =>
          console.error(`[notify] user ${user_id} error:`, e.message)
        );
      }
    } catch (e) {
      console.error('[notify] poller error:', e.message);
    } finally {
      pollerRunning = false;
    }
  }, 60000); // every 60 seconds
};

const PORT = process.env.PORT || 8080;
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
  });
  startNotificationPoller();
});
