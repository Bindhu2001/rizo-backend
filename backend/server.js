const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
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

const PORT = process.env.PORT || 8080;
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
  });
});
