import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import TeamAvatar from '../components/TeamAvatar';
import { LeaveApprovalsApi } from '../services/RevampApi';
import { revampFileUrl } from '../constants/Config';
import {
  EssScreen, SegTabs, StatusChip, Card, InfoRows, FileLink, ActionButton, EmptyState, ActionSheet, Loading,
  fmtDate, resolveEmpId, FilterBar, ALL, monthFilterOptions, valueFilterOptions, monthOf, rangeInMonth, currentMonth,
} from '../components/EssUi';

// Approvals › Leave, the web employee login's ESS Approvals › Leave (rizo-revamp /ess/approvals): the same
// /api/leave/requests queue and action routes, the same role split, statuses, details and remarks rules.

const STATUS_COLOR = {
  Applied: { bg: '#EFF6FF', color: '#1D4ED8' },
  Authorized: { bg: '#FEFCE8', color: '#854D0E' },
  Approved: { bg: '#F0FDF4', color: '#166534' },
  Rejected: { bg: '#FEF2F2', color: '#991B1B' },
  Cancelled: { bg: '#F3F4F6', color: '#374151' },
  CancelledByAdmin: { bg: '#F3F4F6', color: '#374151' },
  CancellationOfAuthorized: { bg: '#FDF4FF', color: '#86198F' },
  CancellationOfApproved: { bg: '#FDF4FF', color: '#86198F' },
  'Cancellation Authorized': { bg: '#F3F4F6', color: '#374151' },
  'Cancellation Approved': { bg: '#F3F4F6', color: '#374151' },
};
const STATUS_LABEL = {
  CancellationOfAuthorized: 'Cancellation of Authorized',
  CancellationOfApproved: 'Cancellation of Approved',
  CancelledByAdmin: 'Cancelled by Admin',
};
const HISTORY_STATUSES = ['Authorized', 'Rejected', 'Approved', 'CancellationOfAuthorized', 'CancellationOfApproved', 'Cancelled', 'CancelledByAdmin', 'Cancellation Authorized', 'Cancellation Approved'];

// Which of authorizer / approver this row is for the viewer, and what they may do now (web rowStateFor)
const rowStateFor = (row, empId) => {
  const isAuthorizer = Number(row.ISAutherizedby) === empId;
  const isApprover = Number(row.APPROVEDBY) === empId;
  if (!isAuthorizer && !isApprover) return null;
  if (isAuthorizer && row.LEAVESTATUS === 'Applied') return { kind: 'pending', primary: 'authorize' };
  if (isAuthorizer && row.LEAVESTATUS === 'CancellationOfAuthorized') return { kind: 'pending', cancellation: true };
  if (isApprover && row.LEAVESTATUS === 'Authorized' && !row.APPROVED_date) return { kind: 'pending', primary: 'approve' };
  if (isApprover && row.LEAVESTATUS === 'CancellationOfApproved') return { kind: 'pending', cancellation: true };
  if (HISTORY_STATUSES.includes(row.LEAVESTATUS)) return { kind: 'history' };
  return null;
};

const LABELS = {
  authorize: 'Authorize', approve: 'Approve', reject: 'Reject',
  'cancellation/approve': 'Confirm Cancellation', 'cancellation/reject': 'Keep Leave Active',
};

const LeaveDetails = ({ id }) => {
  const theme = useTheme();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    LeaveApprovalsApi.details(id).then((d) => alive && setDetails(d)).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);
  if (loading) return <Text style={{ color: theme.textMuted, fontSize: moderateScale(12.5), marginBottom: 12 }}>Loading details…</Text>;
  if (!details) return null;
  return (
    <>
      <InfoRows rows={[
        ['Leave Balance', details.leaveBalance],
        ['Sandwich Leave', details.isSandwich ? 'Yes' : 'No'],
        details.reason ? ['Reason', details.reason] : null,
        details.documents?.length ? ['Documents', (
          <View>{details.documents.map((d, i) => <FileLink key={i} url={revampFileUrl(d.href || d.name)} label={d.label || d.type || d.name} />)}</View>
        )] : null,
      ]} />
      <Text style={[s.sectionLabel, { color: theme.textMuted }]}>LEAVE DAYS</Text>
      <View style={[s.daysTable, { borderColor: theme.border }]}>
        <View style={[s.dayRow, { backgroundColor: theme.cardSoft }]}>
          <Text style={[s.dayCell, s.dayHead, { color: theme.textMuted }]}>Leave Date</Text>
          <Text style={[s.dayCell, s.dayHead, { color: theme.textMuted }]}>Status</Text>
          <Text style={[s.dayCell, s.dayHead, { color: theme.textMuted }]}>Remarks</Text>
        </View>
        {(details.transactions || []).map((t, i) => (
          <View key={i} style={[s.dayRow, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <Text style={[s.dayCell, { color: theme.text }]}>{fmtDate(t.leaveDate)}</Text>
            <Text style={[s.dayCell, { color: theme.text }]}>{t.status}</Text>
            <Text style={[s.dayCell, { color: theme.textMuted }]}>{t.remarks || '—'}</Text>
          </View>
        ))}
        {!(details.transactions || []).length && (
          <Text style={{ padding: 8, color: theme.textMuted, fontSize: moderateScale(12) }}>No leave days found.</Text>
        )}
      </View>
    </>
  );
};

const EssLeaveApprovalScreen = ({ navigation, route }) => {
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
      const d = await LeaveApprovalsApi.queue(me);
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
  const typeOf = (row) => row.leave_type;
  const inMonth = (row) => rangeInMonth(row.FROMDATE, row.TODATE, month);
  const shown = list.filter(({ row }) => (type === ALL || typeOf(row) === type)
    && (tab === 'pending' || (inMonth(row) && (status === ALL || row.LEAVESTATUS === status))));

  const renderItem = ({ item: { row, state } }) => {
    const name = `${row.first_name} ${row.last_name || ''}`.trim();
    return (
      <Card>
        <View style={s.top}>
          <TeamAvatar person={{ name, profilePic: row.profile_pic }} size={moderateScale(40)} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{name}</Text>
            <Text style={[s.sub, { color: theme.textMuted }]} numberOfLines={1}>{row.emp_company_id || row.emp_id}</Text>
            {!!(row.designation || row.department) && (
              <Text style={[s.sub, { color: theme.textMuted }]} numberOfLines={1}>{[row.designation, row.department].filter(Boolean).join(' · ')}</Text>
            )}
          </View>
          <StatusChip status={row.LEAVESTATUS} colors={STATUS_COLOR} labels={STATUS_LABEL} />
        </View>
        <InfoRows rows={[
          ['Leave Type', row.leave_type],
          ['From', fmtDate(row.FROMDATE)],
          ['To', fmtDate(row.TODATE)],
          ['Days', row.leave_days],
          ['Applied On', fmtDate(row.applied_date)],
          // The decision dates; a rejection stores its own (rejected_date) since 2026-11-07
          row.Autherized_date && !(row.LEAVESTATUS === 'Rejected' && row.rejected_date) ? ['Authorized On', fmtDate(row.Autherized_date)] : null,
          row.LEAVESTATUS === 'Approved' && row.APPROVED_date ? ['Approved On', fmtDate(row.APPROVED_date)] : null,
          row.LEAVESTATUS === 'Rejected' && row.rejected_date ? ['Rejected By', row.rejected_by_name || '—'] : null,
          row.LEAVESTATUS === 'Rejected' && row.rejected_date ? ['Rejected On', fmtDate(row.rejected_date)] : null,
          row.LEAVESTATUS === 'Rejected' && row.REMARKS ? ['Rejection Remarks', row.REMARKS] : null,
        ]} />
        {tab === 'pending' && state.kind === 'pending' && (
          <View style={s.actions}>
            {state.cancellation ? (
              <>
                <ActionButton label="Confirm Cancellation" tone="approve" soft onPress={() => setSheet({ row, action: 'cancellation/approve' })} />
                <ActionButton label="Keep Leave" tone="reject" soft onPress={() => setSheet({ row, action: 'cancellation/reject' })} />
              </>
            ) : (
              <>
                <ActionButton label={LABELS[state.primary]} tone={state.primary} soft onPress={() => setSheet({ row, action: state.primary })} />
                <ActionButton label="Reject" tone="reject" soft onPress={() => setSheet({ row, action: 'reject' })} />
              </>
            )}
          </View>
        )}
      </Card>
    );
  };

  const act = sheet?.action;
  const isCancellation = act?.startsWith('cancellation/');
  return (
    <EssScreen title="Leave Approvals" onBack={() => navigation.goBack()}>
      <SegTabs tabs={[{ key: 'pending', label: 'Pending' }, { key: 'history', label: 'History' }]} active={tab} onChange={(t) => { setTab(t); setType(ALL); setStatus(ALL); }} />
      <FilterBar filters={[
        tab === 'history' ? { key: 'month', kind: 'month', value: month, options: monthFilterOptions(), onChange: setMonth } : null,
        { key: 'type', kind: 'list', value: type, options: valueFilterOptions('All leave types', list.map(({ row }) => typeOf(row))), onChange: setType },
        tab === 'history' ? { key: 'status', kind: 'list', value: status, options: valueFilterOptions('All statuses', list.map(({ row }) => row.LEAVESTATUS), STATUS_LABEL), onChange: setStatus } : null,
      ]} />
      {loading ? <Loading /> : (
        <FlatList
          data={shown}
          keyExtractor={(x) => String(x.row.LEAVEENTRYID)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: moderateScale(32) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState text={error ? 'Could not load. Pull to retry.' : tab === 'pending' ? "No pending approvals — you're all caught up!" : 'No records found.'} />}
        />
      )}
      <ActionSheet
        visible={!!sheet}
        title={isCancellation ? (act === 'cancellation/approve' ? 'Confirm Leave Cancellation' : 'Reject Leave Cancellation') : `${LABELS[act] || ''} Leave Request`}
        subtitle={sheet ? `${sheet.row.first_name} ${sheet.row.last_name || ''} · ${sheet.row.leave_type}` : ''}
        remark={isCancellation ? null : { required: act === 'reject', maxLength: 4000 }}
        confirmLabel={LABELS[act]}
        confirmTone={act === 'cancellation/approve' ? 'approve' : act === 'cancellation/reject' ? 'reject' : act}
        cancelLabel={isCancellation ? 'Back' : 'Cancel'}
        onClose={() => setSheet(null)}
        onConfirm={async (remarks) => {
          await LeaveApprovalsApi.act(sheet.row.LEAVEENTRYID, act, remarks);
          setSheet(null);
          load();
        }}
      >
        {sheet && <LeaveDetails id={sheet.row.LEAVEENTRYID} />}
        {isCancellation && (
          <Text style={{ color: theme.text, fontSize: moderateScale(12.5), marginTop: 10 }}>
            {act === 'cancellation/approve'
              ? 'This cancels the leave and restores the employee’s leave balance.'
              : 'This keeps the leave active as-is and dismisses the cancellation request.'}
          </Text>
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
  sectionLabel: { fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  daysTable: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  dayRow: { flexDirection: 'row' },
  dayCell: { flex: 1, padding: 6, fontSize: moderateScale(11.5) },
  dayHead: { fontWeight: '700' },
});

export default EssLeaveApprovalScreen;
