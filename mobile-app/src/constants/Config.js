const BASE_URL = 'https://rizo-backend-production.up.railway.app/api'; 
const AUTH_URL = 'https://v1.mypayrollmaster.online/api/v2qa'; 

export const API_ENDPOINTS = {
  AUTH: `${AUTH_URL}/login`,
  ATTENDANCE: `${BASE_URL}/attendance`,
  OFFICE: `${BASE_URL}/office`,
  VISITS: `${BASE_URL}/visits`,
  LEAVES: `${BASE_URL}/leaves`,
  REGULARIZATION: `${BASE_URL}/regularization`,
};

export default BASE_URL;
