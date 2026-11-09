import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from '../components/AppText';
import { useFocusEffect } from '@react-navigation/native';
import { moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import { ResignationApi, apiErrorMessage } from '../services/RevampApi';
import {
  EssScreen, StatusChip, Card, InfoRows, ActionButton, Loading, FieldLabel, Input, Select, DateSelect, FormSheet, BRAND, fmtDate,
} from '../components/EssUi';

// Requests › Resignation, the web employee login's ESS My Requests › Resignation (/api/ess/resignation): apply,
// track the request, withdraw it until it is Completed. The same fields and checks; an admin-started
// separation shows the web's "contact Admin" note and can't be withdrawn.

// The web's request badge colours
const STATUS_COLOR = {
  Applied: { bg: '#EFF6FF', color: '#2563EB' },
  Pending: { bg: '#EFF6FF', color: '#2563EB' },
  Authorized: { bg: '#FEFCE8', color: '#D97706' },
  Approved: { bg: '#F0FDF4', color: '#16A34A' },
  Completed: { bg: '#F0FDF4', color: '#16A34A' },
  Rejected: { bg: '#FEF2F2', color: '#DC2626' },
};

const EMPTY = { reason: '', reason_desc: '', last_workingday: '', authorised_to: '', contact_no: '', comments_to_manager: '' };

// Today in India (the server checks the date in IST) and one year on — the Last Working Date range
const istToday = () => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Free text must carry real words — at least 5 characters with a letter (same as the server)
const isMeaningfulText = (v) => v.trim().length >= 5 && /[A-Za-z]/.test(v);

const EssResignationScreen = ({ navigation }) => {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [alertCfg, setAlertCfg] = useState(null);

  const load = async () => {
    setLoadError(false);
    try {
      setData(await ResignationApi.get());
    } catch (_) {
      setLoadError(true);
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const update = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(null); };

  const openNew = () => {
    const authorizers = data?.authorizers || [];
    setForm({ ...EMPTY, authorised_to: authorizers.length === 1 ? String(authorizers[0].empFkey) : '' });
    setError(null);
    setShowAdd(true);
  };

  const minDate = istToday();
  const maxDate = new Date(minDate.getFullYear() + 1, minDate.getMonth(), minDate.getDate());

  const submit = async () => {
    setSaving(true);
    try {
      await ResignationApi.apply({ ...form, authorised_to: Number(form.authorised_to) });
      setShowAdd(false);
      // After the sheet has slid away — iPhone can't open the alert while the sheet is still closing
      setTimeout(() => setAlertCfg({ type: 'success', title: 'Submitted', message: 'Resignation request submitted successfully.' }), 450);
      load();
    } catch (e) {
      setError(apiErrorMessage(e, 'Failed to submit resignation'));
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    // Same checks as the web form / POST /api/ess/resignation, in the same order
    const missing = !form.reason ? 'Please select a reason for resignation.'
      : !form.reason_desc.trim() ? 'Please enter the reason description.'
      : !isMeaningfulText(form.reason_desc) ? 'Reason description must be at least 5 characters and contain letters.'
      : !form.last_workingday ? 'Please choose the last working date.'
      : form.last_workingday < isoOf(minDate) ? 'Last working date cannot be before today.'
      : form.last_workingday > isoOf(maxDate) ? 'Last working date must be within one year from today.'
      : !form.authorised_to ? 'Please select Authorize By.'
      : !form.contact_no.trim() ? 'Please enter a contact number.'
      : !/^\d{10,15}$/.test(form.contact_no) ? 'Contact number must be 10 to 15 digits.'
      : !form.comments_to_manager.trim() ? 'Please enter comments to manager.'
      : !isMeaningfulText(form.comments_to_manager) ? 'Comments to manager must be at least 5 characters and contain letters.'
      : null;
    if (missing) { setError(missing); return; }
    setAlertCfg({
      type: 'warning',
      title: 'Submit Resignation',
      message: 'Do you want to submit your resignation?',
      buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit', onPress: submit }],
    });
  };

  const withdraw = () => setAlertCfg({
    type: 'warning',
    title: 'Withdraw Resignation',
    message: 'Do you want to withdraw your resignation request?',
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw', style: 'destructive', onPress: async () => {
          try {
            await ResignationApi.withdraw();
            setAlertCfg({ type: 'success', title: 'Withdrawn', message: 'Resignation Request cancelled successfully' });
          } catch (e) {
            setAlertCfg({ type: 'error', title: 'Error', message: apiErrorMessage(e, 'Something went wrong. Please contact Admin.') });
          }
          load();
        },
      },
    ],
  });

  const r = data?.request;
  const canWithdraw = !!r && !data?.byAdmin && r.Resignation_status !== 'Completed';

  return (
    <EssScreen title="Resignation" onBack={() => navigation.goBack()}>
      {!data && !loadError ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: moderateScale(32) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={s.intro}>
            <Text style={[s.introText, { color: theme.textMuted }]}>Apply for resignation and track your request.</Text>
            {!!data && !r && !data.byAdmin && (
              <TouchableOpacity style={s.applyBtn} onPress={openNew}><Text style={s.applyText}>Apply for Resignation</Text></TouchableOpacity>
            )}
            {canWithdraw && (
              <TouchableOpacity style={[s.applyBtn, { backgroundColor: '#DC2626' }]} onPress={withdraw}><Text style={s.applyText}>Withdraw Resignation</Text></TouchableOpacity>
            )}
          </View>

          {loadError ? (
            <Card><Text style={{ color: theme.textMuted, textAlign: 'center' }}>Could not load. Pull to retry.</Text></Card>
          ) : data.byAdmin ? (
            <Card><Text style={{ color: theme.text, fontSize: moderateScale(14) }}>Your separation has been initiated by Admin. Please contact Admin/Management for more information.</Text></Card>
          ) : !r ? (
            <Card><Text style={{ color: theme.textMuted, textAlign: 'center' }}>You have not applied for resignation.</Text></Card>
          ) : (
            <Card>
              <View style={s.reqHead}>
                <Text style={[s.reqTitle, { color: theme.text }]}>My Resignation Request</Text>
                <StatusChip status={r.Resignation_status} colors={STATUS_COLOR} />
              </View>
              <InfoRows rows={[
                ['Applied Date', fmtDate(r.applied_date)],
                ['Reason for Resignation', r.Reason],
                ['Last Working Date', fmtDate(r.Last_workingday)],
                ['Approved Last Working Date', fmtDate(r.last_approved_working_date)],
                ['Authorize By', r.authorised_name || '—'],
                ['Contact Number', r.contact_no || '—'],
                r.Reason_Desc ? ['Reason Description', r.Reason_Desc] : null,
                r.Comments_to_manager ? ['Comments To Manager', r.Comments_to_manager] : null,
                r.comments_to_emp ? ['Comments from HR', r.comments_to_emp] : null,
              ]} />
            </Card>
          )}
        </ScrollView>
      )}

      <FormSheet
        visible={showAdd}
        title="Resignation Request"
        onClose={() => setShowAdd(false)}
        footer={(
          <View style={s.sheetBtns}>
            <ActionButton label="Cancel" outline onPress={() => setShowAdd(false)} />
            <ActionButton label={saving ? 'Submitting…' : 'Submit'} tone="primary" disabled={saving} onPress={onSave} />
          </View>
        )}
      >
        <FieldLabel>Reason for Resignation *</FieldLabel>
        <Select value={form.reason} onChange={(v) => update({ reason: v })} options={(data?.reasons || []).map((x) => ({ value: x, label: x }))} />
        <FieldLabel>Last Working Date *</FieldLabel>
        <DateSelect value={form.last_workingday} onChange={(v) => update({ last_workingday: v })} minimumDate={minDate} maximumDate={maxDate} />
        <FieldLabel>Reason Description *</FieldLabel>
        <Input multiline maxLength={600} placeholder="Reason Descriptions...." value={form.reason_desc} onChangeText={(v) => update({ reason_desc: v })} />
        <Text style={[s.count, { color: theme.textMuted }]}>{form.reason_desc.length} / 600</Text>
        <FieldLabel>Authorize By *</FieldLabel>
        <Select value={form.authorised_to} onChange={(v) => update({ authorised_to: v })} options={(data?.authorizers || []).map((p) => ({ value: String(p.empFkey), label: p.name }))} />
        <FieldLabel>Contact Number *</FieldLabel>
        <Input keyboardType="number-pad" maxLength={15} placeholder="Contact Number" value={form.contact_no} onChangeText={(v) => update({ contact_no: v.replace(/\D/g, '').slice(0, 15) })} />
        <FieldLabel>Comments To Manager *</FieldLabel>
        <Input multiline maxLength={600} placeholder="Comments...." value={form.comments_to_manager} onChangeText={(v) => update({ comments_to_manager: v })} />
        <Text style={[s.count, { color: theme.textMuted }]}>{form.comments_to_manager.length} / 600</Text>
        {!!error && <Text style={s.error}>{error}</Text>}
        {/* iPhone shows only one Modal at a time: while the form is open, its alerts open inside it */}
        {showAdd && <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />}
      </FormSheet>

      {!showAdd && <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />}
    </EssScreen>
  );
};

const s = StyleSheet.create({
  intro: { paddingHorizontal: moderateScale(16), marginBottom: moderateScale(12), gap: 8 },
  introText: { fontSize: moderateScale(12.5) },
  applyBtn: { alignSelf: 'flex-start', backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  applyText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(13) },
  reqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  reqTitle: { fontSize: moderateScale(14), fontWeight: '800' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  count: { fontSize: moderateScale(11), textAlign: 'right', marginTop: -8, marginBottom: 10 },
  error: { color: '#DC2626', fontSize: moderateScale(12), marginTop: 4 },
});

export default EssResignationScreen;
