import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { getLoggedUser, saveAuditEvents, getAuditEvents, deleteAuditEvents } from './LocalDB';
import { AuditApi } from './RevampApi';
import { rizoNewFor } from './CompanyFeatures';

// The app's audit trail: every screen opened, every tap, every field filled and the actions themselves (punch,
// visit steps …) of the signed-in employee, for the company's Audit Trail report (rizo-revamp
// /api/mobile/audit-events → audit_log, "Mobile App"). Rizo-new companies (the server decides: $doCompanyCodes) only — the other companies have no audit trail.
//
//   record()  keeps the event in memory and writes it to the phone's database within a second (in one statement,
//             so it never holds up a punch being saved); offline the same — `offline` says whether the phone had
//             internet at that moment, and the report shows "Mobile · offline".
//   upload    in the order they happened, UPLOAD_BATCH at a time, whenever there is internet: every
//             UPLOAD_EVERY_MS and when the app goes to the background. An event leaves the phone only after the
//             server has stored it (a resent one is not stored twice).
// Each employee's events are sent with that employee's own login only: a phone shared by two people never files
// one person's taps under the other.
// Typed passwords / PINs are never kept (services/TapRecorder.js). Nothing here may ever break the app: every
// failure is swallowed.

const FLUSH_MS = 800;
const RETRY_WRITE_MS = 3000;
const UPLOAD_EVERY_MS = 30 * 1000;
const UPLOAD_BATCH = 200;
const USER_TTL_MS = 30 * 1000;

let buffer = [];
let flushTimer = null;
let screen = null;
let online = true;
let seq = 0;
let started = false;
let uploading = false;
let user = { at: 0, id: null };

const newId = () => {
  seq = (seq + 1) % 1000000;
  return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

/** The signed-in employee's user_id when their company is Rizo-new (the server decides: $doCompanyCodes), else null (read again at most every USER_TTL_MS) */
const currentUser = async (force) => {
  if (!force && Date.now() - user.at < USER_TTL_MS) return user.id;
  let id = null;
  try {
    const u = await getLoggedUser();
    id = u?.user_id && (await rizoNewFor(u.user_id)) ? String(u.user_id) : null;
  } catch (_) { id = null; }
  user = { at: Date.now(), id };
  return id;
};

const flush = async () => {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!buffer.length) return;
  const events = buffer;
  buffer = [];
  try {
    // Each event belongs to whoever was signed in when it happened; one recorded before the user was known gets
    // the user now (none signed in: not anyone's, dropped)
    const id = await currentUser(false);
    const mine = events.map((e) => ({ ...e, userId: e.userId || id })).filter((e) => e.userId);
    await saveAuditEvents(mine);
  } catch (_) {
    buffer = events.concat(buffer).slice(-5000); // kept for the next try (bounded: never grows without end)
    if (!flushTimer) flushTimer = setTimeout(flush, RETRY_WRITE_MS); // tried again even if nothing else is tapped
  }
};

/**
 * One event. label: what happened, read after the person's name in the report ("tapped \"OK\"", "opened Home").
 * details: { name: value } shown under it.
 */
export const recordAudit = (label, details) => {
  try {
    if (!label) return;
    if (Date.now() - user.at >= USER_TTL_MS) currentUser(false); // refreshed for the next ones, not awaited
    buffer.push({
      id: newId(),
      userId: user.id, // null until known: filled in when written
      at: new Date().toISOString(),
      label: String(label).slice(0, 255),
      screen: screen || undefined,
      details: details && Object.keys(details).length ? details : undefined,
      offline: !online,
    });
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  } catch (_) { /* never break the app */ }
};

const SCREEN_NAMES = {
  HomeTab: 'Home', RequestsTab: 'Requests', ApprovalsTab: 'Approvals', ProfileTab: 'Profile', AttendanceReg: 'Regularisation',
  RegularisationApproval: 'Regularisation Approval', LeaveApproval: 'Leave Approval', HrConnect: 'HR Connect', HrQueryThread: 'HR conversation',
  EventsList: 'Events', MyTeam: 'My Team', EssLeaveApproval: 'Leave Approvals', EssExpenseApproval: 'Expense Approvals',
  EssAdvanceLoanApproval: 'Advance & Loan Approvals', EssAdvanceLoan: 'Advance & Loan', EssResignation: 'Resignation',
  Visits: 'Client Visits', Salary: 'Payslip', ForgotPassword: 'Forgot Password',
};
export const screenName = (route) => SCREEN_NAMES[route] || String(route || '').replace(/([a-z])([A-Z])/g, '$1 $2');

/** The screen now on top (App.js navigation): recorded as "opened <screen>" and kept for the next events. */
export const setAuditScreen = (route) => {
  const name = screenName(route);
  if (!name || name === screen) return;
  screen = name;
  // A screen opened right after sign-in / before sign-out is checked against the user again
  if (/Login|Welcome|Splash|Signup/.test(route || '')) currentUser(true);
  recordAudit(`opened ${name}`);
};

export const uploadAudit = async () => {
  if (uploading || !online) return;
  uploading = true;
  try {
    await flush();
    const id = await currentUser(true);
    if (!id) return;
    for (let round = 0; round < 50; round += 1) {
      const events = await getAuditEvents(id, UPLOAD_BATCH);
      if (!events.length) return;
      const res = await AuditApi.send(events);
      const done = [...(res?.accepted || []), ...(res?.dropped || [])];
      if (!done.length) return; // nothing stored: tried again later
      await deleteAuditEvents(done);
      if (events.length < UPLOAD_BATCH) return;
    }
  } catch (e) {
    // 403: this company has no audit trail (no longer a Rizo-new company — the server decides: $doCompanyCodes) — keep quiet until next time
  } finally {
    uploading = false;
  }
};

/** Before signing out: "signed out" is filed under this user, and what can be sent goes now (the rest waits on the phone). */
export const auditSignOut = async () => {
  try {
    await currentUser(true);
    recordAudit('signed out');
    await flush();
    await Promise.race([uploadAudit(), new Promise((r) => setTimeout(r, 4000))]);
  } catch (_) { /* never blocks signing out */ }
  user = { at: Date.now(), id: null };
};

/** Right after signing in */
export const auditSignIn = async () => {
  try {
    await currentUser(true);
    recordAudit('signed in');
  } catch (_) { /* never blocks signing in */ }
};

/** Starts the network watch, the upload timer and the app open / close events. Once, from App.js. */
export const startAuditTrail = () => {
  if (started) return;
  started = true;
  const apply = (s) => { online = !!s?.isConnected && s?.isInternetReachable !== false; };
  Network.getNetworkStateAsync().then(apply).catch(() => {});
  try {
    Network.addNetworkStateListener((s) => {
      const was = online;
      apply(s);
      if (!was && online) uploadAudit(); // back online: send what was kept
    });
  } catch (_) { /* older expo-network: the timer below still sends them */ }
  setInterval(uploadAudit, UPLOAD_EVERY_MS);
  recordAudit('opened the app');
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      recordAudit('opened the app');
      uploadAudit();
    } else if (state === 'background') {
      recordAudit('left the app');
      flush().then(uploadAudit).catch(() => {});
    }
  });
};

// For tests
export const __auditState = () => ({ buffer, screen, online, user });
