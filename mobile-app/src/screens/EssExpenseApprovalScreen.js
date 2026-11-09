import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text } from '../components/AppText';
import { useFocusEffect } from '@react-navigation/native';
import { moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import TeamAvatar from '../components/TeamAvatar';
import { ExpenseApprovalsApi } from '../services/RevampApi';
import { revampFileUrl } from '../constants/Config';
import {
  EssScreen, SegTabs, StatusChip, Card, InfoRows, FileLink, ActionButton, EmptyState, ActionSheet, Loading,
  fmtDate, fmtAmt, resolveEmpId, FilterBar, ALL, monthFilterOptions, valueFilterOptions, monthOf, rangeInMonth, currentMonth,
} from '../components/EssUi';

// Approvals › Expense, the web employee login's ESS Approvals › Expense: the same /api/expenses queue and
// authorize / approve / reject routes, role split, statuses and claim details (ExpenseDetailsModal).

const STATUS_COLOR = {
  Applied: { bg: '#EFF6FF', color: '#1D4ED8' },
  Authorized: { bg: '#FEFCE8', color: '#854D0E' },
  Approved: { bg: '#F0FDF4', color: '#166534' },
  Rejected: { bg: '#FEF2F2', color: '#991B1B' },
};
const LABELS = { authorize: 'Authorize', approve: 'Approve', reject: 'Reject' };

// authorized_by / approved_by are varchar columns — compared as numbers (web expenseRowStateFor)
const rowStateFor = (row, empId) => {
  const isAuthorizer = row.authorized_by != null && Number(row.authorized_by) === empId;
  const isApprover = row.approved_by != null && Number(row.approved_by) === empId;
  if (!isAuthorizer && !isApprover) return null;
  if (isAuthorizer && row.expense_status === 'Applied') return { kind: 'pending', primary: 'authorize' };
  if (isApprover && row.expense_status === 'Authorized') return { kind: 'pending', primary: 'approve' };
  if (['Authorized', 'Approved', 'Rejected'].includes(row.expense_status)) return { kind: 'history' };
  return null;
};

const fullName = (r) => `${r.first_name} ${r.last_name || ''}`.trim();
const empCode = (r) => (r.emp_company_id || '').trim() || r.emp_id;

// The claim, as the web's ExpenseDetailsModal shows it
export const ExpenseDetails = ({ row }) => {
  const theme = useTheme();
  const file = revampFileUrl(row.image);
  return (
    <>
      <View style={s.detailHead}>
        <TeamAvatar person={{ name: fullName(row), profilePic: row.profile_pic }} size={moderateScale(40)} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.name, { color: theme.text }]}>{fullName(row)}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]}>{empCode(row)}</Text>
        </View>
        <StatusChip status={row.expense_status} colors={STATUS_COLOR} />
      </View>
      <Text style={[s.sub, { color: theme.textMuted }]}>{row.expense_type}</Text>
      <Text style={[s.amount, { color: theme.text }]}>{fmtAmt(row.expenses_amount)}</Text>
      <InfoRows rows={[
        ['Expense Date', fmtDate(row.expense_date || row.affected_month)],
        ['Applied On', fmtDate(row.created_date)],
        ['Vendor', row.vendor],
        ['Purpose', row.purpose],
        ['Remarks', row.remarks],
        ['Authorized By', row.authorized_by_name],
        row.authorized_date ? ['Authorized On', fmtDate(row.authorized_date)] : null,
        row.remarks_auth ? ['Authorizer Remarks', row.remarks_auth] : null,
        // A rejection: who and when (stored since 2026-11-07), instead of the approver rows
        ...(row.expense_status === 'Rejected' && row.rejected_date
          ? [['Rejected By', row.rejected_by_name], ['Rejected On', fmtDate(row.rejected_date)], row.remarks_approved ? ['Rejection Remarks', row.remarks_approved] : null]
          : [['Approved By', row.approved_by_name], row.approved_date ? ['Approved On', fmtDate(row.approved_date)] : null, row.remarks_approved ? ['Approver Remarks', row.remarks_approved] : null]),
        ['Attachment', file ? <FileLink url={file} label="View attachment" /> : '—'],
      ]} />
    </>
  );
};

const EssExpenseApprovalScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route.params?.user;
  const [empId, setEmpId] = useState(Number(user?.emp_pkey) || 0);
  const [tab, setTab] = useState('pending');
  // History: this month by default; Pending ignores the month so nothing waiting on you is hidden
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState(null); // { row, action } — action null = View
  const load = async () => {
    setError(false);
    try {
      const me = await resolveEmpId(user);
      setEmpId(me);
      const d = await ExpenseApprovalsApi.queue(me);
      setRows(d.data || []);
    } catch (_) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const list = rows
    .map((row) => ({ row, state: rowStateFor(row, empId) }))
    .filter((x) => x.state && x.state.kind === tab);
  const typeOf = (row) => row.expense_type;
  const inMonth = (row) => month === ALL || monthOf(row.expense_date || row.affected_month || row.created_date) === month;
  const shown = list.filter(({ row }) => (type === ALL || typeOf(row) === type)
    && (tab === 'pending' || (inMonth(row) && (status === ALL || row.expense_status === status))));

  const renderItem = ({ item: { row, state } }) => (
    <Card>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{fullName(row)}</Text>
          <Text style={[s.sub, { color: theme.textMuted }]}>{empCode(row)}</Text>
        </View>
        <StatusChip status={row.expense_status} colors={STATUS_COLOR} />
      </View>
      <InfoRows rows={[
        ['Expense Type', row.expense_type],
        ['Amount', fmtAmt(row.expenses_amount)],
        ['Expense Date', fmtDate(row.expense_date || row.affected_month)],
        ['Applied On', fmtDate(row.created_date)],
      ]} />
      <View style={s.actions}>
        <ActionButton label="View" outline onPress={() => setSheet({ row, action: null })} />
        {tab === 'pending' && state.kind === 'pending' && (
          <>
            <ActionButton label={LABELS[state.primary]} tone={state.primary} soft onPress={() => setSheet({ row, action: state.primary })} />
            <ActionButton label="Reject" tone="reject" soft onPress={() => setSheet({ row, action: 'reject' })} />
          </>
        )}
      </View>
    </Card>
  );

  const act = sheet?.action;
  return (
    <EssScreen title="Expense Approvals" onBack={() => navigation.goBack()}>
      <SegTabs tabs={[{ key: 'pending', label: 'Pending' }, { key: 'history', label: 'History' }]} active={tab} onChange={(t) => { setTab(t); setType(ALL); setStatus(ALL); }} />
      <FilterBar filters={[
        tab === 'history' ? { key: 'month', kind: 'month', value: month, options: monthFilterOptions(), onChange: setMonth } : null,
        { key: 'type', kind: 'list', value: type, options: valueFilterOptions('All expense types', list.map(({ row }) => typeOf(row))), onChange: setType },
        tab === 'history' ? { key: 'status', kind: 'list', value: status, options: valueFilterOptions('All statuses', list.map(({ row }) => row.expense_status), {}), onChange: setStatus } : null,
      ]} />
      {loading ? <Loading /> : (
        <FlatList
          data={shown}
          keyExtractor={(x) => String(x.row.emp_expenses_pkey)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: moderateScale(32) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState text={error ? 'Could not load. Pull to retry.' : list.length > 0 ? 'No records match these filters.' : tab === 'pending' ? "No pending approvals — you're all caught up!" : 'No records found.'} />}
        />
      )}
      <ActionSheet
        visible={!!sheet}
        title={act ? `${LABELS[act]} Expense Claim` : 'Expense Claim'}
        remark={act ? { required: act === 'reject', maxLength: 100 } : null}
        confirmLabel={act ? LABELS[act] : null}
        confirmTone={act}
        cancelLabel={act ? 'Cancel' : 'Close'}
        onClose={() => setSheet(null)}
        onConfirm={async (remarks) => {
          await ExpenseApprovalsApi.act(sheet.row.emp_expenses_pkey, act, remarks);
          setSheet(null);
          load();
        }}
      >
        {sheet && <ExpenseDetails row={sheet.row} />}
      </ActionSheet>
    </EssScreen>
  );
};

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  detailHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  name: { fontSize: moderateScale(14.5), fontWeight: '800' },
  sub: { fontSize: moderateScale(11.5), marginTop: 1 },
  amount: { fontSize: moderateScale(20), fontWeight: '800', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8 },
});

export default EssExpenseApprovalScreen;
