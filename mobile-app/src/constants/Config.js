const BASE_URL = 'https://rizo-backend-production.up.railway.app/api'; 

export const API_ENDPOINTS = {
  AUTH: `${BASE_URL}/auth`,
  ATTENDANCE: `${BASE_URL}/attendance`,
  OFFICE: `${BASE_URL}/office`,
  VISITS: `${BASE_URL}/visits`,
  LEAVES: `${BASE_URL}/leaves`,
  REGULARIZATION: `${BASE_URL}/regularization`,
};

export default BASE_URL;
