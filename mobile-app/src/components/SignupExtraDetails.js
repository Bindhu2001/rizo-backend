import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform, Switch, Keyboard, ActivityIndicator } from 'react-native';
import { Text, TextInput } from './AppText';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Pencil, Trash2, X, FileText, Calendar, ChevronDown, Check } from 'lucide-react-native';
import { moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import KeyboardSafeView from './KeyboardSafeView';
import KeyboardDoneBar, { doneBarId } from './KeyboardDoneBar';

// Sign-up's optional last step: the same Education, Experience, Family and Documents rows Employee
// Joining keeps, so HR finds them on the joiner's record. Nothing here is required to finish, but a row
// that is added follows the same rules as Employee Joining (rizo-revamp lib/childRowValidation.ts).

const PURPLE = '#4A148C';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20;
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const digits = (v) => v.replace(/\D/g, '');
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const toDate = (iso) => new Date(`${iso}T00:00:00`);
const prettyDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const years = (f) => [f.start_date, f.end_date].filter(Boolean).map((d) => d.slice(0, 4)).join('-');

const DOCUMENT_RULES = {
  Aadhaar: { pattern: /^\d{12}$/, max: 12, digits: true, hint: '12 digits', message: 'Aadhaar number must be exactly 12 digits.' },
  PAN: { pattern: /^[A-Z]{5}\d{4}[A-Z]$/, max: 10, hint: 'e.g. ABCDE1234F', message: 'PAN must be 5 letters, 4 digits and 1 letter.' },
  Passport: { pattern: /^[A-Z]\d{7}$/, max: 8, hint: 'e.g. A1234567', message: 'Passport number must be 1 letter and 7 digits.' },
  'Driving License': { pattern: /^[A-Z]{2}\d{13}$/, max: 15, hint: 'e.g. KL0720110012345', message: 'Driving licence must be 2 letters and 13 digits.' },
  'Voter ID': { pattern: /^[A-Z]{3}\d{7}$/, max: 10, hint: 'e.g. ABC1234567', message: 'Voter ID must be 3 letters and 7 digits.' },
};

// Employee Joining's lists (rizo-revamp lib/childRowValidation.ts).
const RELATIONS = ['Self', 'Mother', 'Father', 'Sister', 'Brother', 'Cousin', 'Spouse', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];
const cleanName = (v) => v.replace(/[^A-Za-z0-9.\s]/g, '');

const cleanNumber = (v, type) => {
  const rule = DOCUMENT_RULES[type];
  return (rule?.digits ? digits(v) : v.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).slice(0, rule?.max ?? 30);
};

// `check` returns the problem with a filled-in form, or ''. Date fields: `past` stops at today,
// `after` can't be before that field, and a date without `required` can be cleared.
const SECTIONS = [
  {
    key: 'education', title: 'Education', add: 'Add Education',
    fields: [
      { key: 'course', label: 'Course', required: true, max: 100 },
      // 100 = the web's limit (lib/employeeFieldLimits.ts CHILD_FIELD_LIMITS) and the DB column; longer failed the save
      { key: 'university', label: 'University / School', required: true, max: 100 },
      { key: 'start_date', label: 'From', type: 'date', required: true, past: true },
      { key: 'end_date', label: 'To', type: 'date', required: true, after: 'start_date' },
      { key: 'mark', label: 'Marks (%)', keyboard: 'decimal-pad', required: true, max: 6, clean: (v) => v.replace(/[^\d.]/g, '') },
    ],
    check: (f) => {
      if (f.end_date < f.start_date) return 'The To date cannot be before the From date.';
      return /^\d{1,3}(\.\d{1,2})?$/.test(f.mark) && Number(f.mark) <= 100 ? '' : 'Marks must be a percentage between 0 and 100.';
    },
    summary: (f) => [f.course, f.university, years(f), f.mark && `${f.mark}%`].filter(Boolean).join(', '),
  },
  {
    key: 'experience', title: 'Experience', add: 'Add Experience',
    fields: [
      { key: 'company', label: 'Company', required: true, max: 100 },
      { key: 'designation', label: 'Designation', required: true, max: 100 },
      { key: 'department', label: 'Department', required: true, max: 100 },
      { key: 'from_date', label: 'From', type: 'date', required: true, past: true },
      { key: 'to_date', label: 'To', type: 'date', required: true, past: true, after: 'from_date' },
      // Required, up to 10 digits — same as the web's Employee Joining experience row
      { key: 'salary', label: 'Salary', keyboard: 'number-pad', required: true, max: 10, clean: digits },
    ],
    check: (f) => (f.to_date < f.from_date ? 'The To date cannot be before the From date.' : ''),
    summary: (f) => [f.company, f.designation, `${prettyDate(f.from_date)} to ${prettyDate(f.to_date)}`].filter(Boolean).join(', '),
  },
  {
    key: 'family', title: 'Family', add: 'Add Family Member',
    fields: [
      { key: 'name', label: 'Name', required: true, max: 50, clean: cleanName },
      { key: 'relation', label: 'Relation', type: 'choice', required: true, options: RELATIONS },
      { key: 'gender', label: 'Gender', type: 'choice', required: true, options: GENDERS },
      { key: 'DOB', label: 'Date of Birth', type: 'date', required: true, past: true },
      { key: 'blood_group', label: 'Blood Group', type: 'choice', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { key: 'nationality', label: 'Nationality', initial: 'Indian', max: 50, clean: cleanName },
      { key: 'contact_number', label: 'Contact Number', required: true, keyboard: 'number-pad', max: 15, clean: digits },
      { key: 'alternate_number', label: 'Alternate Number', keyboard: 'number-pad', max: 15, clean: digits },
      { key: 'is_nominee', label: 'Nominee', type: 'switch' },
      { key: 'emergency_contact', label: 'Emergency contact', type: 'switch' },
    ],
    check: (f) => {
      if (f.contact_number.length < 10) return 'Contact number must be 10 to 15 digits.';
      return f.alternate_number && f.alternate_number.length < 10 ? 'Alternate number must be 10 to 15 digits.' : '';
    },
    summary: (f) => [f.name, f.relation, f.contact_number, f.is_nominee === 'Y' && 'Nominee'].filter(Boolean).join(', '),
  },
  {
    key: 'documents', title: 'Documents', add: 'Add Document',
    fields: [
      { key: 'document_type', label: 'Document Type', type: 'choice', required: true, options: ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Voter ID', 'Educational Certificate', 'Offer Letter', 'Relieving Letter', 'Other'] },
      { key: 'document_number', label: 'Document Number', required: true, documentNumber: true },
      { key: 'relation', label: 'Relation', type: 'choice', required: true, options: RELATIONS },
      { key: 'name', label: 'Name on Document', required: true, max: 50, clean: cleanName },
      { key: 'classification', label: 'Gender', type: 'choice', options: GENDERS },
      { key: 'nationality', label: 'Nationality', initial: 'Indian', max: 50, clean: cleanName },
      { key: 'valid_from', label: 'Valid From', type: 'date', required: true, past: true },
      { key: 'valid_till', label: 'Valid Till', type: 'date', after: 'valid_from' },
      { key: 'file', label: 'Photo or PDF', type: 'file', required: true },
    ],
    check: (f) => {
      const rule = DOCUMENT_RULES[f.document_type];
      if (rule && !rule.pattern.test(f.document_number)) return rule.message;
      if (f.valid_from && f.valid_till && f.valid_till < f.valid_from) return 'Valid Till cannot be before Valid From.';
      return '';
    },
    summary: (f) => [f.document_type, f.document_number, f.file?.name].filter(Boolean).join(', '),
  },
];

/** A file as a data address the server can store; null (after an alert) when it's too big. */
async function fileRow(uri, name, mime, size, showAlert) {
  const tooBig = () => {
    showAlert('warning', 'File Too Large', 'Please choose a photo or PDF up to 5 MB.');
    return null;
  };
  if (size && size > MAX_FILE_BYTES) return tooBig();
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  if (base64.length * 0.75 > MAX_FILE_BYTES) return tooBig();
  return { name, data: `data:${mime};base64,${base64}` };
}

/** Every date is picked from a calendar: nothing is typed. */
function DateField({ field, form, value, onChange, theme }) {
  const [open, setOpen] = useState(false);
  const earliest = field.after && form[field.after] ? toDate(form[field.after]) : undefined;
  const latest = field.past ? new Date() : undefined;
  const pick = (event, date) => {
    setOpen(false);
    if (event.type === 'set' && date) onChange(isoOf(date));
  };
  return (
    <>
      <View style={[styles.dateBox, { backgroundColor: theme.inputBg, borderColor: open ? PURPLE : theme.inputBorder }]}>
        <TouchableOpacity style={styles.dateMain} onPress={() => { Keyboard.dismiss(); setOpen((v) => !v); }} accessibilityRole="button" accessibilityLabel={`${field.label}: ${value ? prettyDate(value) : 'select date'}`}>
          <Calendar color={theme.textMuted} size={16} />
          <Text style={{ color: value ? theme.text : theme.textMuted, fontSize: moderateScale(14) }}>{value ? prettyDate(value) : 'Select date'}</Text>
        </TouchableOpacity>
        {!!value && !field.required && (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={HIT} style={styles.dateClear} accessibilityLabel={`Clear ${field.label}`}>
            <X color={theme.textMuted} size={16} />
          </TouchableOpacity>
        )}
      </View>
      {open && (
        <DateTimePicker
          value={value ? toDate(value) : (earliest || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant={theme.isDark ? 'dark' : 'light'}
          maximumDate={latest}
          minimumDate={earliest}
          onChange={pick}
        />
      )}
    </>
  );
}

export default function SignupExtraDetails({ value, onChange, showAlert, selfName }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(null); // { section, index (null = new), form }
  const [formError, setFormError] = useState('');
  const [reading, setReading] = useState(false);
  const [openChoice, setOpenChoice] = useState(null);
  const section = SECTIONS.find((s) => s.key === editing?.section);

  const openForm = (s, index = null) => {
    if (index === null && value[s.key].length >= MAX_ROWS) {
      showAlert('warning', 'Limit Reached', `You can add up to ${MAX_ROWS} here.`);
      return;
    }
    setFormError('');
    setOpenChoice(null);
    const start = Object.fromEntries(s.fields.filter((x) => x.initial).map((x) => [x.key, x.initial]));
    setEditing({ section: s.key, index, form: index === null ? start : { ...value[s.key][index] } });
  };
  const setField = (key, v) => {
    setFormError('');
    setEditing((e) => {
      const form = { ...e.form, [key]: v };
      // Each document type has its own number format.
      if (key === 'document_type' && v !== e.form.document_type) form.document_number = '';
      // Their own document or family row: the name is the one they signed up with.
      if (key === 'relation' && v === 'Self' && e.section === 'documents' && selfName) form.name = selfName;
      return { ...e, form };
    });
  };
  const remove = (s, index) => onChange({ ...value, [s.key]: value[s.key].filter((_, i) => i !== index) });

  const save = () => {
    Keyboard.dismiss();
    const f = Object.fromEntries(Object.entries(editing.form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const missing = section.fields.find((x) => x.required && !f[x.key]);
    if (missing) { setFormError(`${missing.label} is required.`); return; }
    const problem = section.check(f);
    if (problem) { setFormError(problem); return; }
    const rows = [...value[section.key]];
    if (editing.index === null) rows.push(f); else rows[editing.index] = f;
    onChange({ ...value, [section.key]: rows });
    setEditing(null);
  };

  const attach = async (load) => {
    setReading(true);
    try {
      const file = await load();
      if (file) setField('file', file);
    } catch (e) {
      setFormError('This file could not be read. Please try another.');
    } finally {
      setReading(false);
    }
  };
  const pickPhoto = (useCamera) => attach(async () => {
    const { status } = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setFormError('Camera or gallery access is required.'); return null; }
    const opts = { quality: 0.7 };
    const result = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled) return null;
    const asset = result.assets[0];
    return fileRow(asset.uri, asset.fileName || 'photo.jpg', asset.mimeType || 'image/jpeg', asset.fileSize, showAlert);
  });
  const pickPdf = () => attach(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return fileRow(asset.uri, asset.name, 'application/pdf', asset.size, showAlert);
  });

  const renderField = (field) => {
    const form = editing.form;
    const v = form[field.key] ?? '';
    if (field.type === 'switch') {
      return (
        <View key={field.key} style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.text, marginBottom: 0, flex: 1, marginRight: moderateScale(8) }]}>{field.label}</Text>
          <Switch value={v === 'Y'} onValueChange={(on) => setField(field.key, on ? 'Y' : 'N')} trackColor={{ true: PURPLE }} />
        </View>
      );
    }
    const rule = field.documentNumber ? DOCUMENT_RULES[form.document_type] : null;
    const keyboard = field.documentNumber && rule?.digits ? 'number-pad' : field.keyboard || 'default';
    return (
      <View key={field.key} style={styles.field}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{field.label}{field.required ? ' *' : ''}</Text>
        {field.type === 'date' && (
          <DateField field={field} form={form} value={v} onChange={(d) => setField(field.key, d)} theme={theme} />
        )}
        {field.type === 'choice' && (
          <>
            <TouchableOpacity
              style={[styles.dropdown, { backgroundColor: theme.inputBg, borderColor: openChoice === field.key ? PURPLE : theme.inputBorder }]}
              onPress={() => { Keyboard.dismiss(); setOpenChoice((k) => (k === field.key ? null : field.key)); }}
              accessibilityRole="button"
              accessibilityLabel={`${field.label}: ${v || 'select'}`}
            >
              <Text style={{ color: v ? theme.text : theme.textMuted, fontSize: moderateScale(14) }}>{v || `Select ${field.label}`}</Text>
              <ChevronDown color={theme.textMuted} size={18} />
            </TouchableOpacity>
            {openChoice === field.key && (
              <View style={[styles.dropdownList, { backgroundColor: theme.card, borderColor: theme.inputBorder }]}>
                {field.options.map((o) => (
                  <TouchableOpacity key={o} onPress={() => { setField(field.key, o); setOpenChoice(null); }} accessibilityRole="button" accessibilityState={{ selected: v === o }}
                    style={[styles.dropdownItem, { borderBottomColor: theme.inputBorder }]}>
                    <Text style={{ color: v === o ? PURPLE : theme.text, fontWeight: v === o ? '700' : '400', fontSize: moderateScale(14) }}>{o}</Text>
                    {v === o && <Check color={PURPLE} size={16} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
        {field.type === 'file' && (
          <>
            <View style={styles.chips}>
              {[['Camera', () => pickPhoto(true)], ['Gallery', () => pickPhoto(false)], ['PDF', pickPdf]].map(([label, press]) => (
                <TouchableOpacity key={label} onPress={press} disabled={reading} style={[styles.chip, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg, opacity: reading ? 0.5 : 1 }]}>
                  <Text style={{ color: theme.text, fontSize: moderateScale(12.5), fontWeight: '600' }}>{label}</Text>
                </TouchableOpacity>
              ))}
              {reading && <ActivityIndicator size="small" color={PURPLE} />}
            </View>
            {!!v?.name && (
              <View style={styles.fileName}>
                <FileText color={PURPLE} size={15} />
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: moderateScale(12.5), flex: 1 }}>{v.name}</Text>
                <TouchableOpacity onPress={() => setField('file', '')} hitSlop={HIT} accessibilityLabel="Remove file"><X color={theme.textMuted} size={16} /></TouchableOpacity>
              </View>
            )}
          </>
        )}
        {!field.type && (
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
            value={v}
            onChangeText={(t) => setField(field.key, field.documentNumber ? cleanNumber(t, form.document_type) : (field.clean ? field.clean(t) : t))}
            keyboardType={keyboard}
            placeholder={rule?.hint ?? field.placeholder}
            placeholderTextColor={theme.textMuted}
            maxLength={field.documentNumber ? (rule?.max ?? 30) : field.max}
            autoCapitalize={field.documentNumber ? 'characters' : 'words'}
            autoCorrect={false}
            returnKeyType="done"
            inputAccessoryViewID={doneBarId(keyboard)}
          />
        )}
      </View>
    );
  };

  return (
    <View>
      {SECTIONS.map((s) => (
        <View key={s.key} style={[styles.section, { borderColor: theme.inputBorder }]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{s.title}</Text>
            <TouchableOpacity onPress={() => openForm(s)} hitSlop={HIT} style={styles.addBtn} accessibilityRole="button" accessibilityLabel={s.add}>
              <Plus color={PURPLE} size={16} />
              <Text style={styles.addText}>Add</Text>
            </TouchableOpacity>
          </View>
          {value[s.key].map((row, i) => (
            <View key={`${s.key}${i}`} style={[styles.row, { backgroundColor: theme.inputBg }]}>
              <Text numberOfLines={2} style={[styles.rowText, { color: theme.text }]}>{s.summary(row)}</Text>
              <TouchableOpacity onPress={() => openForm(s, i)} hitSlop={HIT} style={styles.rowBtn} accessibilityLabel="Edit"><Pencil color={theme.textMuted} size={16} /></TouchableOpacity>
              <TouchableOpacity onPress={() => remove(s, i)} hitSlop={HIT} style={styles.rowBtn} accessibilityLabel="Remove"><Trash2 color="#DC2626" size={16} /></TouchableOpacity>
            </View>
          ))}
        </View>
      ))}

      <Modal visible={!!editing} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setEditing(null)}>
        <KeyboardSafeView style={[styles.overlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{section?.add}</Text>
              <TouchableOpacity onPress={() => setEditing(null)} hitSlop={HIT} accessibilityLabel="Close"><X color={theme.textMuted} size={22} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
              {section?.fields.map(renderField)}
              {!!formError && <Text style={styles.error}>{formError}</Text>}
              <TouchableOpacity style={[styles.saveBtn, reading && { opacity: 0.6 }]} onPress={save} disabled={reading} accessibilityRole="button">
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <KeyboardDoneBar />
        </KeyboardSafeView>
      </Modal>
    </View>
  );
}

/** The rows `register` saves itself. Documents go one at a time. Education's dates are stored as its years. */
export function signupRows(details) {
  return {
    education: details.education.map((row) => ({ ...row, duration: years(row) })),
    experience: details.experience,
    family: details.family,
  };
}

export const EMPTY_SIGNUP_DETAILS = { education: [], experience: [], family: [], documents: [] };

/** A document's fields for signupDocument. */
export function documentPayload(doc) {
  return {
    document_type: doc.document_type,
    document_number: doc.document_number,
    name: doc.name,
    relation: doc.relation,
    classification: doc.classification || '',
    nationality: doc.nationality || 'Indian',
    valid_from: doc.valid_from || today(),
    valid_till: doc.valid_till || '',
    file: doc.file?.data,
  };
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: 12, padding: moderateScale(12), marginBottom: moderateScale(12) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: moderateScale(15), fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
  addText: { color: PURPLE, fontSize: moderateScale(13), fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingLeft: 10, marginTop: 8 },
  rowText: { flex: 1, fontSize: moderateScale(12.5), paddingVertical: 8 },
  rowBtn: { padding: 9 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: moderateScale(18), paddingTop: moderateScale(18) },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: moderateScale(17), fontWeight: '800' },
  field: { marginBottom: moderateScale(12) },
  label: { fontSize: moderateScale(12.5), fontWeight: '600', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: moderateScale(14) },
  dateBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10 },
  dateMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  dateClear: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  dropdownList: { borderWidth: 1, borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  fileName: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: moderateScale(8) },
  error: { color: '#DC2626', fontSize: moderateScale(13), marginBottom: 8 },
  saveBtn: { backgroundColor: PURPLE, borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: 4, marginBottom: 8 },
  saveText: { color: '#FFF', fontSize: moderateScale(15), fontWeight: '700' },
});
