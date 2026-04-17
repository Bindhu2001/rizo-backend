const BASE_URL = 'https://rizo-backend-production.up.railway.app/api';
const AUTH_URL = 'https://v1.mypayrollmaster.online/api/v2qa';
const NEWAPP_URL = 'https://v1.mypayrollmaster.online/api/v2qa/newapp';

export const API_ENDPOINTS = {
  AUTH: `${AUTH_URL}/login`,
  ATTENDANCE: `${AUTH_URL}/attendance`,
  OFFICE: `${BASE_URL}/office`,
  VISITS: `${BASE_URL}/visits`,
  LEAVES: `${NEWAPP_URL}/leave`,
  REGULARIZATION: `${BASE_URL}/regularization`,
  ATTENDANCE_LOGS: `${NEWAPP_URL}/attendance_logs`,
  ATTENDANCE_PUNCHES: `${NEWAPP_URL}/attendance_punches`,
  DEVICE_ATTENDANCE: `${NEWAPP_URL}/get_device_attendance`,
  REGULARISATION_LOGS: `${NEWAPP_URL}/regularisation_logs`,
  REGULARISE: `${NEWAPP_URL}/regularise`,
  SWIPE: `${NEWAPP_URL}/swipe`,
  UPCOMING_EVENTS: `${AUTH_URL}/upcoming_events_list`,
  VISIT_SYNC: `${NEWAPP_URL}/customer_visit_sync`,
  LEAVE_ITEMS: `${NEWAPP_URL}/leave_items`,
  LEAVE_HISTORY: `${NEWAPP_URL}/leave_history`,
  SUBMIT_EXPENSE: `${NEWAPP_URL}/submit_expense`,
  GET_SUBMITTED_EXPENSES: `${NEWAPP_URL}/get_submitted_expenses`,
  GET_EXPENSE_TYPES: `${NEWAPP_URL}/get_expense_types`,
  GET_COUNTRIES: `${NEWAPP_URL}/countries`,
  UPDATE_PROFILE: `${NEWAPP_URL}/update_profile`,
};

export default BASE_URL;
