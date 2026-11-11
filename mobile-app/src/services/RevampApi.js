import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REVAMP_API_URL, REVAMP_WEB_API_URL, API_ENDPOINTS } from '../constants/Config';
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

/** The rizo-revamp token (signs in when there is none) — for loading a website photo (services/photoSource.js). */
export const getRevampToken = () => getToken();
/** A fresh sign-in (the saved token expired) — for a website photo that failed to load. */
export const renewRevampToken = () => signIn();

export const clearRevampToken = async () => {
  try { await AsyncStorage.removeItem(TOKEN_KEY); } catch (_) {}
};

const request = async (method, path, data, base = REVAMP_API_URL) => {
  const send = (token) => axios({
    method,
    url: `${base}${path}`,
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
  // Take back a query HR hasn't replied to yet (becomes 'Withdrawn', read-only)
  withdraw: (id) => request('post', `/hr-queries/${id}/withdraw`),
};

// My Team. Read from the PHP API first — the same database the Leave Approval lists come from, so it works for
// OVH and DigitalOcean companies alike; rizo-revamp's own answer is only the fallback (older server).
export const TeamApi = {
  today: async () => {
    try {
      const user = await getLoggedUser();
      if (user?.user_id) {
        const res = await axios.post(API_ENDPOINTS.TEAM_TODAY, { user_id: user.user_id }, { timeout: 12000 });
        if (res.data && ('authorise' in res.data || 'approve' in res.data)) return res.data;
      }
    } catch (_) { /* fall through */ }
    return request('get', '/team-today');
  },
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

// The employee's own document (Profile > Other Details > Documents) stored on the website (/uploads/...):
// saved into the cache folder with the login token (the website shows those files only to a signed-in user).
export const DocumentsApi = {
  download: async (id, fileName) => {
    const dest = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    const get = (token) => FileSystem.downloadAsync(`${REVAMP_API_URL}/document/${id}`, dest, { headers: { Authorization: `Bearer ${token}` } });
    let res = await get(await getToken());
    if (res.status === 401) res = await get(await signIn());
    if (res.status !== 200) {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      throw Object.assign(new Error('Could not open the document'), { response: { status: res.status } });
    }
    return res.uri;
  },
};

export const AnnouncementsApi = {
  list: () => request('get', '/announcements'),
  markRead: (id) => request('post', `/announcements/${id}/read`),
};

// The web employee login's own routes (rizo-revamp lib/appSession.ts accepts this app's token on them), so the
// approvals and Advance & Loan requests run exactly the web's rules. The server always acts as the signed-in
// employee: a queue query's empFkey is forced to the caller's own.
const web = (method, path, data) => request(method, path, data, REVAMP_WEB_API_URL);

export const LeaveApprovalsApi = {
  // Leaves where the caller is authorizer or approver
  queue: (empFkey) => web('get', `/leave/requests?authorizerFkey=${empFkey}&approverFkey=${empFkey}`),
  details: (id) => web('get', `/leave/requests/${id}/details`),
  // action: authorize | approve | reject | cancellation/approve | cancellation/reject
  act: (id, action, remarks) => web('post', `/leave/requests/${id}/${action}`, { remarks: remarks || '' }),
};

export const ExpenseApprovalsApi = {
  queue: (empFkey) => web('get', `/expenses?authorizerFkey=${empFkey}&approverFkey=${empFkey}`),
  // action: authorize | approve | reject
  act: (id, action, remarks) => web('put', `/expenses/${id}/${action}`, { remarks: remarks || '' }),
};

export const AdvanceLoanApi = {
  people: () => web('get', '/advance-loan/people'),
  advanceLimit: (empFkey) => web('get', `/advances/limit?empFkey=${empFkey}`),
  advances: () => web('get', '/advances/requests'),
  loans: () => web('get', '/loans/requests'),
  applyAdvance: (body) => web('post', '/advances/requests', body),
  applyLoan: (body) => web('post', '/loans/requests', body),
  withdraw: (kind, id) => web('delete', `/${kind === 'advance' ? 'advances' : 'loans'}/requests/${id}`),
  // Requests the caller authorizes / approves
  queue: () => Promise.all([web('get', '/advances/requests?queue=1'), web('get', '/loans/requests?queue=1')]),
  // action: authorize | approve | reject
  act: (kind, id, action, remarks) => web('post', `/${kind === 'advance' ? 'advances' : 'loans'}/requests/${id}/${action}`, { remarks: remarks || undefined }),
};

// Requests › Resignation (web ESS My Requests › Resignation): the current request (or null), whether admin
// started the separation, the Authorize By people and the reasons; apply; withdraw
export const ResignationApi = {
  get: () => web('get', '/ess/resignation'),
  apply: (body) => web('post', '/ess/resignation', body),
  withdraw: () => web('post', '/ess/resignation/withdraw'),
};
