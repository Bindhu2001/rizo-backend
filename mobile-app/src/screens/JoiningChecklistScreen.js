import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { CheckCircle2, XCircle, FileText } from 'lucide-react-native';
import { Text } from '../components/AppText';
import { moderateScale, COLORS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import CustomAlert from '../components/CustomAlert';
import AttachmentSourceSheet from '../components/AttachmentSourceSheet';
import { pickPhotoAttachment, takePhotoAttachment } from '../services/AttachmentPicker';
import { StatutoryApi, MyDocumentsApi, apiErrorMessage, isNetworkError } from '../services/RevampApi';
import { DOC_TYPES, DOC_LABELS, DMY, planDocFill, readDocumentFile, documentReadError } from '../services/DocumentReader';
import { recordAudit } from '../services/AuditTrail';
import { EssScreen, StatusChip, Card, InfoRows, ActionButton, Loading, FieldLabel, Input, Select, DateSelect, FormSheet } from '../components/EssUi';
import { useFooterPadding } from '../components/KeyboardDoneBar';

// Requests › Joining Checklist (Rizo-new companies (the server decides: $doCompanyCodes)): the employee's own PF / ESI / WWF status — the same rules as HR's New
// Joiners Checklist — the documents HR still needs, and Add a document: photograph it (or pick it), the server reads
// it (services/DocumentReader.js) and fills the form, the employee checks it and sends it to HR.

const STATUS = {
  done: { label: 'Done', colors: { bg: '#F0FDF4', color: '#16A34A' } },
  pending: { label: 'With HR', colors: { bg: '#FEFCE8', color: '#B45309' } },
  check: { label: 'With HR', colors: { bg: '#FEFCE8', color: '#B45309' } },
  unknown: { label: 'Not set up yet', colors: { bg: '#F3F4F6', color: '#374151' } },
  na: { label: 'Not applicable', colors: { bg: '#F3F4F6', color: '#6B7280' } },
};
const MAX_FILE = 10 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const EMPTY = { type: '', number: '', name: '', gender: '', validFrom: '', validTill: '' };
const opts = (list) => list.map((v) => ({ value: v, label: v }));

// What the form still needs before it can be sent ('' = ready)
export const missingIn = (f, file) => {
  if (!file) return 'Please attach a photo or PDF of the document.';
  if (!f.type) return 'Please choose the document type.';
  if (!f.number.trim()) return 'Please enter the document number.';
  if (!f.name.trim()) return 'Please enter the name on the document.';
  if (!f.gender) return 'Please choose the gender.';
  if (!f.validFrom) return 'Please choose the valid from date.';
  if (f.validTill && f.validTill < f.validFrom) return 'Valid till cannot be before valid from.';
  return '';
};

// route.params.docsOnly (Profile › Upload Documents): only "My documents" and its Add form — no PF / ESI / WWF
const JoiningChecklistScreen = ({ navigation, route }) => {
  const docsOnly = !!route?.params?.docsOnly;
  const bottomPad = useFooterPadding();
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [reading, setReading] = useState(null); // null | { status: reading | failed | done, ... }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [alertCfg, setAlertCfg] = useState(null);
  const readSeq = useRef(0);
  const formNow = useRef(EMPTY);
  useEffect(() => { formNow.current = form; });

  const load = async () => {
    try {
      setData(await StatutoryApi.mine());
      setLoadError('');
    } catch (e) {
      setLoadError(isNetworkError(e) ? 'No internet connection. Please connect and try again.' : apiErrorMessage(e, 'Could not load your checklist. Please try again.'));
    }
  };
  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const closeForm = () => { readSeq.current += 1; setShowForm(false); setFile(null); setForm(EMPTY); setReading(null); setError(''); };

  const readIt = async (picked) => {
    const mine = ++readSeq.current;
    setReading({ status: 'reading' });
    try {
      const res = await readDocumentFile(picked, formNow.current.type);
      if (mine !== readSeq.current) return; // closed, or another file attached meanwhile
      const plan = planDocFill(res?.fields, formNow.current);
      if (plan.filled.length) setForm((f) => ({ ...f, ...plan.fill }));
      setReading({ status: 'done', ...plan, source: res?.source });
    } catch (e) {
      if (mine === readSeq.current) setReading({ status: 'failed', message: documentReadError(e) });
    }
  };

  // iOS cannot open the form while the photo picker / chooser is still closing
  const afterClose = (fn) => setTimeout(fn, Platform.OS === 'ios' ? 450 : 0);
  const attach = (picked) => {
    if (picked.size != null && picked.size > MAX_FILE) { setAlertCfg({ type: 'warning', title: 'File Too Large', message: 'The file is larger than 10 MB. Please choose a smaller one.' }); return; }
    if (!FILE_TYPES.includes(picked.mimeType)) { setAlertCfg({ type: 'warning', title: 'Invalid File', message: 'Only JPG, PNG and PDF files are allowed.' }); return; }
    setFile(picked); setError('');
    afterClose(() => { setShowForm(true); readIt(picked); });
  };
  const fromPicker = async (pick) => {
    const res = await pick();
    if (res.canceled) return;
    if (res.error) { setAlertCfg({ type: 'error', title: res.error.title, message: res.error.message }); return; }
    attach(res.file);
  };
  const fromFiles = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, multiple: false, copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.length) attach(r.assets[0]);
    } catch (_) { setAlertCfg({ type: 'error', title: 'Error', message: 'Could not open the file picker.' }); }
  };
  const choose = (pick) => { setShowSource(false); afterClose(pick); };

  const applySuggestion = (sg) => {
    setForm((f) => ({ ...f, [sg.key]: sg.value }));
    setReading((r) => (r?.status === 'done' ? { ...r, filled: [...r.filled.filter((k) => k !== sg.key), sg.key], suggestions: r.suggestions.filter((x) => x.key !== sg.key) } : r));
  };

  const submit = async () => {
    const need = missingIn(form, file);
    if (need) { setError(need); return; }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('document_type', form.type);
      fd.append('document_number', form.number.trim().toUpperCase());
      fd.append('name', form.name.trim());
      fd.append('classification', form.gender);
      fd.append('valid_from', form.validFrom);
      if (form.validTill) fd.append('valid_till', form.validTill);
      fd.append('file', { uri: file.uri, name: file.name || (file.mimeType === 'application/pdf' ? 'document.pdf' : 'document.jpg'), type: file.mimeType });
      await MyDocumentsApi.add(fd);
      recordAudit('added a document', { Type: form.type }); // the number is never recorded
      closeForm();
      setAlertCfg({ type: 'success', title: 'Sent to HR', message: 'Your document has been added to your profile.' });
      load();
    } catch (e) {
      setError(isNetworkError(e) ? 'No internet connection. Your document was not sent: please try again when connected.' : apiErrorMessage(e, 'Could not send the document. Please try again.'));
    } finally { setSaving(false); }
  };

  const item = (title, it, extra) => (
    <View key={title} style={[s.row, { borderBottomColor: theme.divider }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[s.rowSub, { color: theme.textMuted }]}>{it.number ? it.number : 'No number yet'}{extra ? ` · ${extra}` : ''}</Text>
      </View>
      <StatusChip status={it.status} colors={{ [it.status]: STATUS[it.status]?.colors }} labels={{ [it.status]: STATUS[it.status]?.label }} />
    </View>
  );
  const set = (key) => (v) => { setForm((f) => ({ ...f, [key]: v })); setError(''); };

  return (
    <EssScreen title={docsOnly ? 'Upload Documents' : 'Joining Checklist'} onBack={() => navigation.goBack()}>
      {!data && !loadError ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: moderateScale(16), paddingBottom: bottomPad + moderateScale(16) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primaryDeep]} tintColor={COLORS.primaryDeep} />}>
          {!!loadError && (
            <Card>
              <Text style={[s.rowTitle, { color: theme.text }]}>{loadError}</Text>
              <View style={{ marginTop: 10 }}><ActionButton label="Try Again" onPress={() => { setLoadError(''); load(); }} /></View>
            </Card>
          )}
          {!!data && (
            <>
              {!docsOnly && (<>
              <Card>
                <Text style={[s.section, { color: theme.text }]}>PF, ESI and WWF</Text>
                {item('Provident Fund (UAN)', data.pf, data.pf.pfNo)}
                {item('ESI', data.esi)}
                {item('WWF / Welfare fund', data.wwf)}
              </Card>
              <Card>
                <Text style={[s.section, { color: theme.text }]}>Your details with HR</Text>
                {[['Aadhaar number', data.docs.aadhaar], ['PAN number', data.docs.pan], ['Bank details', data.docs.bank], ['Photo', data.docs.photo]].map(([label, ok]) => (
                  <View key={label} style={s.docRow}>
                    {ok ? <CheckCircle2 color="#16A34A" size={18} /> : <XCircle color="#DC2626" size={18} />}
                    <Text style={[s.docText, { color: theme.text }]}>{label}</Text>
                    <Text style={[s.rowSub, { color: theme.textMuted }]}>{ok ? 'Received' : 'Missing'}</Text>
                  </View>
                ))}
              </Card>
              </>)}
              <Card>
                <Text style={[s.section, { color: theme.text }]}>My documents</Text>
                {docsOnly && <Text style={[s.rowSub, { color: theme.textMuted, marginBottom: 8 }]}>Take a photo of your Aadhaar, PAN, passport, licence or certificate: the details are read from it and you check them before sending to HR.</Text>}
                {data.documents.length === 0 && <Text style={[s.rowSub, { color: theme.textMuted }]}>No documents added yet.</Text>}
                {data.documents.map((d) => (
                  <View key={d.id} style={s.docRow}>
                    <FileText color={COLORS.primaryDeep} size={18} />
                    <Text style={[s.docText, { color: theme.text }]} numberOfLines={1}>{d.type} · {d.number}</Text>
                    <Text style={[s.rowSub, { color: theme.textMuted }]}>{d.hasFile ? 'File added' : 'No file'}</Text>
                  </View>
                ))}
                <View style={{ marginTop: 12 }}>
                  <ActionButton label="Add a document" onPress={() => { closeForm(); setShowSource(true); }} />
                </View>
              </Card>
            </>
          )}
        </ScrollView>
      )}

      <AttachmentSourceSheet
        visible={showSource}
        onCamera={() => choose(() => fromPicker(takePhotoAttachment))}
        onPhotos={() => choose(() => fromPicker(pickPhotoAttachment))}
        onFiles={() => choose(fromFiles)}
        onClose={() => setShowSource(false)}
      />

      <FormSheet visible={showForm} title="Add a document" subtitle="Please check the details before sending" onClose={closeForm}
        footer={(
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 10 }}>
            <View style={{ flex: 1 }}><ActionButton label="Cancel" outline onPress={closeForm} /></View>
            <View style={{ flex: 1 }}><ActionButton label={saving ? 'Sending…' : 'Send to HR'} onPress={submit} disabled={saving} /></View>
          </View>
        )}>
        {!!file && <InfoRows rows={[['File', file.name || 'document']]} />}
        {!!reading && (
          <View style={[s.note, { borderColor: theme.border }, reading.status === 'done' && reading.filled.length > 0 && s.noteGood, reading.status === 'failed' && s.noteBad]}>
            {reading.status === 'reading' && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={COLORS.primaryDeep} />
                <Text style={[s.noteText, { color: theme.text, marginLeft: 8 }]}>Reading the document…</Text>
              </View>
            )}
            {reading.status === 'failed' && <Text style={[s.noteText, { color: theme.text }]}>{reading.message}</Text>}
            {reading.status === 'done' && (
              <>
                {reading.kind !== 'Other' && <Text style={[s.noteText, { color: theme.textMuted }]}>Looks like: {reading.kind === 'Bank' ? 'Bank passbook / cheque' : reading.kind}</Text>}
                {reading.filled.length > 0 && <Text style={[s.noteText, { color: theme.text }]}><Text style={{ fontWeight: '800' }}>Filled: </Text>{reading.filled.map((k) => DOC_LABELS[k]).join(', ')}. Please check.</Text>}
                {!reading.filled.length && !reading.suggestions.length && (
                  <Text style={[s.noteText, { color: theme.text }]}>{reading.source === 'none' ? 'This PDF couldn’t be opened to read it. Please type the details, or attach a photo of it.' : 'Couldn’t read the details. Please type them.'}</Text>
                )}
                {reading.suggestions.map((sg) => (
                  <View key={sg.key} style={s.suggestion}>
                    <Text style={[s.noteText, { color: theme.text, flex: 1 }]}>May show {DOC_LABELS[sg.key]} <Text style={{ fontWeight: '800' }}>{/^valid/.test(sg.key) ? DMY(sg.value) : sg.value}</Text></Text>
                    <TouchableOpacity style={s.useBtn} onPress={() => applySuggestion(sg)} accessibilityLabel={`Use ${DOC_LABELS[sg.key]}`}><Text style={s.useText}>Use</Text></TouchableOpacity>
                  </View>
                ))}
                {reading.extra.length > 0 && <Text style={[s.noteText, { color: theme.textMuted }]}>{reading.extra.join(' · ')}</Text>}
              </>
            )}
          </View>
        )}
        <FieldLabel>Document Type *</FieldLabel>
        <Select value={form.type} options={opts(DOC_TYPES)} onChange={set('type')} />
        <FieldLabel>Document Number *</FieldLabel>
        <Input value={form.number} onChangeText={(v) => set('number')(v.replace(/[^A-Za-z0-9]/g, ''))} placeholder="Document number" accessibilityLabel="Document number" autoCapitalize="characters" autoCorrect={false} maxLength={30} />
        <FieldLabel>Name on Document *</FieldLabel>
        <Input value={form.name} onChangeText={set('name')} placeholder="Name as printed" maxLength={100} />
        <FieldLabel>Gender *</FieldLabel>
        <Select value={form.gender} options={opts(['Male', 'Female', 'Other'])} onChange={set('gender')} />
        <FieldLabel>Valid From * (no issue date on it? choose today)</FieldLabel>
        <DateSelect value={form.validFrom} onChange={set('validFrom')} maximumDate={new Date()} />
        <FieldLabel>Valid Till (if it has one)</FieldLabel>
        <DateSelect value={form.validTill} onChange={set('validTill')} />
        {!!error && <Text style={s.error}>{error}</Text>}
      </FormSheet>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </EssScreen>
  );
};

const s = StyleSheet.create({
  section: { fontSize: moderateScale(15), fontWeight: '800', marginBottom: moderateScale(8) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10), borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: moderateScale(14), fontWeight: '700' },
  rowSub: { fontSize: moderateScale(12), marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(7), gap: 10 },
  docText: { flex: 1, fontSize: moderateScale(14), fontWeight: '600' },
  note: { borderWidth: 1, borderRadius: moderateScale(10), padding: moderateScale(10), marginTop: moderateScale(10) },
  noteGood: { borderColor: 'rgba(34,181,115,0.45)', backgroundColor: 'rgba(34,181,115,0.10)' },
  noteBad: { borderColor: 'rgba(220,38,38,0.35)', backgroundColor: 'rgba(220,38,38,0.07)' },
  noteText: { fontSize: moderateScale(12), lineHeight: moderateScale(18) },
  suggestion: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  useBtn: { marginLeft: 8, paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(5), borderRadius: moderateScale(8), backgroundColor: COLORS.primaryDeep },
  useText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(12) },
  error: { color: '#DC2626', fontSize: moderateScale(12), marginTop: moderateScale(8) },
});

export default JoiningChecklistScreen;
