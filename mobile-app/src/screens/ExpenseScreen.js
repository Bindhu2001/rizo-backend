import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Modal, Dimensions, Platform, Pressable
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, ChevronDown,
  CheckCircle, FileText, X, Paperclip, Clock
} from 'lucide-react-native';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';

const { width } = Dimensions.get('window');

const STATUS_COLORS = {
  Approved: { bg: '#DCFCE7', text: '#059669', side: '#D1FAE5' },
  Applied: { bg: '#DBEAFE', text: '#2563EB', side: '#DBEAFE' },
  Rejected: { bg: '#FEE2E2', text: '#DC2626', side: '#FEE2E2' },
  Authorised: { bg: '#FEF3C7', text: '#D97706', side: '#FEF3C7' },
};

const statusColor = (s) => {
  const norm = (s || '').trim().toLowerCase();
  if (norm === 'approved' || norm === 'a') return STATUS_COLORS.Approved;
  if (norm === 'applied' || norm === 'pending' || norm === 'p') return STATUS_COLORS.Applied;
  if (norm === 'rejected' || norm === 'r') return STATUS_COLORS.Rejected;
  if (norm === 'authorised' || norm === 'authorized') return STATUS_COLORS.Authorised;
  return { bg: '#F3F4F6', text: '#6B7280', side: '#9CA3AF' };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Header = ({ title, onBack }) => (
  <View style={h.header}>
    <TouchableOpacity onPress={onBack} style={h.back}>
      <ChevronLeft color={COLORS.text} size={26} />
    </TouchableOpacity>
    <Text style={h.title}>{title}</Text>
    <View style={{ width: 44 }} />
  </View>
);
const h = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 56, backgroundColor: '#FFF' },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
});

// ─── File Thumbnail ───────────────────────────────────────────────────────────
const FileThumbnail = ({ file, onRemove }) => {
  const isPDF = file.mimeType === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <View style={ft.wrap}>
      <View style={[ft.thumb, isPDF && { backgroundColor: '#FEE2E2' }]}>
        {isPDF ? <FileText color="#DC2626" size={22} /> : <Text style={ft.ext}>{file.name?.split('.').pop()?.toUpperCase() || 'IMG'}</Text>}
      </View>
      <Text style={ft.name} numberOfLines={1}>{file.name}</Text>
      <TouchableOpacity style={ft.remove} onPress={onRemove}>
        <X color="#FFF" size={10} />
      </TouchableOpacity>
    </View>
  );
};
const ft = StyleSheet.create({
  wrap: { width: 72, marginRight: 10, alignItems: 'center', position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  ext: { fontSize: 11, fontWeight: '900', color: '#1D4ED8' },
  name: { fontSize: 9, color: '#6B7280', marginTop: 4, textAlign: 'center', maxWidth: 70 },
  remove: { position: 'absolute', top: -4, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
});

// ─── Calendar Modal ──────────────────────────────────────────────────────────
const CalendarModal = ({ visible, selectedDate, onClose, onConfirm }) => {
  const [currentMonth, setCurrentMonth] = useState(selectedDate ? new Date(selectedDate) : new Date());

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayIndex = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const handleSelect = (d) => {
    const yyyy = currentMonth.getFullYear();
    const mm = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onConfirm(`${yyyy}-${mm}-${dd}`);
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={cal.overlay} activeOpacity={1} onPress={onClose}>
        <View style={cal.box}>
          <View style={cal.header}>
            <TouchableOpacity onPress={prevMonth} style={cal.arrowBtn}><ChevronLeft color="#111827" size={24} /></TouchableOpacity>
            <Text style={cal.headerTitle}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
            <TouchableOpacity onPress={nextMonth} style={cal.arrowBtn}><ChevronRight color="#111827" size={24} /></TouchableOpacity>
          </View>
          <View style={cal.daysHeader}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => <Text key={x} style={cal.dhText}>{x}</Text>)}
          </View>
          <View style={cal.grid}>
            {days.map((d, i) => {
              const isSelected = d && `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` === selectedDate;
              return (
                <TouchableOpacity key={i} style={[cal.cell, isSelected && cal.cellSelected]} onPress={() => d && handleSelect(d)} disabled={!d}>
                  <Text style={[cal.cellText, isSelected && cal.cellTextSelected]}>{d || ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};
const cal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...SHADOWS.medium },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  arrowBtn: { padding: 4 },
  daysHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 10, marginBottom: 10 },
  dhText: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#6B7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSelected: { backgroundColor: COLORS.primaryDeep, borderRadius: 20 },
  cellText: { fontSize: 14, color: '#111827', fontWeight: '500' },
  cellTextSelected: { color: '#FFF', fontWeight: '800' }
});

// ─── Selection Modal ───────────────────────────────────────────────────────
const SelectionModal = ({ visible, options, selectedValue, onClose, onSelect, title, labelKey = 'label', valueKey = 'value' }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={sm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={sm.sheet}>
        <View style={sm.handle} />
        {title && <Text style={sm.title}>{title}</Text>}
        <ScrollView style={{ maxHeight: 300 }}>
          {options.map((opt, i) => {
            const isStr = typeof opt === 'string';
            const val = isStr ? opt : opt[valueKey];
            const lab = isStr ? opt : opt[labelKey];
            return (
              <TouchableOpacity key={i} style={sm.item} onPress={() => { onSelect(opt); onClose(); }}>
                <Text style={[sm.itemText, val === selectedValue && sm.itemTextActive]}>{lab}</Text>
                {val === selectedValue && <CheckCircle color={COLORS.primaryDeep} size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </TouchableOpacity>
  </Modal>
);
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: 15, color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

// ─── ExpenseScreen ─────────────────────────────────────────────────────────────
const ExpenseScreen = ({ navigation, route }) => {
  const user = route?.params?.user;

  const [view, setView] = useState('LIST');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenseType, setExpenseType] = useState(null);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [expenseDate, setExpenseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [purpose, setPurpose] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAuthPicker, setShowAuthPicker] = useState(false);
  const [showAppPicker, setShowAppPicker] = useState(false);
  const [authBy, setAuthBy] = useState('John Doe');
  const [appBy, setAppBy] = useState('Ajil Walker');
  const [detailModal, setDetailModal] = useState(null);

  useEffect(() => {
    if (!user) navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  }, [user, navigation]);

  if (!user) return null;

  const tempAuths = ['John Doe', 'Sarah Miller', 'Alex Walker'];
  const tempApps = ['Ajil Walker', 'Michael Smith', 'HR Dept'];

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const [expRes, typeRes] = await Promise.all([
        axios.post(API_ENDPOINTS.GET_SUBMITTED_EXPENSES, { user_id: user.user_id }).catch(() => null),
        axios.post(API_ENDPOINTS.GET_EXPENSE_TYPES, { user_id: user.user_id }).catch(() => null)
      ]);

      if (expRes?.data?.success && Array.isArray(expRes?.data?.data)) {
        setExpenses(expRes.data.data.filter(Boolean));
      } else {
        setExpenses([]);
      }

      if (typeRes?.data?.success && Array.isArray(typeRes?.data?.data)) {
        const mappedTypes = typeRes.data.data.map(t => ({
          id: t.expense_type_pkey,
          name: t.expense_type_name
        }));
        setExpenseTypes(mappedTypes);
      }
    } catch (e) {
      console.log('Error fetching expenses:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchExpenses();
      // Reset apply form view if returning from success
      if (view === 'SUCCESS') setView('LIST');
    }, [user])
  );

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/jpg', 'application/pdf'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const oversized = result.assets.filter(file => file.size > 5 * 1024 * 1024);
        if (oversized.length > 0) {
          showAlert('warning', 'File Too Large', 'One or more files exceed the 5MB limit. Please select smaller files.');
          return;
        }
        const valid = result.assets.filter(f => ['image/jpeg', 'image/jpg', 'application/pdf'].includes(f.mimeType));
        if (valid.length < result.assets.length)
          showAlert('warning', 'Invalid Files', 'Only JPG, JPEG, and PDF files are allowed.');
        setAttachedFiles(prev => [...prev, ...valid]);
      }
    } catch (e) {
      showAlert('error', 'Error', 'Could not open file picker.');
    }
  };

  const submitExpense = async () => {
    if (!expenseType) { showAlert('warning', 'Missing Type', 'Please select Expense Type'); return; }
    if (!amount.trim()) { showAlert('warning', 'Missing Amount', 'Please enter Amount'); return; }
    if (!expenseDate) { showAlert('warning', 'Missing Date', 'Please select Date'); return; }
    if (!remarks.trim() && !purpose.trim()) { showAlert('warning', 'Missing Details', 'Please enter Remarks or Purpose'); return; }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('expense_type', expenseType.id);
      formData.append('expense_date', expenseDate);
      formData.append('amount', amount);
      formData.append('remarks', remarks);
      formData.append('purpose', purpose);
      formData.append('authorized_by', '0'); // Mocked
      formData.append('approved_by', '0'); // Mocked

      // Convert all files to Base64 before sending
      for (let i = 0; i < attachedFiles.length; i++) {
        const file = attachedFiles[i];
        try {
          const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
          const mime = file.mimeType || 'image/jpeg';
          formData.append(`file_${i}`, `data:${mime};base64,${base64}`);
        } catch (fileErr) {
          console.log(`Error reading file ${i}:`, fileErr);
        }
      }

      const res = await axios.post(API_ENDPOINTS.SUBMIT_EXPENSE, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.success === 1 || res.data?.success === true) {
        setView('SUCCESS');
        // Reset form
        setExpenseType(null); setExpenseDate(''); setAmount(''); setRemarks(''); setPurpose(''); setAttachedFiles([]);
      } else {
        showAlert('error', 'Notice', res.data?.message || 'Submission failed.');
      }
    } catch (e) {
      showAlert('error', 'Error', 'Failed to submit expense.\n' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const ExpenseCard = ({ item }) => {
    const sc = statusColor(item.expense_status);
    return (
      <TouchableOpacity onPress={() => setDetailModal(item)} activeOpacity={0.8} style={c.card}>
        <View style={[c.sideBar, { backgroundColor: sc.side }]}>
          <Text style={[c.sideText, { color: sc.text }]}>{(item.expense_status || 'Applied').toUpperCase()}</Text>
        </View>
        <View style={c.body}>
          <View style={c.row}>
            <View style={{ flex: 1 }}>
              <Text style={c.title}>{item.expense_type_name || `Expense Type ${item.expense_type}`}</Text>
              <Text style={c.date}>{item.expense_date}</Text>
              <Text style={c.remarks} numberOfLines={1}>Remarks : {item.remarks || 'None'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={c.amount}>₹{(!isNaN(parseFloat(item.expenses_amount)) ? parseFloat(item.expenses_amount) : 0).toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {view === 'LIST' && (
        <View style={{ flex: 1 }}>
          <Header title="Expenses" onBack={() => navigation.goBack()} />
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primaryDeep} style={{ marginTop: 60 }} />
          ) : (
            <ScrollView contentContainerStyle={s.scroll}>
              {expenses.length === 0 ? (
                <View style={s.emptyWrap}>
                  <FileText color="#D1D5DB" size={48} style={{ marginBottom: 16 }} />
                  <Text style={{ color: '#9CA3AF', fontWeight: '600' }}>No expenses submitted yet</Text>
                </View>
              ) : (
                expenses.map((exp, idx) => <ExpenseCard key={exp.emp_expenses_pkey || String(idx)} item={exp} />)
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={s.fab} activeOpacity={0.8} onPress={() => setView('APPLY')}>
            <Plus color="#FFF" size={28} />
          </TouchableOpacity>
        </View>
      )}

      {view === 'APPLY' && (
        <View style={{ flex: 1 }}>
          <Header title="Create Expenses" onBack={() => setView('LIST')} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            {/* Expense Type */}
            <View style={s.inputBox}>
              <Text style={s.label}>Expense Type</Text>
              <TouchableOpacity style={s.inputRow} onPress={() => setShowTypePicker(true)}>
                <Text style={[s.inputVal, !expenseType && { color: '#9CA3AF' }]}>{expenseType?.name || 'Select Type'}</Text>
                <ChevronDown color="#9CA3AF" size={16} />
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <View style={s.inputBox}>
              <Text style={s.label}>Amount (₹)</Text>
              <TextInput style={s.inputRow} value={amount} onChangeText={setAmount} placeholder="e.g. 500" keyboardType="numeric" placeholderTextColor="#D1D5DB" maxLength={20} />
            </View>

            {/* Date */}
            <View style={s.inputBox}>
              <Text style={s.label}>Select Date</Text>
              <TouchableOpacity style={s.inputRow} onPress={() => setShowDatePicker(true)}>
                <Text style={[s.inputVal, !expenseDate && { color: '#9CA3AF' }]}>{expenseDate || 'YYYY-MM-DD'}</Text>
                <CalendarIcon color="#9CA3AF" size={16} />
              </TouchableOpacity>
            </View>

            {/* Authorised By */}
            <View style={s.inputBox}>
              <Text style={s.label}>Authorised By</Text>
              <TouchableOpacity style={s.inputRow} onPress={() => setShowAuthPicker(true)}>
                <Text style={s.inputVal}>{authBy}</Text>
                <ChevronDown color="#9CA3AF" size={16} />
              </TouchableOpacity>
            </View>

            {/* Approved By */}
            <View style={s.inputBox}>
              <Text style={s.label}>Approved By</Text>
              <TouchableOpacity style={s.inputRow} onPress={() => setShowAppPicker(true)}>
                <Text style={s.inputVal}>{appBy}</Text>
                <ChevronDown color="#9CA3AF" size={16} />
              </TouchableOpacity>
            </View>

            {/* Remarks */}
            <View style={s.inputBox}>
              <Text style={s.label}>Remarks</Text>
              <TextInput style={[s.inputRow, s.textArea]} value={remarks} onChangeText={setRemarks} multiline placeholder="Enter remarks..." placeholderTextColor="#D1D5DB" maxLength={50} />
            </View>

            {/* Purpose */}
            <View style={s.inputBox}>
              <Text style={s.label}>Purpose</Text>
              <TextInput style={[s.inputRow, s.textArea]} value={purpose} onChangeText={setPurpose} multiline placeholder="Enter purpose..." placeholderTextColor="#D1D5DB" maxLength={50} />
            </View>

            {/* Files */}
            <View style={s.fileBox}>
              <TouchableOpacity style={s.addFilesBtn} onPress={pickFile}>
                <Paperclip color={COLORS.primaryDeep} size={14} />
                <Text style={s.addFilesText}> Add files</Text>
              </TouchableOpacity>

              {attachedFiles.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                  {attachedFiles.map((f, i) => (
                    <FileThumbnail key={i} file={f} onRemove={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} />
                  ))}
                  <TouchableOpacity style={s.addMoreThumb} onPress={pickFile}>
                    <Text style={s.addMorePlus}>+</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>

            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.7 }]} onPress={submitExpense} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitText}>SUBMIT REQUEST</Text>}
            </TouchableOpacity>
            <View style={{ height: 20 }} />

          </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}

      {view === 'SUCCESS' && (
        <View style={s.successWrap}>
          <View style={s.successCircle}><CheckCircle color="#10B981" size={80} strokeWidth={2} /></View>
          <Text style={s.successTitle}>Request Sent Successfully!</Text>
          <Text style={s.successSub}>Your expense request has been sent successfully, We will get back to you shortly!</Text>
          <TouchableOpacity style={s.goHomeBtn} onPress={() => { setView('LIST'); fetchExpenses(); }}>
            <Text style={s.goHomeText}>Go Back Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pickers */}
      <SelectionModal visible={showTypePicker} title="Select Expense Type" options={expenseTypes} selectedValue={expenseType?.id} labelKey="name" valueKey="id" onClose={() => setShowTypePicker(false)} onSelect={(t) => setExpenseType(t)} />
      <SelectionModal visible={showAuthPicker} title="Authorised By" options={tempAuths} selectedValue={authBy} onClose={() => setShowAuthPicker(false)} onSelect={setAuthBy} />
      <SelectionModal visible={showAppPicker} title="Approved By" options={tempApps} selectedValue={appBy} onClose={() => setShowAppPicker(false)} onSelect={setAppBy} />

      <CalendarModal visible={showDatePicker} selectedDate={expenseDate} onClose={() => setShowDatePicker(false)} onConfirm={(d) => { setExpenseDate(d); setShowDatePicker(false); }} />

      {/* Detail Expanding Modal */}
      {detailModal && (
        <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)} statusBarTranslucent>
          <TouchableOpacity style={dm.overlay} activeOpacity={1} onPress={() => setDetailModal(null)}>
            <View style={dm.card}>
              <View style={[dm.sideBar, { backgroundColor: statusColor(detailModal.expense_status).side }]}>
                <Text style={[dm.sideText, { color: statusColor(detailModal.expense_status).text }]}>{(detailModal.expense_status || 'Applied').toUpperCase()}</Text>
              </View>
              <View style={dm.body}>
                <Text style={dm.title}>{detailModal.expense_type_name}</Text>
                <Text style={dm.date}>{detailModal.expense_date}</Text>

                <Text style={dm.info}>Authorised By : {detailModal.authorized_by || 'John Doe'}</Text>
                <Text style={dm.info}>Approved By : {detailModal.approved_by || 'Ajil'}</Text>
                <Text style={dm.info}>Remarks : {detailModal.remarks}</Text>

                {/* Example files if present. API returned `image:""` so let's check it */}
                {!!detailModal.image && (
                  <View style={dm.fileChip}>
                    <FileText color="#DC2626" size={14} style={{ marginRight: 6 }} />
                    <Text style={dm.fileChipText}>Attachment</Text>
                  </View>
                )}

                <Text style={dm.amountLabel}>Claimed Amount: <Text style={{ color: '#111827' }}>₹{(!isNaN(parseFloat(detailModal.expenses_amount)) ? parseFloat(detailModal.expenses_amount) : 0).toFixed(2)}</Text></Text>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 20, paddingBottom: 100 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#4C1D95', justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },

  // Inputs
  inputBox: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', marginBottom: 8, marginLeft: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, height: 50 },
  inputVal: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },
  textArea: { height: 100, textAlignVertical: 'top', paddingTop: 16, borderStyle: 'solid' }, // If it's active field we could tint border

  fileBox: { marginBottom: 24, paddingHorizontal: 4 },
  addFilesBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  addFilesText: { color: COLORS.primaryDeep, fontWeight: '700', fontSize: 13 },
  addMoreThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed' },
  addMorePlus: { fontSize: 24, color: '#9CA3AF', fontWeight: '300' },

  submitBtn: { backgroundColor: '#4C1D95', height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  submitText: { color: '#FFF', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  emptyWrap: { alignItems: 'center', marginTop: 80 },

  // Success
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: '#FFF' },
  successCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  successTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 14 },
  successSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 50 },
  goHomeBtn: { width: '100%', height: 54, borderRadius: 30, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  goHomeText: { color: COLORS.text, fontWeight: '800' },
});

const c = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, overflow: 'hidden', ...SHADOWS.light, borderWidth: 1, borderColor: '#F3F4F6', height: 86 },
  sideBar: { width: 32, justifyContent: 'center', alignItems: 'center' },
  sideText: { fontSize: 8, fontWeight: '900', letterSpacing: 1, transform: [{ rotate: '-90deg' }], width: 80, textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, justifyContent: 'center' },
  row: { flexDirection: 'row' },
  title: { fontSize: 13, fontWeight: '800', color: '#111827', marginBottom: 3 },
  date: { fontSize: 11, color: '#6B7280', marginBottom: 6, fontWeight: '500' },
  remarks: { fontSize: 11, color: '#9CA3AF' },
  amount: { fontSize: 15, fontWeight: '900', color: '#1D4ED8' }
});

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', ...SHADOWS.medium, borderWidth: 1, borderColor: '#F3F4F6' },
  sideBar: { width: 36, justifyContent: 'center', alignItems: 'center' },
  sideText: { fontSize: 10, fontWeight: '900', letterSpacing: 2, transform: [{ rotate: '-90deg' }], width: 140, textAlign: 'center' },
  body: { flex: 1, padding: 20 },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4 },
  date: { fontSize: 12, color: '#6B7280', marginBottom: 16, fontWeight: '500' },
  info: { fontSize: 12, color: '#4B5563', marginBottom: 8, lineHeight: 18, fontWeight: '500' },
  amountLabel: { fontSize: 13, color: '#4B5563', fontWeight: '800', marginTop: 16 },
  fileChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  fileChipText: { fontSize: 11, color: '#4B5563', fontWeight: '600' }
});

export default ExpenseScreen;
