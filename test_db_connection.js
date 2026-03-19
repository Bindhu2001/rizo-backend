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
    
    const [cols] = await conn.query('DESCRIBE users');
    console.log('--- Users Table ---');
    console.log(cols.map(c => `- ${c.Field} (${c.Type})`).join('\n'));
    
    const [attCols] = await conn.query('DESCRIBE attendance');
    console.log('\n--- Attendance Table ---');
    console.log(attCols.map(c => `- ${c.Field} (${c.Type})`).join('\n'));
    
    await conn.end();
  } catch (e) {
    console.error('❌ STILL FAILING:', e.message);
  }
}
checkStatus();
