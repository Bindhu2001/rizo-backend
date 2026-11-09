import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from '../components/AppText';
import { useFocusEffect } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { AdvanceLoanApi, apiErrorMessage } from '../services/RevampApi';
import {
  EssScreen, SegTabs, StatusChip, Card, InfoRows, ActionButton, EmptyState, Loading, FieldLabel, Input, MonthSelect, FormSheet,
  PersonPicker, BRAND, fmtAmt, fmtPercent, fmtDate, currentMonth, resolveEmpId, FilterBar, ALL, monthFilterOptions, valueFilterOptions, monthOf,
} from '../components/EssUi';

// Requests › Advance & Loan, the web employee login's ESS My Requests › Advance & Loan: Salary Advance and Loan
// Application, each with its list, the same apply form fields and rules (advisory advance limit, EMI preview,
// Authorize By / Approve By from the people admin allocated) and Withdraw while Pending — the same API routes.

const STATUS_COLOR = {
  Pending: { bg: '#EFF6FF', color: '#2563EB' },
  Authorized: { bg: '#FEFCE8', color: '#D97706' },
  Approved: { bg: '#F0FDF4', color: '#16A34A' },
  Rejected: { bg: '#FEF2F2', color: '#DC2626' },
  Deleted: { bg: '#F9FAFB', color: '#6B7280' },
};

// "Authorize: … / Approve: …" — who acted once someone has, else everyone the request waits on (web RoutingCell)
const routingText = (row) => {
  if (!row.authorizer_names && !row.approver_names) return 'Admin';
  const approvedBy = row.request_status === 'Approved' ? row.reviewed_by_name : null;
  return [
    row.authorizer_names ? `Authorize: ${row.authorized_by_name || row.authorizer_names}` : null,
    row.approver_names ? `Approve: ${approvedBy || row.approver_names}` : null,
  ].filter(Boolean).join('\n');
};

// Authorized On, Approved / Rejected On (+ by whom) and the rejection remarks of a request
const decisionRows = (r) => [
  r.authorized_date ? ['Authorized On', fmtDate(r.authorized_date)] : null,
  (r.request_status === 'Approved' || r.request_status === 'Rejected') && r.reviewed_date
    ? [`${r.request_status} On`, `${fmtDate(r.reviewed_date)}${r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ''}`] : null,
  r.request_status === 'Rejected' && r.admin_remarks ? ['Rejection remarks', r.admin_remarks] : null,
];

const EMPTY_ADVANCE = () => ({ advance_amount: '', affected_month: currentMonth(), remarks: '' });
const EMPTY_LOAN = () => ({ loan_amount: '', tenure: '', interest_rate: '', emi_start_month: currentMonth(), remarks: '' });

const EssAdvanceLoanScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route.params?.user;
  const [tab, setTab] = useState('advance');
  // Requests applied this month by default; "All months" shows every request
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState(ALL);
  const [advances, setAdvances] = useState([]);
  const [loans, setLoans] = useState([]);
  const [people, setPeople] = useState({ authorizers: [], approvers: [] });
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [limit, setLimit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [alertCfg, setAlertCfg] = useState(null);

  const [form, setForm] = useState(null); // 'advance' | 'loan' while the apply form is open
  const [advanceForm, setAdvanceForm] = useState(EMPTY_ADVANCE());
  const [loanForm, setLoanForm] = useState(EMPTY_LOAN());
  const [routing, setRouting] = useState({ authorizerFkeys: [], approverFkeys: [] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const [a, l] = await Promise.all([AdvanceLoanApi.advances(), AdvanceLoanApi.loans()]);
      setAdvances(a.rows || []);
      setLoans(l.rows || []);
    } catch (e) {
      setError('Could not load. Pull to retry.');
    } finally {
      setLoading(false);
    }
  };
  const loadPeople = async () => {
    try {
      const p = await AdvanceLoanApi.people();
      if (p) setPeople({ authorizers: p.authorizers || [], approvers: p.approvers || [] });
    } catch (_) {} finally {
      setPeopleLoaded(true);
    }
    try {
      const me = await resolveEmpId(user);
      const d = me ? await AdvanceLoanApi.advanceLimit(me) : null;
      if (d && d.limit != null) setLimit(Number(d.limit));
    } catch (_) {}
  };
  useFocusEffect(useCallback(() => { load(); loadPeople(); }, []));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openForm = (kind) => {
    setRouting({
      authorizerFkeys: people.authorizers.slice(0, 1).map((p) => p.empFkey),
      approverFkeys: people.approvers.slice(0, 1).map((p) => p.empFkey),
    });
    setFormError(null);
    setForm(kind);
  };

  const withdraw = (kind, row) => {
    setAlertCfg({
      type: 'warning',
      title: 'Withdraw',
      message: kind === 'advance' ? 'Withdraw this advance request?' : 'Withdraw this loan application?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw', style: 'destructive', onPress: async () => {
            try {
              await AdvanceLoanApi.withdraw(kind, kind === 'advance' ? row.emp_advance_request_pkey : row.emp_loan_request_pkey);
              load();
            } catch (e) {
              setError(apiErrorMessage(e, 'Failed to withdraw'));
            }
          },
        },
      ],
    });
  };

  const submitAdvance = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await AdvanceLoanApi.applyAdvance({
        advanceAmount: Number(advanceForm.advance_amount),
        affectedMonth: advanceForm.affected_month,
        remarks: advanceForm.remarks || undefined,
        ...routing,
      });
      setForm(null);
      setAdvanceForm(EMPTY_ADVANCE());
      load();
    } catch (e) {
      setFormError(apiErrorMessage(e, 'Failed to submit advance request'));
    } finally {
      setSaving(false);
    }
  };

  const onSubmitAdvance = () => {
    const amount = Number(advanceForm.advance_amount);
    if (!(amount >= 1 && amount <= 10000000)) { setFormError('Enter an advance amount between ₹1 and ₹1,00,00,000.'); return; }
    if (!advanceForm.affected_month) { setFormError('Please select the affected month.'); return; }
    if (limit != null && amount > limit) {
      // The advisory limit is a warning, not a block — same as the web
      setAlertCfg({
        type: 'warning',
        title: 'Amount exceeds your advisory limit',
        message: `Your advance is normally limited to ${fmtAmt(limit)} (80% of one month's gross pay). You can still submit this request, but it will need extra admin review before payroll processing.`,
        buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit Anyway', onPress: submitAdvance }],
      });
      return;
    }
    submitAdvance();
  };

  const onSubmitLoan = async () => {
    const amount = parseFloat(loanForm.loan_amount);
    const tenure = parseInt(loanForm.tenure, 10);
    const rate = loanForm.interest_rate ? parseFloat(loanForm.interest_rate) : 0;
    if (!(amount >= 1 && amount <= 10000000)) { setFormError('Enter a loan amount between ₹1 and ₹1,00,00,000.'); return; }
    if (!(tenure >= 1 && tenure <= 360)) { setFormError('Enter a tenure between 1 and 360 months.'); return; }
    if (!(rate >= 0 && rate <= 100)) { setFormError('Interest rate must be between 0 and 100%.'); return; }
    if (!loanForm.emi_start_month) { setFormError('Please select the EMI start month.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      await AdvanceLoanApi.applyLoan({
        loanAmount: amount, tenure, interestRate: rate,
        emiStartMonth: loanForm.emi_start_month, remarks: loanForm.remarks || undefined, ...routing,
      });
      setForm(null);
      setLoanForm(EMPTY_LOAN());
      load();
    } catch (e) {
      setFormError(apiErrorMessage(e, 'Failed to submit loan application'));
    } finally {
      setSaving(false);
    }
  };

  const emiPreview = loanForm.loan_amount && loanForm.tenure && parseInt(loanForm.tenure, 10) > 0
    ? fmtAmt(parseFloat(loanForm.loan_amount) / parseInt(loanForm.tenure, 10))
    : null;

  const renderAdvance = ({ item: r }) => (
    <Card>
      <View style={s.top}>
        <Text style={[s.amount, { color: theme.text }]}>{fmtAmt(r.advance_amount)}</Text>
        <StatusChip status={r.request_status} colors={STATUS_COLOR} />
      </View>
      <InfoRows rows={[
        ['Affected Month', r.affected_month],
        ['Remarks', r.remarks || '—'],
        ['Authorizer / Approver', routingText(r)],
        ...decisionRows(r),
      ]} />
      {r.request_status === 'Pending' && (
        <View style={s.actions}><ActionButton label="Withdraw" tone="reject" soft onPress={() => withdraw('advance', r)} /></View>
      )}
    </Card>
  );

  const renderLoan = ({ item: r }) => (
    <Card>
      <View style={s.top}>
        <Text style={[s.amount, { color: theme.text }]}>{fmtAmt(r.loan_amount)}</Text>
        <StatusChip status={r.request_status} colors={STATUS_COLOR} />
      </View>
      <InfoRows rows={[
        ['Tenure', `${r.tenure} mo`],
        ['Interest Rate', fmtPercent(r.intrest_rate)],
        ['EMI Start', r.emi_start_month],
        ['Authorizer / Approver', routingText(r)],
        ...decisionRows(r),
      ]} />
      {r.request_status === 'Pending' && (
        <View style={s.actions}><ActionButton label="Withdraw" tone="reject" soft onPress={() => withdraw('loan', r)} /></View>
      )}
    </Card>
  );

  const isAdvance = tab === 'advance';
  const rowsOfTab = isAdvance ? advances : loans;
  const shown = rowsOfTab.filter((r) => (month === ALL || monthOf(r.created_date) === month)
    && (status === ALL || r.request_status === status));
  return (
    <EssScreen title="Advance & Loan" onBack={() => navigation.goBack()}>
      <SegTabs tabs={[{ key: 'advance', label: 'Salary Advance' }, { key: 'loan', label: 'Loan Application' }]} active={tab} onChange={(t) => { setTab(t); setStatus(ALL); }} />
      <FilterBar filters={[
        { key: 'month', kind: 'month', value: month, options: monthFilterOptions(), onChange: setMonth },
        { key: 'status', kind: 'list', value: status, options: valueFilterOptions('All statuses', rowsOfTab.map((r) => r.request_status)), onChange: setStatus },
      ]} />
      <View style={s.intro}>
        <Text style={[s.introText, { color: theme.textMuted }]}>
          {isAdvance
            ? 'Advance requests must be authorized and approved (or approved by admin) before payroll processing.'
            : 'Loan applications must be authorized and approved (or approved by admin) before the EMI schedule is generated.'}
        </Text>
        <TouchableOpacity style={[s.applyBtn, !peopleLoaded && { opacity: 0.5 }]} disabled={!peopleLoaded} onPress={() => openForm(tab)}>
          <Plus color="#FFF" size={16} />
          <Text style={s.applyText}>{isAdvance ? 'Apply for Advance' : 'Apply for Loan'}</Text>
        </TouchableOpacity>
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
      {loading ? <Loading /> : (
        <FlatList
          data={shown}
          keyExtractor={(r) => String(isAdvance ? r.emp_advance_request_pkey : r.emp_loan_request_pkey)}
          renderItem={isAdvance ? renderAdvance : renderLoan}
          contentContainerStyle={{ paddingBottom: moderateScale(32) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState text={rowsOfTab.length > 0 ? 'No requests match these filters. Try All months.' : isAdvance ? 'No advance requests yet' : 'No loan applications found'} />}
        />
      )}

      <FormSheet
        visible={!!form}
        title={form === 'advance' ? 'New Advance Request' : 'New Loan Application'}
        onClose={() => setForm(null)}
        footer={(
          <View style={s.sheetBtns}>
            <ActionButton label="Cancel" outline onPress={() => setForm(null)} />
            <ActionButton
              label={saving ? 'Submitting…' : 'Submit Application'}
              tone="primary"
              disabled={saving}
              onPress={form === 'advance' ? onSubmitAdvance : onSubmitLoan}
            />
          </View>
        )}
      >
        {form === 'advance' ? (
          <>
            <FieldLabel>Advance Amount (₹) *</FieldLabel>
            <Input keyboardType="decimal-pad" value={advanceForm.advance_amount} onChangeText={(v) => { setFormError(null); setAdvanceForm((f) => ({ ...f, advance_amount: v })); }} />
            {limit != null && (
              <Text style={[s.hint, { color: theme.textMuted }]}>Advisory limit: {fmtAmt(limit)} (80% of one month's gross)</Text>
            )}
            <FieldLabel>Affected Month *</FieldLabel>
            <MonthSelect value={advanceForm.affected_month} onChange={(m) => { setFormError(null); setAdvanceForm((f) => ({ ...f, affected_month: m })); }} />
          </>
        ) : (
          <>
            <FieldLabel>Loan Amount (₹) *</FieldLabel>
            <Input keyboardType="decimal-pad" value={loanForm.loan_amount} onChangeText={(v) => { setFormError(null); setLoanForm((f) => ({ ...f, loan_amount: v })); }} />
            <FieldLabel>Tenure (months) *</FieldLabel>
            <Input keyboardType="number-pad" value={loanForm.tenure} onChangeText={(v) => { setFormError(null); setLoanForm((f) => ({ ...f, tenure: v })); }} />
            <FieldLabel>Interest Rate (%)</FieldLabel>
            <Input keyboardType="decimal-pad" placeholder="0 for interest-free" value={loanForm.interest_rate} onChangeText={(v) => { setFormError(null); setLoanForm((f) => ({ ...f, interest_rate: v })); }} />
            <FieldLabel>EMI Start Month *</FieldLabel>
            <MonthSelect value={loanForm.emi_start_month} onChange={(m) => { setFormError(null); setLoanForm((f) => ({ ...f, emi_start_month: m })); }} />
            {!!emiPreview && (
              <View style={s.emi}><Text style={s.emiText}>Estimated Monthly EMI: {emiPreview}</Text></View>
            )}
          </>
        )}
        <PersonPicker
          label="Authorize By"
          options={people.authorizers}
          value={routing.authorizerFkeys}
          onChange={(v) => setRouting((r) => ({ ...r, authorizerFkeys: v }))}
          hint={people.authorizers.length ? 'Any one selected person can authorize.' : 'No authorizer allocated — the request goes straight to the approvers.'}
        />
        <PersonPicker
          label="Approve By"
          options={people.approvers}
          value={routing.approverFkeys}
          onChange={(v) => setRouting((r) => ({ ...r, approverFkeys: v }))}
          hint={people.approvers.length ? 'Any one selected person can approve.' : 'No approver allocated — admin will approve it.'}
        />
        <FieldLabel>Remarks</FieldLabel>
        <Input
          multiline
          maxLength={500}
          value={form === 'advance' ? advanceForm.remarks : loanForm.remarks}
          onChangeText={(v) => (form === 'advance' ? setAdvanceForm((f) => ({ ...f, remarks: v })) : setLoanForm((f) => ({ ...f, remarks: v })))}
        />
        {!!formError && <Text style={s.error}>{formError}</Text>}
        {/* iPhone shows only one Modal at a time: while the form is open, its alerts open inside it */}
        {!!form && <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />}
      </FormSheet>

      {!form && <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />}
    </EssScreen>
  );
};

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  amount: { fontSize: moderateScale(18), fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8 },
  intro: { paddingHorizontal: moderateScale(16), marginBottom: moderateScale(10) },
  introText: { fontSize: moderateScale(12), marginBottom: 8 },
  applyBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  applyText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(13) },
  error: { color: '#DC2626', fontSize: moderateScale(12), marginHorizontal: moderateScale(16), marginBottom: 8 },
  hint: { fontSize: moderateScale(11), marginTop: -8, marginBottom: 12 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  emi: { backgroundColor: `${BRAND}14`, borderColor: `${BRAND}40`, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12 },
  emiText: { color: BRAND, fontWeight: '800', fontSize: moderateScale(13) },
});

export default EssAdvanceLoanScreen;
