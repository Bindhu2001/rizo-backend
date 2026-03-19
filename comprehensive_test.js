const axios = require('axios');

async function testAll() {
  const BASE_URL = 'http://localhost:8080/api';
  const testUser = {
    name: 'Antigravity Test',
    email: `test_${Date.now()}@example.com`,
    password: 'password123'
  };

  try {
    console.log('--- TESTING SIGNUP ---');
    const signup = await axios.post(`${BASE_URL}/auth/signup`, testUser);
    console.log('✅ Signup Response:', signup.data);
    const userId = signup.data.userId;

    console.log('\n--- TESTING LOGIN ---');
    const login = await axios.post(`${BASE_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    console.log('✅ Login Response:', login.data);

    console.log('\n--- TESTING OFFICE INFO ---');
    const office = await axios.get(`${BASE_URL}/office`);
    console.log('✅ Office Location:', office.data);

    console.log('\n--- TESTING PUNCH (SIMULATED) ---');
    // Using office coordinates to satisfy distance check if present
    const punch = await axios.post(`${BASE_URL}/attendance/punch`, {
      userId: userId,
      type: 'IN',
      latitude: office.data.latitude || 9.9925,
      longitude: office.data.longitude || 76.3148,
      clientPunchTime: new Date().toISOString()
    });
    console.log('✅ Punch Response:', punch.data);

    console.log('\n--- TESTING STATUS ---');
    const status = await axios.get(`${BASE_URL}/attendance/status/${userId}`);
    console.log('✅ Status (Last Punch):', status.data.lastType);
    console.log('✅ History Count:', status.data.todayHistory.length);

    console.log('\n🚀 ALL API ENDPOINTS ARE WORKING PERFECTLY! 🥳');
  } catch (error) {
    console.error('\n❌ TEST FAILED at stage:', error.config?.url);
    console.error('Error Message:', error.response?.data || error.message);
  }
}

testAll();
