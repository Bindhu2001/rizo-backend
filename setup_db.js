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

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table verified');

    // Create attendance table
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
    console.log('✅ Attendance table verified');

    await connection.end();
    console.log('🚀 Database Setup Complete!');
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('👉 PLEASE MAKE SURE XAMPP MYSQL IS STARTED!');
    }
  }
}

setup();
