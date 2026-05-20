import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Modal, Dimensions, Platform, Pressable, KeyboardAvoidingView, RefreshControl
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
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { API_ENDPOINTS } from '../constants/Config';
import NotificationManager from '../services/NotificationManager';

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
const Header = ({ title, onBack, theme }) => (
  <View style={[h.header, theme && { backgroundColor: theme.bg }]}>
    <TouchableOpacity onPress={onBack} style={h.back}>
      <ChevronLeft color={theme ? theme.text : COLORS.text} size={26} />
    </TouchableOpacity>
    <Text style={[h.title, theme && { color: theme.text }]}>{title}</Text>
    <View style={{ width: 44 }} />
  </View>
);
const h = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56), backgroundColor: '#FFF' },
  back: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: moderateScale(17), fontWeight: '800', color: COLORS.text },
});

// ─── File Thumbnail ───────────────────────────────────────────────────────────
const FileThumbnail = ({ file, onRemove }) => {
  const theme = useTheme();
  const isPDF = file.mimeType === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <View style={ft.wrap}>
      <View style={[ft.thumb, { backgroundColor: theme.cardSoft, borderColor: theme.border }, isPDF && { backgroundColor: '#FEE2E2' }]}>
        {isPDF ? <FileText color="#DC2626" size={22} /> : <Text style={ft.ext}>{file.name?.split('.').pop()?.toUpperCase() || 'IMG'}</Text>}
        <TouchableOpacity style={ft.remove} onPress={onRemove}>
          <X color="#FFF" size={10} />
        </TouchableOpacity>
      </View>
      <Text style={[ft.name, { color: theme.textLight }]} numberOfLines={1}>{file.name}</Text>
    </View>
  );
};
const ft = StyleSheet.create({
  wrap: { width: moderateScale(72), marginRight: moderateScale(10), alignItems: 'center', overflow: 'visible', paddingTop: moderateScale(10) },
  thumb: { width: moderateScale(64), height: moderateScale(64), borderRadius: moderateScale(10), backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', overflow: 'visible' },
  ext: { fontSize: moderateScale(11), fontWeight: '900', color: '#1D4ED8' },
  name: { fontSize: moderateScale(9), color: '#6B7280', marginTop: 4, textAlign: 'center', maxWidth: 70 },
  remove: { position: 'absolute', top: -8, right: -8, width: moderateScale(22), height: moderateScale(22), borderRadius: moderateScale(11), backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
});

// ─── Calendar Modal ──────────────────────────────────────────────────────────
const CalendarModal = ({ visible, selectedDate, onClose, onConfirm, minDate }) => {
  const theme = useTheme();
  const [currentMonth, setCurrentMonth] = useState(selectedDate ? new Date(selectedDate) : new Date());

  useEffect(() => {
    if (visible) setCurrentMonth(selectedDate ? new Date(selectedDate) : new Date());
  }, [visible]);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayIndex = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const minYM = minDate ? minDate.slice(0, 7) : null;
  const curYM = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  const atMinMonth = !!minYM && curYM <= minYM;

  const prevMonth = () => { if (!atMinMonth) setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); };
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
      <TouchableOpacity style={[cal.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
        <View style={[cal.box, { backgroundColor: theme.card }]}>
          <View style={cal.header}>
            <TouchableOpacity onPress={prevMonth} style={[cal.arrowBtn, atMinMonth && { opacity: 0.25 }]} disabled={atMinMonth}><ChevronLeft color={theme.text} size={24} /></TouchableOpacity>
            <Text style={[cal.headerTitle, { color: theme.text }]}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
            <TouchableOpacity onPress={nextMonth} style={cal.arrowBtn}><ChevronRight color={theme.text} size={24} /></TouchableOpacity>
          </View>
          <View style={[cal.daysHeader, { borderBottomColor: theme.divider }]}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => <Text key={x} style={[cal.dhText, { color: theme.textLight }]}>{x}</Text>)}
          </View>
          <View style={cal.grid}>
            {days.map((d, i) => {
              const dateStr = d ? `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
              const isSelected = dateStr === selectedDate;
              const isDisabled = !d || (minDate && dateStr < minDate);
              return (
                <TouchableOpacity key={i} style={[cal.cell, isSelected && cal.cellSelected]} onPress={() => !isDisabled && handleSelect(d)} disabled={isDisabled}>
                  <Text style={[cal.cellText, { color: theme.text }, isSelected && cal.cellTextSelected, isDisabled && d && { opacity: 0.25 }]}>{d || ''}</Text>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: moderateScale(24) },
  box: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), ...SHADOWS.medium },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: moderateScale(20) },
  headerTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827' },
  arrowBtn: { padding: 4 },
  daysHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: moderateScale(10), marginBottom: moderateScale(10) },
  dhText: { flex: 1, textAlign: 'center', fontSize: moderateScale(13), fontWeight: '700', color: '#6B7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSelected: { backgroundColor: COLORS.primaryDeep, borderRadius: moderateScale(20) },
  cellText: { fontSize: moderateScale(14), color: '#111827', fontWeight: '500' },
  cellTextSelected: { color: '#FFF', fontWeight: '800' }
});

// ─── Selection Modal ───────────────────────────────────────────────────────
const SelectionModal = ({ visible, options, selectedValue, onClose, onSelect, title, labelKey = 'label', valueKey = 'value' }) => {
  const theme = useTheme();
  return (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={[sm.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
      <View style={[sm.sheet, { backgroundColor: theme.card }]}>
        <View style={[sm.handle, { backgroundColor: theme.border }]} />
        {title && <Text style={[sm.title, { color: theme.text }]}>{title}</Text>}
        <ScrollView style={{ maxHeight: 300 }}>
          {options.map((opt, i) => {
            const isStr = typeof opt === 'string';
            const val = isStr ? opt : opt[valueKey];
            const lab = isStr ? opt : opt[labelKey];
            return (
              <TouchableOpacity key={i} style={[sm.item, { borderBottomColor: theme.divider }]} onPress={() => { onSelect(opt); onClose(); }}>
                <Text style={[sm.itemText, { color: theme.textLight }, val === selectedValue && { color: theme.text, fontWeight: '600' }]}>{lab}</Text>
                {val === selectedValue && <CheckCircle color={theme.primaryDeep} size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </TouchableOpacity>
  </Modal>
  );
};
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  handle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  title: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: moderateScale(16) },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: moderateScale(15), color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

// ─── ExpenseScreen ─────────────────────────────────────────────────────────────
const ExpenseScreen = ({ navigation, route }) => {
  const theme = useTheme();
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
  const [refreshing, setRefreshing] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAuthPicker, setShowAuthPicker] = useState(false);
  const [showAppPicker, setShowAppPicker] = useState(false);
  // authBy / appBy hold the full selected person object: { key, name, emp_id }
  const [authBy, setAuthBy] = useState(null);
  const [appBy, setAppBy] = useState(null);
  const [authPersons, setAuthPersons] = useState([]);
  const [appPersons, setAppPersons] = useState([]);
  const [detailModal, setDetailModal] = useState(null);
  const [removingExpenseId, setRemovingExpenseId] = useState(null);

  useEffect(() => {
    if (!user) navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  }, [user, navigation]);

  if (!user) return null;

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchExpenses();
    setRefreshing(false);
  };

  // Normalises both authorized_persons (emp_key) and approved_persons (key)
  // into a single { key, name, emp_id } shape so the picker behaves uniformly.
  const normalizePerson = (p) => ({
    key: String(p.key ?? p.emp_key ?? ''),
    name: (p.name || '').trim(),
    emp_id: p.emp_id || '',
  });

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const [expRes, typeRes, approverRes] = await Promise.all([
        axios.post(API_ENDPOINTS.GET_SUBMITTED_EXPENSES, { user_id: user.user_id }).catch(() => null),
        axios.post(API_ENDPOINTS.GET_EXPENSE_TYPES, { user_id: user.user_id }).catch(() => null),
        axios.post(`${API_ENDPOINTS.APPROVERS}?user_id=${encodeURIComponent(user.user_id)}`, null).catch(() => null),
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

      if (approverRes?.data?.success) {
        const auths = (approverRes.data.data?.authorized_persons || []).map(normalizePerson);
        const apps = (approverRes.data.data?.approved_persons || []).map(normalizePerson);
        setAuthPersons(auths);
        setAppPersons(apps);
        // Default selection on first load (only if user hasn't picked yet)
        setAuthBy(prev => prev || auths[0] || null);
        setAppBy(prev => prev || apps[0] || null);
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

  const handleRemoveExpense = (expense) => {
    const expenseId = expense.emp_expenses_pkey;
    showAlert('warning', 'Remove Expense', 'Are you sure you want to remove this expense?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Remove', style: 'destructive', onPress: async () => {
          setRemovingExpenseId(expenseId);
          try {
            const res = await axios.post(API_ENDPOINTS.EXPENSE_REMOVE, { expense_id: String(expenseId), user_id: user.user_id });
            if (res.data?.success === 1 || res.data?.success === true) {
              setDetailModal(null);
              showAlert('success', 'Removed', 'Expense removed successfully.');
              fetchExpenses();
            } else {
              showAlert('error', 'Failed', res.data?.message || 'Could not remove expense.');
            }
          } catch (e) {
            showAlert('error', 'Error', 'Failed to remove expense. Please try again.');
          } finally {
            setRemovingExpenseId(null);
          }
        }
      },
    ]);
  };

  const submitExpense = async () => {
    if (!expenseType) { showAlert('warning', 'Missing Type', 'Please select Expense Type'); return; }
    if (!amount.trim()) { showAlert('warning', 'Missing Amount', 'Please enter Amount'); return; }
    if (!expenseDate) { showAlert('warning', 'Missing Date', 'Please select Date'); return; }
    if (!remarks.trim() && !purpose.trim()) { showAlert('warning', 'Missing Details', 'Please enter Remarks or Purpose'); return; }

    setSubmitting(true);
    try {
      const affectedMonth = expenseDate;
      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('expense_type', expenseType.id);
      formData.append('expense_date', expenseDate);
      formData.append('affected_month', affectedMonth);
      formData.append('expenses_amount', amount);
      formData.append('remarks', remarks);
      formData.append('purpose', purpose);
      formData.append('authorized_by', authBy?.key || '0');
      formData.append('approved_by', appBy?.key || '0');

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
        NotificationManager.forceCheck().catch(() => {});
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

  const resolvedStatus = (item) => {
    const s = (item.expense_status || '').trim().toLowerCase();
    if ((s === 'authorised' || s === 'authorized') && item.authorized_by && item.approved_by && item.authorized_by === item.approved_by) {
      return 'Approved';
    }
    return item.expense_status;
  };

  const ExpenseCard = ({ item }) => {
    const sc = statusColor(resolvedStatus(item));
    return (
      <TouchableOpacity onPress={() => setDetailModal(item)} activeOpacity={0.8} style={[c.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[c.sideBar, { backgroundColor: sc.side }]}>
          <Text style={[c.sideText, { color: sc.text }]}>{(resolvedStatus(item) || 'Applied').toUpperCase()}</Text>
        </View>
        <View style={c.body}>
          <View style={c.row}>
            <View style={{ flex: 1 }}>
              <Text style={[c.title, { color: theme.text }]}>{item.expense_type_name || `Expense Type ${item.expense_type}`}</Text>
              <Text style={[c.date, { color: theme.textLight }]}>{item.expense_date}</Text>
              <Text style={[c.remarks, { color: theme.textMuted }]} numberOfLines={1}>Remarks : {item.remarks || 'None'}</Text>
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
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
      {view === 'LIST' && (
        <View style={{ flex: 1 }}>
          <Header title="Expenses" onBack={() => navigation.goBack()} theme={theme} />
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primaryDeep} style={{ marginTop: 60 }} />
          ) : (
            <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}>
              {expenses.length === 0 ? (
                <View style={s.emptyWrap}>
                  <FileText color={theme.textMuted} size={48} style={{ marginBottom: 16 }} />
                  <Text style={{ color: theme.textMuted, fontWeight: '600' }}>No expenses submitted yet</Text>
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
          <Header title="Create Expenses" onBack={() => setView('LIST')} theme={theme} />
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

            {/* Expense Type */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Expense Type *</Text>
              <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setShowTypePicker(true)}>
                <Text style={[s.inputVal, { color: theme.text }, !expenseType && { color: theme.textMuted }]}>{expenseType?.name || 'Select Type'}</Text>
                <ChevronDown color={theme.textMuted} size={16} />
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Amount (₹) *</Text>
              <TextInput style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="e.g. 500" keyboardType="numeric" placeholderTextColor={theme.textMuted} maxLength={20} />
            </View>

            {/* Date */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Select Date *</Text>
              <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setShowDatePicker(true)}>
                <Text style={[s.inputVal, { color: theme.text }, !expenseDate && { color: theme.textMuted }]}>{expenseDate || 'YYYY-MM-DD'}</Text>
                <CalendarIcon color={theme.textMuted} size={16} />
              </TouchableOpacity>
            </View>

            {/* Authorised By */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Authorised By</Text>
              <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setShowAuthPicker(true)}>
                <Text style={[s.inputVal, { color: theme.text }, !authBy && { color: theme.textMuted }]}>{authBy?.name || 'Select Authoriser'}</Text>
                <ChevronDown color={theme.textMuted} size={16} />
              </TouchableOpacity>
            </View>

            {/* Approved By */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Approved By</Text>
              <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setShowAppPicker(true)}>
                <Text style={[s.inputVal, { color: theme.text }, !appBy && { color: theme.textMuted }]}>{appBy?.name || 'Select Approver'}</Text>
                <ChevronDown color={theme.textMuted} size={16} />
              </TouchableOpacity>
            </View>

            {/* Remarks */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Remarks *</Text>
              <TextInput style={[s.inputRow, s.textArea, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]} value={remarks} onChangeText={setRemarks} multiline placeholder="Enter remarks..." placeholderTextColor={theme.textMuted} maxLength={50} />
            </View>

            {/* Purpose */}
            <View style={s.inputBox}>
              <Text style={[s.label, { color: theme.textMuted }]}>Purpose</Text>
              <TextInput style={[s.inputRow, s.textArea, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]} value={purpose} onChangeText={setPurpose} multiline placeholder="Enter purpose..." placeholderTextColor={theme.textMuted} maxLength={50} />
            </View>

            {/* Files */}
            <View style={s.fileBox}>
              <TouchableOpacity style={s.addFilesBtn} onPress={pickFile}>
                <Paperclip color={COLORS.primaryDeep} size={14} />
                <Text style={s.addFilesText}> Add files</Text>
              </TouchableOpacity>

              {attachedFiles.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: moderateScale(12), overflow: 'visible' }} contentContainerStyle={{ paddingTop: moderateScale(2), overflow: 'visible' }}>
                  {attachedFiles.map((f, i) => (
                    <FileThumbnail key={i} file={f} onRemove={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} />
                  ))}
                  <TouchableOpacity style={[s.addMoreThumb, { backgroundColor: theme.cardSoft, borderColor: theme.border }]} onPress={pickFile}>
                    <Text style={[s.addMorePlus, { color: theme.textMuted }]}>+</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>

            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.7 }]} onPress={submitExpense} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitText}>SUBMIT REQUEST</Text>}
            </TouchableOpacity>

          </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}

      {view === 'SUCCESS' && (
        <View style={[s.successWrap, { backgroundColor: theme.bg }]}>
          <View style={[s.successCircle, { backgroundColor: theme.isDark ? '#14532D' : '#F0FDF4' }]}><CheckCircle color="#10B981" size={80} strokeWidth={2} /></View>
          <Text style={[s.successTitle, { color: theme.text }]}>Request Sent Successfully!</Text>
          <Text style={[s.successSub, { color: theme.textLight }]}>Your expense request has been sent successfully, We will get back to you shortly!</Text>
          <TouchableOpacity style={[s.goHomeBtn, { borderColor: theme.border }]} onPress={() => { setView('LIST'); fetchExpenses(); }}>
            <Text style={[s.goHomeText, { color: theme.text }]}>Go Back Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pickers */}
      <SelectionModal visible={showTypePicker} title="Select Expense Type" options={expenseTypes} selectedValue={expenseType?.id} labelKey="name" valueKey="id" onClose={() => setShowTypePicker(false)} onSelect={(t) => setExpenseType(t)} />
      <SelectionModal visible={showAuthPicker} title="Authorised By" options={authPersons} selectedValue={authBy?.key} labelKey="name" valueKey="key" onClose={() => setShowAuthPicker(false)} onSelect={setAuthBy} />
      <SelectionModal visible={showAppPicker} title="Approved By" options={appPersons} selectedValue={appBy?.key} labelKey="name" valueKey="key" onClose={() => setShowAppPicker(false)} onSelect={setAppBy} />

      <CalendarModal visible={showDatePicker} selectedDate={expenseDate} minDate={user?.joining_date || undefined} onClose={() => setShowDatePicker(false)} onConfirm={(d) => { setExpenseDate(d); setShowDatePicker(false); }} />

      {/* Detail Expanding Modal */}
      {detailModal && (
        <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)} statusBarTranslucent>
          <TouchableOpacity style={[dm.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={() => setDetailModal(null)}>
            <View style={[dm.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[dm.sideBar, { backgroundColor: statusColor(resolvedStatus(detailModal)).side }]}>
                <Text style={[dm.sideText, { color: statusColor(resolvedStatus(detailModal)).text }]}>{(resolvedStatus(detailModal) || 'Applied').toUpperCase()}</Text>
              </View>
              <View style={dm.body}>
                <Text style={[dm.title, { color: theme.text }]}>{detailModal.expense_type_name}</Text>
                <Text style={[dm.date, { color: theme.textLight }]}>{detailModal.expense_date}</Text>

                <Text style={[dm.info, { color: theme.textLight }]}>Authorised By : {detailModal.authorized_name || detailModal.authorized_by || '-'}</Text>
                <Text style={[dm.info, { color: theme.textLight }]}>Approved By : {detailModal.approved_name || detailModal.approved_by || '-'}</Text>
                <Text style={[dm.info, { color: theme.textLight }]}>Remarks : {detailModal.remarks}</Text>

                {/* Example files if present. API returned `image:""` so let's check it */}
                {!!detailModal.image && (
                  <View style={[dm.fileChip, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
                    <FileText color="#DC2626" size={14} style={{ marginRight: 6 }} />
                    <Text style={[dm.fileChipText, { color: theme.textLight }]}>Attachment</Text>
                  </View>
                )}

                <Text style={[dm.amountLabel, { color: theme.textLight }]}>Claimed Amount: <Text style={{ color: theme.text }}>₹{(!isNaN(parseFloat(detailModal.expenses_amount)) ? parseFloat(detailModal.expenses_amount) : 0).toFixed(2)}</Text></Text>

                {['applied', 'pending', 'p'].includes((detailModal.expense_status || '').toLowerCase()) && (
                  <TouchableOpacity
                    style={[dm.removeBtn, removingExpenseId === detailModal.emp_expenses_pkey && { opacity: 0.6 }]}
                    onPress={() => handleRemoveExpense(detailModal)}
                    disabled={removingExpenseId === detailModal.emp_expenses_pkey}
                    activeOpacity={0.75}
                  >
                    {removingExpenseId === detailModal.emp_expenses_pkey
                      ? <ActivityIndicator size="small" color="#DC2626" />
                      : <Text style={dm.removeBtnText}>Remove Expense</Text>}
                  </TouchableOpacity>
                )}
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
  scroll: { flexGrow: 1, padding: moderateScale(20), paddingBottom: moderateScale(28) },
  fab: { position: 'absolute', bottom: 24, right: 24, width: moderateScale(60), height: moderateScale(60), borderRadius: moderateScale(30), backgroundColor: '#4C1D95', justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },

  // Inputs
  inputBox: { marginBottom: moderateScale(16) },
  label: { fontSize: moderateScale(12), fontWeight: '600', color: '#9CA3AF', marginBottom: moderateScale(8), marginLeft: moderateScale(6) },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(16), height: moderateScale(50), color: '#111827' },
  inputVal: { fontSize: moderateScale(14), fontWeight: '600', color: COLORS.text, flex: 1 },
  textArea: { height: moderateScale(100), textAlignVertical: 'top', paddingTop: moderateScale(16), borderStyle: 'solid' }, // If it's active field we could tint border

  fileBox: { marginBottom: moderateScale(24), paddingHorizontal: 4 },
  addFilesBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(8) },
  addFilesText: { color: COLORS.primaryDeep, fontWeight: '700', fontSize: moderateScale(13) },
  addMoreThumb: { width: moderateScale(64), height: moderateScale(64), borderRadius: moderateScale(10), backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed' },
  addMorePlus: { fontSize: moderateScale(24), color: '#9CA3AF', fontWeight: '300' },

  submitBtn: { backgroundColor: '#4C1D95', height: moderateScale(60), borderRadius: moderateScale(30), justifyContent: 'center', alignItems: 'center', marginTop: moderateScale(16) },
  submitText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(14), letterSpacing: 1 },

  emptyWrap: { alignItems: 'center', marginTop: moderateScale(80) },

  // Success
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(40), backgroundColor: '#FFF' },
  successCircle: { width: moderateScale(140), height: moderateScale(140), borderRadius: moderateScale(70), backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(32) },
  successTitle: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: moderateScale(14) },
  successSub: { fontSize: moderateScale(14), color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: moderateScale(50) },
  goHomeBtn: { width: '100%', height: moderateScale(54), borderRadius: moderateScale(30), borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  goHomeText: { color: COLORS.text, fontWeight: '800' },
});

const c = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(16), marginBottom: moderateScale(12), overflow: 'hidden', ...SHADOWS.light, borderWidth: 1, borderColor: '#F3F4F6', height: moderateScale(86) },
  sideBar: { width: moderateScale(32), justifyContent: 'center', alignItems: 'center' },
  sideText: { fontSize: moderateScale(8), fontWeight: '900', letterSpacing: 1, transform: [{ rotate: '-90deg' }], width: moderateScale(80), textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: moderateScale(16), paddingTop: moderateScale(14), paddingBottom: moderateScale(14), justifyContent: 'center' },
  row: { flexDirection: 'row' },
  title: { fontSize: moderateScale(13), fontWeight: '800', color: '#111827', marginBottom: 3 },
  date: { fontSize: moderateScale(11), color: '#6B7280', marginBottom: moderateScale(6), fontWeight: '500' },
  remarks: { fontSize: moderateScale(11), color: '#9CA3AF' },
  amount: { fontSize: moderateScale(15), fontWeight: '900', color: '#1D4ED8' }
});

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: moderateScale(24) },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(16), overflow: 'hidden', ...SHADOWS.medium, borderWidth: 1, borderColor: '#F3F4F6' },
  sideBar: { width: moderateScale(36), justifyContent: 'center', alignItems: 'center' },
  sideText: { fontSize: moderateScale(10), fontWeight: '900', letterSpacing: 2, transform: [{ rotate: '-90deg' }], width: moderateScale(140), textAlign: 'center' },
  body: { flex: 1, padding: moderateScale(20) },
  title: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827', marginBottom: 4 },
  date: { fontSize: moderateScale(12), color: '#6B7280', marginBottom: moderateScale(16), fontWeight: '500' },
  info: { fontSize: moderateScale(12), color: '#4B5563', marginBottom: moderateScale(8), lineHeight: 18, fontWeight: '500' },
  amountLabel: { fontSize: moderateScale(13), color: '#4B5563', fontWeight: '800', marginTop: moderateScale(16) },
  fileChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: moderateScale(8), backgroundColor: '#F9FAFB', paddingHorizontal: moderateScale(10), paddingVertical: moderateScale(6), borderRadius: moderateScale(8), borderWidth: 1, borderColor: '#E5E7EB' },
  fileChipText: { fontSize: moderateScale(11), color: '#4B5563', fontWeight: '600' },
  removeBtn: { marginTop: moderateScale(20), borderWidth: 1.5, borderColor: '#DC2626', borderRadius: moderateScale(12), paddingVertical: moderateScale(12), alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: moderateScale(13), fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
});

export default ExpenseScreen;

