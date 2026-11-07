// Salary Advance / Loan request Authorize → Approve stage rules — a copy of rizo-revamp's lib/advanceLoanStage.ts,
// which the web employee login's Approvals page and the API both use, so the app sorts rows into Pending / History
// exactly like the web. Rows come from /api/advances|loans/requests (request_status, authorizer_fkeys,
// approver_fkeys as comma lists, authorized_date).

export const parseFkeys = (csv) => (csv ? String(csv).split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0) : []);

// Whose turn it is: no authorizers skips straight to the approvers; neither list = left to admin
export const nextActorRole = (row) => {
  const authorizers = parseFkeys(row.authorizer_fkeys);
  const approvers = parseFkeys(row.approver_fkeys);
  if (row.request_status === 'Pending') {
    if (authorizers.length) return 'authorizer';
    return approvers.length ? 'approver' : null;
  }
  if (row.request_status === 'Authorized') return approvers.length ? 'approver' : null;
  return null;
};

export const canActOn = (row, empFkey) => {
  const next = nextActorRole(row);
  if (!next) return false;
  return parseFkeys(next === 'authorizer' ? row.authorizer_fkeys : row.approver_fkeys).includes(empFkey);
};

// { kind: 'pending', action } for whoever acts next, { kind: 'history' } once the viewer's stage is behind it,
// null while it hasn't reached them
export const viewerRowState = (row, empFkey) => {
  if (canActOn(row, empFkey)) {
    return { kind: 'pending', action: nextActorRole(row) === 'authorizer' ? 'authorize' : 'approve' };
  }
  const isAuthorizer = parseFkeys(row.authorizer_fkeys).includes(empFkey);
  const isApprover = parseFkeys(row.approver_fkeys).includes(empFkey);
  const settled = ['Authorized', 'Approved', 'Rejected', 'Deleted'].includes(row.request_status);
  if (isAuthorizer && settled) return { kind: 'history' };
  const reachedApprover = !parseFkeys(row.authorizer_fkeys).length || !!row.authorized_date;
  if (isApprover && reachedApprover && ['Approved', 'Rejected', 'Deleted'].includes(row.request_status)) {
    return { kind: 'history' };
  }
  return null;
};

export const ADVANCE_LOAN_STATUS_COLOR = {
  Pending: { bg: '#EFF6FF', color: '#1D4ED8' },
  Authorized: { bg: '#FEFCE8', color: '#854D0E' },
  Approved: { bg: '#F0FDF4', color: '#166534' },
  Rejected: { bg: '#FEF2F2', color: '#991B1B' },
  Deleted: { bg: '#F3F4F6', color: '#374151' },
};
