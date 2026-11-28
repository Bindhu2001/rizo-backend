// edited by Bindhu 28-11-2026
// "Waiting for your approval" at sign-in. A request pushed while the approver was signed out (or signed in on another
// phone, or a shared phone was someone else's) never reaches them as a push, so the first status check after a
// sign-in counts what waits on them in the Approvals tab and says so once:
//   "You have 2 leave requests and 1 expense claim waiting for your approval."
// Counted with the same lists and rules as the Approvals screens:
//   Leave            new server: LeaveApprovalsApi + leaveRowState   other companies: PHP leave_hierarchy_list
//   Regularisation   PHP regularisation_hierarchy_list (this month and last)
//   Expense          new server only: ExpenseApprovalsApi + expenseRowState
//   Advance & Loan   new server only: AdvanceLoanApi + viewerRowState
// A menu switched off for this employee (Menu Allocation) is not counted.
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';
import { rizoNewFor } from './CompanyFeatures';
import { loadMenuAccess } from './MenuAccess';
import { LeaveApprovalsApi, ExpenseApprovalsApi, AdvanceLoanApi } from './RevampApi';
import { leaveRowState, expenseRowState } from './ApprovalRules';
import { viewerRowState } from './AdvanceLoanStage';

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const formOf = (fields) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  return fd;
};
const countPending = (rows, stateOf, empId) => (rows || []).filter((r) => stateOf(r, empId)?.kind === 'pending').length;

const phpLeaves = async (userId) => {
  const res = await axios.post(`${API_ENDPOINTS.LEAVE_HIERARCHY}?user_id=${userId}`, formOf({ user_id: userId }),
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 10000 });
  if (!res.data?.success) return 0;
  const { authorizer_leaves = [], approver_leaves = [] } = res.data.data || {};
  // A leave in both lists is one request (already past authorisation)
  return new Set([...authorizer_leaves, ...approver_leaves].map((l) => String(l.LEAVEENTRYID || l.leave_id))).size;
};

const phpRegularisations = async (userId) => {
  const now = new Date();
  const months = [monthKey(now), monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
  const ids = new Set();
  for (const month of months) {
    const res = await axios.post(`${API_ENDPOINTS.REGULARISATION_HIERARCHY}?user_id=${userId}&month=${month}`,
      formOf({ user_id: userId, month }), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 10000 });
    if (res.data?.success) {
      (res.data.data || []).forEach((r, i) => ids.add(String(r.id || r.emp_attendance_regularisation_pkey || `${month}_${i}`)));
    }
  }
  return ids.size;
};

const advanceLoanCounts = async (empId) => {
  const [advances, loans] = await AdvanceLoanApi.queue();
  return {
    advance: countPending(advances?.rows, viewerRowState, empId),
    loan: countPending(loans?.rows, viewerRowState, empId),
  };
};

/**
 * How many requests wait on this user, per kind: { leave, regularisation, expense, advance, loan }.
 * null when nothing could be read (offline / server down) — then the reminder is tried again on the next check.
 */
export const countPendingApprovals = async (user) => {
  const userId = user?.user_id;
  const empId = Number(user?.emp_pkey) || 0;
  if (!userId) return null;
  await loadMenuAccess(userId).catch(() => {});
  let menus = null;
  try { menus = JSON.parse((await AsyncStorage.getItem(`menu_access_${userId}`)) || 'null'); } catch (_) {}
  const allowed = (key) => !menus || !menus[key] || menus[key] === 'Y';
  const rizoNew = await rizoNewFor(userId).catch(() => false);

  const counts = { leave: 0, regularisation: 0, expense: 0, advance: 0, loan: 0 };
  let read = 0;
  const run = async (key, job, apply) => {
    if (!allowed(key)) return;
    try { apply(await job()); read += 1; } catch (_) {}
  };
  await Promise.all([
    run('approvals.leave',
      () => (rizoNew && empId ? LeaveApprovalsApi.queue(empId).then((d) => countPending(d?.data, leaveRowState, empId)) : phpLeaves(userId)),
      (n) => { counts.leave = n; }),
    run('approvals.regularisation', () => phpRegularisations(userId), (n) => { counts.regularisation = n; }),
    rizoNew && empId ? run('approvals.expense',
      () => ExpenseApprovalsApi.queue(empId).then((d) => countPending(d?.data, expenseRowState, empId)),
      (n) => { counts.expense = n; }) : null,
    rizoNew && empId ? run('approvals.advance-loan', () => advanceLoanCounts(empId),
      (c) => { counts.advance = c.advance; counts.loan = c.loan; }) : null,
  ]);
  return read > 0 ? counts : null;
};

const NAMES = {
  leave: ['leave request', 'leave requests'],
  regularisation: ['regularisation', 'regularisations'],
  expense: ['expense claim', 'expense claims'],
  advance: ['salary advance request', 'salary advance requests'],
  loan: ['loan request', 'loan requests'],
};

/** "You have 2 leave requests and 1 expense claim waiting for your approval." — null when nothing waits */
export const pendingApprovalsMessage = (counts) => {
  if (!counts) return null;
  const parts = Object.keys(NAMES)
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${NAMES[k][counts[k] === 1 ? 0 : 1]}`);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `You have ${list} waiting for your approval.`;
};
// end
