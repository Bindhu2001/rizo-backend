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
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('IN', 'OUT') NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        client_punch_time DATETIME NOT NULL,
        sync_status TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 3. Client Visits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_visits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        start_time DATETIME,
        end_time DATETIME,
        status VARCHAR(50) DEFAULT 'SCHEDULED',
        sync_status TINYINT DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 4. Leaves table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 5. Attendance Regularization table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_reg (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        punch_date DATE NOT NULL,
        actual_time VARCHAR(20),
        expected_time VARCHAR(20),
        type VARCHAR(50),
        reason TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
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

// [VISITS] POST visit
app.post('/api/visits', async (req, res) => {
  try {
    const { userId, clientName, location } = req.body;
    const [result] = await pool.query(
      'INSERT INTO client_visits (user_id, client_name, location, status, sync_status) VALUES (?, ?, ?, "SCHEDULED", 1)',
      [userId, clientName, location]
    );
    res.json({ success: true, id: result.insertId });
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

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  const { user_id, password } = req.body;
  // Mock login for now or check users table
  res.json({ success: 1, data: { user_id, employee_name: 'Test Member', designation: 'Developer' } });
});

const PORT = process.env.PORT || 8080;
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
  });
});
