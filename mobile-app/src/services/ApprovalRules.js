// edited by Bindhu 28-11-2026
// Which of authorizer / approver a team member's request is for the viewer, and whether it waits on them now — the web
// employee login's rules (rowStateFor / expenseRowStateFor). Shared by the Approvals screens (EssLeaveApprovalScreen,
// EssExpenseApprovalScreen) and the "waiting for your approval" reminder at sign-in (services/PendingApprovals.js), so
// both always count the same requests. Advance & Loan: services/AdvanceLoanStage.js viewerRowState.

const LEAVE_HISTORY_STATUSES = ['Authorized', 'Rejected', 'Approved', 'CancellationOfAuthorized', 'CancellationOfApproved', 'Cancelled', 'CancelledByAdmin', 'Cancellation Authorized', 'Cancellation Approved'];

export const leaveRowState = (row, empId) => {
  const isAuthorizer = Number(row.ISAutherizedby) === empId;
  const isApprover = Number(row.APPROVEDBY) === empId;
  if (!isAuthorizer && !isApprover) return null;
  if (isAuthorizer && row.LEAVESTATUS === 'Applied') return { kind: 'pending', primary: 'authorize' };
  if (isAuthorizer && row.LEAVESTATUS === 'CancellationOfAuthorized') return { kind: 'pending', cancellation: true };
  if (isApprover && row.LEAVESTATUS === 'Authorized' && !row.APPROVED_date) return { kind: 'pending', primary: 'approve' };
  if (isApprover && row.LEAVESTATUS === 'CancellationOfApproved') return { kind: 'pending', cancellation: true };
  if (LEAVE_HISTORY_STATUSES.includes(row.LEAVESTATUS)) return { kind: 'history' };
  return null;
};

// authorized_by / approved_by are varchar columns — compared as numbers
export const expenseRowState = (row, empId) => {
  const isAuthorizer = row.authorized_by != null && Number(row.authorized_by) === empId;
  const isApprover = row.approved_by != null && Number(row.approved_by) === empId;
  if (!isAuthorizer && !isApprover) return null;
  if (isAuthorizer && row.expense_status === 'Applied') return { kind: 'pending', primary: 'authorize' };
  if (isApprover && row.expense_status === 'Authorized') return { kind: 'pending', primary: 'approve' };
  if (['Authorized', 'Approved', 'Rejected'].includes(row.expense_status)) return { kind: 'history' };
  return null;
};
// end
