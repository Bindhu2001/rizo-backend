import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text } from '../components/AppText';
import { useFocusEffect } from '@react-navigation/native';
import { moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { AdvanceLoanApi } from '../services/RevampApi';
import { viewerRowState, ADVANCE_LOAN_STATUS_COLOR } from '../services/AdvanceLoanStage';
import {
  EssScreen, SegTabs, StatusChip, Card, InfoRows, ActionButton, EmptyState, ActionSheet, Loading,
  fmtDate, fmtAmt, fmtPercent, resolveEmpId, FilterBar, ALL, monthFilterOptions, valueFilterOptions, monthOf, rangeInMonth, currentMonth,
} from '../components/EssUi';

// Approvals › Advance & Loan, the web employee login's ESS Approvals › Advance & Loan: salary advance and loan
// requests the viewer was listed on as authorizer / approver (/api/advances|loans/requests?queue=1), the same
// stage rules (services/AdvanceLoanStage.js), details and authorize / approve / reject routes.

const LABELS = { authorize: 'Authorize', approve: 'Approve', reject: 'Reject' };

const detailText = (row) => (row.kind === 'advance'
  ? `Salary advance · deduct in ${row.affected_month}`
  : `Loan · ${row.tenure} months @ ${fmtPercent(row.intrest_rate)} · EMI from ${row.emi_start_month}`);

const EssAdvanceLoanApprovalScreen = ({ navigation, route }) => {
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
  const [sheet, setSheet] = useState(null); // { row, action }

  const load = async () => {
    setError(false);
    try {
      const me = await resolveEmpId(user);
      setEmpId(me);
      const [advances, loans] = await AdvanceLoanApi.queue();
      const merged = [
        ...(advances.rows || []).map((r) => ({ ...r, kind: 'advance', id: Number(r.emp_advance_request_pkey), amount: Number(r.advance_amount) })),
        ...(loans.rows || []).map((r) => ({ ...r, kind: 'loan', id: Number(r.emp_loan_request_pkey), amount: Number(r.loan_amount) })),
      ];
      merged.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
      setRows(merged);
    } catch (_) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const list = rows
    .map((row) => ({ row, state: viewerRowState(row, empId) }))
    .filter((x) => x.state && x.state.kind === tab);
  const typeOf = (row) => (row.kind === 'advance' ? 'Salary Advance' : 'Loan');
  const inMonth = (row) => month === ALL || monthOf(row.created_date) === month;
  const shown = list.filter(({ row }) => (type === ALL || typeOf(row) === type)
    && (tab === 'pending' || (inMonth(row) && (status === ALL || row.request_status === status))));

  const renderItem = ({ item: { row, state } }) => (
    <Card>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{row.emp_name}</Text>
          {!!row.emp_id && <Text style={[s.sub, { color: theme.textMuted }]}>{row.emp_id}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '45%', marginLeft: moderateScale(8) }}>
          <StatusChip status={row.request_status} colors={ADVANCE_LOAN_STATUS_COLOR} />
          {row.request_status === 'Authorized' && !!row.authorized_by_name && (
            <Text style={[s.sub, { color: theme.textMuted, marginTop: 3 }]} numberOfLines={1}>by {row.authorized_by_name}</Text>
          )}
        </View>
      </View>
      <InfoRows rows={[
        ['Type', row.kind === 'advance' ? 'Salary Advance' : 'Loan'],
        ['Amount', fmtAmt(row.amount)],
        ['Details', row.kind === 'advance'
          ? `Month ${row.affected_month}`
          : `${row.tenure} mo @ ${fmtPercent(row.intrest_rate)} from ${row.emi_start_month}`],
        row.remarks ? ['Remarks', row.remarks] : null,
        ['Applied On', fmtDate(row.created_date)],
        row.authorized_date ? ['Authorized On', fmtDate(row.authorized_date)] : null,
        (row.request_status === 'Approved' || row.request_status === 'Rejected') && row.reviewed_date
          ? [`${row.request_status} On`, `${fmtDate(row.reviewed_date)}${row.reviewed_by_name ? ` by ${row.reviewed_by_name}` : ''}`] : null,
        row.request_status === 'Rejected' && row.admin_remarks ? ['Rejection Remarks', row.admin_remarks] : null,
      ]} />
      {tab === 'pending' && state.kind === 'pending' && (
        <View style={s.actions}>
          <ActionButton label={LABELS[state.action]} tone={state.action} soft onPress={() => setSheet({ row, action: state.action })} />
          <ActionButton label="Reject" tone="reject" soft onPress={() => setSheet({ row, action: 'reject' })} />
        </View>
      )}
    </Card>
  );

  const act = sheet?.action;
  const r = sheet?.row;
  return (
    <EssScreen title="Advance & Loan Approvals" onBack={() => navigation.goBack()}>
      <SegTabs tabs={[{ key: 'pending', label: 'Pending' }, { key: 'history', label: 'History' }]} active={tab} onChange={(t) => { setTab(t); setType(ALL); setStatus(ALL); }} />
      <FilterBar filters={[
        tab === 'history' ? { key: 'month', kind: 'month', value: month, options: monthFilterOptions(), onChange: setMonth } : null,
        { key: 'type', kind: 'list', value: type, options: valueFilterOptions('Advance & Loan', list.map(({ row }) => typeOf(row))), onChange: setType },
        tab === 'history' ? { key: 'status', kind: 'list', value: status, options: valueFilterOptions('All statuses', list.map(({ row }) => row.request_status), {}), onChange: setStatus } : null,
      ]} />
      {loading ? <Loading /> : (
        <FlatList
          data={shown}
          keyExtractor={(x) => `${x.row.kind}-${x.row.id}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: moderateScale(32) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState text={error ? 'Could not load. Pull to retry.' : list.length > 0 ? 'No records match these filters.' : tab === 'pending' ? "No pending advance or loan requests — you're all caught up!" : 'No records found.'} />}
        />
      )}
      <ActionSheet
        visible={!!sheet}
        title={r ? `${LABELS[act]} ${r.kind === 'advance' ? 'Salary Advance' : 'Loan'} Request` : ''}
        remark={{ required: act === 'reject', maxLength: 500 }}
        confirmLabel={LABELS[act]}
        confirmTone={act}
        onClose={() => setSheet(null)}
        onConfirm={async (remarks) => {
          await AdvanceLoanApi.act(r.kind, r.id, act, remarks);
          setSheet(null);
          load();
        }}
      >
        {r && (
          <InfoRows rows={[
            ['Employee', `${String(r.emp_name || '').trim()}${r.emp_id ? ` (${r.emp_id})` : ''}`],
            ['Request', detailText(r)],
            ['Amount', fmtAmt(r.amount)],
            ['Employee remarks', r.remarks || '—'],
            ['Authorizers', r.authorizer_names || '—'],
            ['Approvers', r.approver_names || 'Admin'],
            r.authorized_by_name ? ['Authorized by', `${r.authorized_by_name}${r.authorizer_remarks ? ` — ${r.authorizer_remarks}` : ''}`] : null,
          ]} />
        )}
      </ActionSheet>
    </EssScreen>
  );
};

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  name: { fontSize: moderateScale(14.5), fontWeight: '800' },
  sub: { fontSize: moderateScale(11.5), marginTop: 1 },
  actions: { flexDirection: 'row', gap: 8 },
});

export default EssAdvanceLoanApprovalScreen;
