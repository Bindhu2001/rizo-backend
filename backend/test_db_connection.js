const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkStatus() {
  const config = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'rizo_mobile'
  };

  try {
    const conn = await mysql.createConnection(config);
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY!');
    
    for (const table of ['users', 'attendance', 'client_visits', 'leaves']) {
      try {
        const [rows] = await conn.query(`DESCRIBE ${table}`);
        console.log(`\n--- TABLE: ${table} ---`);
        rows.forEach(r => console.log(`  - ${r.Field} (${r.Type})`));
      } catch (err) {
        console.log(`❌ TABLE ${table} FAILED: ${err.message}`);
      }
    }
    
    await conn.end();
  } catch (e) {
    console.error('❌ CONNECTION FAILED:', e.message);
  }
}
checkStatus();
