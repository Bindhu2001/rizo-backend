const BASE_URL = 'https://rizo-backend-production.up.railway.app/api';
const AUTH_URL = 'https://v1.mypayrollmaster.online/api/v2qa';
const NEWAPP_URL = 'https://v1.mypayrollmaster.online/api/v2qa/newapp';

export const API_ENDPOINTS = {
  AUTH: `${AUTH_URL}/login`,
  ATTENDANCE: `${AUTH_URL}/attendance`,
  OFFICE: `${BASE_URL}/office`,
  VISITS: `${BASE_URL}/visits`,
  LEAVES: `${NEWAPP_URL}/leaves`,
  REGULARIZATION: `${BASE_URL}/regularization`,
  ATTENDANCE_LOGS: `${NEWAPP_URL}/attendance_logs`,
  REGULARISATION_LOGS: `${NEWAPP_URL}/regularisation_logs`,
  REGULARISE: `${NEWAPP_URL}/regularise`,
  SWIPE: `${NEWAPP_URL}/swipe`,
  UPCOMING_EVENTS: `${AUTH_URL}/upcoming_events_list`,
  VISIT_SYNC: `${NEWAPP_URL}/customer_visit_sync`,
  LEAVE_ITEMS: `${NEWAPP_URL}/leave_items`,
  LEAVE_HISTORY: `${NEWAPP_URL}/leave_history`,
};

export default BASE_URL;
