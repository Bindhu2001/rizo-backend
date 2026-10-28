import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REVAMP_API_URL } from '../constants/Config';
import { getLoggedUser } from './LocalDB';
import * as FileSystem from 'expo-file-system/legacy';

// Calls into rizo-revamp's /api/mobile/* routes. Signs in silently with the user id + password
// the app already logged in with (kept in LocalDB user_profile) and keeps the 30-day bearer
// token; a 401 (expired, password changed, access revoked) gets one fresh sign-in and retry.

const TOKEN_KEY = 'revamp_mobile_token';

const signIn = async () => {
  const user = await getLoggedUser();
  if (!user?.user_id || !user?.password) throw new Error('Not logged in');
  const res = await axios.post(`${REVAMP_API_URL}/auth/token`,
    { user_id: user.user_id, password: user.password },
    { timeout: 10000 });
  const token = res.data?.token;
  if (!token) throw new Error('Sign-in failed');
  try { await AsyncStorage.setItem(TOKEN_KEY, token); } catch (_) {}
  return token;
};

const getToken = async () => {
  try {
    const saved = await AsyncStorage.getItem(TOKEN_KEY);
    if (saved) return saved;
  } catch (_) {}
  return signIn();
};

export const clearRevampToken = async () => {
  try { await AsyncStorage.removeItem(TOKEN_KEY); } catch (_) {}
};

const request = async (method, path, data) => {
  const send = (token) => axios({
    method,
    url: `${REVAMP_API_URL}${path}`,
    data,
    timeout: 15000,
    headers: { Authorization: `Bearer ${token}` },
  });
  try {
    return (await send(await getToken())).data;
  } catch (e) {
    if (e?.response?.status !== 401) throw e;
    return (await send(await signIn())).data;
  }
};

// Server's own error text ("Subject is required", ...) when there is one
export const apiErrorMessage = (e, fallback) => e?.response?.data?.error || fallback;

// This phone's Expo push token, so rizo-revamp can push to it directly (HR replies, ...)
export const PushTokenApi = {
  register: (pushToken, platform) => request('post', '/push-token', { push_token: pushToken, platform }),
  remove: (pushToken) => request('delete', '/push-token', { push_token: pushToken }),
};

export const HrQueriesApi = {
  list: () => request('get', '/hr-queries'),
  create: (body) => request('post', '/hr-queries', body),
  thread: (id) => request('get', `/hr-queries/${id}`),
  reply: (id, message) => request('post', `/hr-queries/${id}/messages`, { message }),
  escalate: (id) => request('post', `/hr-queries/${id}/escalate`),
};

export const TeamApi = {
  today: () => request('get', '/team-today'),
};

// Salary slips from rizo-revamp (DigitalOcean companies): approved months only, and the PDF made by the
// server with the same design as the web employee login's Download PDF.
export const PayslipsApi = {
  list: () => request('get', '/payslips'),
  // Saves the PDF into the cache folder and returns its file uri
  download: async (id, fileName) => {
    const dest = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    const get = (token) => FileSystem.downloadAsync(`${REVAMP_API_URL}/payslips/${id}/pdf`, dest, { headers: { Authorization: `Bearer ${token}` } });
    let res = await get(await getToken());
    if (res.status === 401) res = await get(await signIn());
    if (res.status !== 200) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      throw Object.assign(new Error('Could not download the payslip'), { response: { status: res.status } });
    }
    return res.uri;
  },
};

export const AnnouncementsApi = {
  list: () => request('get', '/announcements'),
  markRead: (id) => request('post', `/announcements/${id}/read`),
};
