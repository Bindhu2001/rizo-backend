const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create connection pool - uses env vars on Railway, falls back to local defaults
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'rizo_mobile',
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00'
});

// Mock office location
const OFFICE_LOCATION = {
  latitude: 9.9925, // Replace with actual latitude
  longitude: 76.3148, // Replace with actual longitude
  radius_metres: 50.0
};

// GET office location
app.get('/api/office', (req, res) => {
  res.json(OFFICE_LOCATION);
});

// Helper for distance calculation server-side (optional validation)
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatClientTime = (clientTimeStr) => {
  if (!clientTimeStr) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  // Handle Z or lack of it consistently
  const d = new Date(clientTimeStr);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

// POST punch
app.post('/api/attendance/punch', async (req, res) => {
  try {
    const { userId, type, latitude, longitude, clientPunchTime } = req.body;
    
    if (latitude == null || longitude == null) {
      return res.status(400).send('Location data is required.');
    }

    const distance = haversineDistance(latitude, longitude, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude);
    if (distance > OFFICE_LOCATION.radius_metres) {
      return res.status(403).send('Outside office premises.');
    }

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).send('User not found');
    }

    const formattedTime = formatClientTime(clientPunchTime);

    // Insert into attendance table with sync_status = 1
    await pool.query(
      'INSERT INTO attendance (user_id, type, latitude, longitude, client_punch_time, sync_status) VALUES (?, ?, ?, ?, ?, 1)',
      [userId, type, latitude, longitude, formattedTime]
    );

    res.json(`Punch ${type} recorded successfully!`);
  } catch (error) {
    console.error('Punch error:', error);
    res.status(500).send('Database error');
  }
});

// POST sync-offline
app.post('/api/attendance/sync-offline', async (req, res) => {
  try {
    const punches = req.body;
    for (const punch of punches) {
      const { userId, type, latitude, longitude, clientPunchTime } = punch;
      const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (users.length > 0) {
        const formattedTime = formatClientTime(clientPunchTime);
        // Sync to single attendance table, set sync_status = 1 (It was 0 in local JS, now 1 in remote DB)
        await pool.query(
          'INSERT INTO attendance (user_id, type, latitude, longitude, client_punch_time, sync_status) VALUES (?, ?, ?, ?, ?, 1)',
          [userId, type, latitude, longitude, formattedTime]
        );
      }
    }
    res.json('Offline data successfully synced to master table.');
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).send('Database error');
  }
});

// GET status
app.get('/api/attendance/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).send('User not found');
    }

    // Get today's history in local date (based on JS)
    const today = new Date().toISOString().slice(0, 10);
    const [todayHistory] = await pool.query(
      `SELECT * FROM attendance 
       WHERE user_id = ? AND DATE(client_punch_time) = ? 
       ORDER BY client_punch_time ASC`,
      [userId, today]
    );

    let lastType = 'NONE';
    let lastTime = null;

    if (todayHistory.length > 0) {
        const lastPunch = todayHistory[todayHistory.length - 1];
        lastType = lastPunch.type;
        lastTime = lastPunch.client_punch_time;
    }

    // Map DB fields to camelCase to match frontend original logic
    const formattedHistory = todayHistory.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      latitude: row.latitude,
      longitude: row.longitude,
      punchTime: row.client_punch_time.toISOString(), // Use raw Date object toISOString
      clientPunchTime: row.client_punch_time.toISOString(),
      syncStatus: row.sync_status
    }));

    // Sorting decending for history inside frontend usually
    formattedHistory.reverse();

    res.json({
      lastType,
      lastTime,
      todayHistory: formattedHistory
    });

  } catch (error) {
    console.error('Fetch status error:', error);
    res.status(500).send('Database error');
  }
});

// GET history
app.get('/api/attendance/history/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const [history] = await pool.query(
        `SELECT * FROM attendance WHERE user_id = ? ORDER BY client_punch_time DESC`,
        [userId]
      );
      
      const formattedHistory = history.map(row => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        latitude: row.latitude,
        longitude: row.longitude,
        punchTime: row.client_punch_time.toISOString(),
        clientPunchTime: row.client_punch_time.toISOString(),
        syncStatus: row.sync_status
      }));

      res.json(formattedHistory);
    } catch (e) {
      res.status(500).send('Database error');
    }
});

// POST signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).send('Missing fields');
    }

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, password]
    );

    res.json({ message: 'User created', userId: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).send('Email already exists');
    }
    console.error('Signup error:', error);
    res.status(500).send('Database error');
  }
});

// POST login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
    
    if (users.length > 0) {
        const user = users[0];
        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } else {
        res.status(401).send('Invalid credentials');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Database error');
  }
});

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
