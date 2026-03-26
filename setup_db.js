const mysql = require('mysql2/promise');
require('dotenv').config();

async function setup() {
  const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ Connected to MySQL server');

    await connection.query('CREATE DATABASE IF NOT EXISTS rizo_mobile');
    console.log('✅ Database "rizo_mobile" verified');

    await connection.query('USE rizo_mobile');

    // 1. Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Attendance table
    await connection.query(`
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
    await connection.query(`
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
    await connection.query(`
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
    await connection.query(`
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

    await connection.end();
    console.log('🚀 Local Database Setup Complete!');
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

setup();
