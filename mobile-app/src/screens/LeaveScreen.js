import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, Dimensions, Platform, KeyboardAvoidingView
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, Calendar as CalendarIcon, ChevronDown,
  ChevronRight, CheckCircle, Clock, Paperclip, X, FileText
} from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// ─── Constants ────────────────────────────────────────────────────────────────
import { API_ENDPOINTS } from '../constants/Config';

const STATUS_COLORS = {
  Approved: { bg: '#DCFCE7', text: '#16A34A', side: '#16A34A' },
  Applied: { bg: '#DBEAFE', text: '#1D4ED8', side: '#1D4ED8' },
  Rejected: { bg: '#FEE2E2', text: '#DC2626', side: '#DC2626' },
  Authorised: { bg: '#F3F0FF', text: '#6C5CE7', side: '#6C5CE7' },
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
const LeaveHeader = ({ title, onBack }) => (
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

// ─── History Card ─────────────────────────────────────────────────────────────
const HistoryCard = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const sc = statusColor(item.leave_status);

  return (
    <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.85} style={hc.card}>
      {/* Coloured Sidebar */}
      <View style={[hc.sideBar, { backgroundColor: sc.side }]}>
        <Text style={hc.sideText}>{(item.leave_status || '').toUpperCase()}</Text>
      </View>

      <View style={hc.body}>
        {/* ── Collapsed Row ── */}
        <View style={hc.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={hc.leaveName}>{item.leave_name?.trim()}</Text>
            <Text style={hc.dateText}>{item.from_date}</Text>
            {item.approved_by_person
              ? <Text style={hc.approverText}>Approved By : {item.approved_by_person?.trim()}</Text>
              : null}
          </View>
          <View style={hc.daysBadge}>
            <Text style={hc.daysNum}>{item.leave_count}</Text>
            <Text style={hc.daysLabel}>Days</Text>
          </View>
        </View>

        {/* ── Expanded Detail ── */}
        {expanded && (
          <View style={hc.expandedBox}>
            <View style={hc.divider} />

            {/* Row 1: Leave Date + Applied On */}
            <View style={hc.detailRow}>
              <View style={{ flex: 1 }}>
                <Text style={hc.detailLabel}>Leave Date</Text>
                <Text style={hc.detailValue}>{item.from_date}{item.to_date && item.to_date !== item.from_date ? ` – ${item.to_date}` : ''}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={hc.detailLabel}>Applied On</Text>
                <Text style={hc.detailValue}>{item.from_date}</Text>
              </View>
            </View>

            {/* Row 2: Authorised By + Approved By */}
            <View style={hc.detailRow}>
              {item.authorized_by_person ? (
                <View style={{ flex: 1 }}>
                  <Text style={hc.detailLabel}>Authorised By</Text>
                  <Text style={hc.detailValue}>{item.authorized_by_person?.trim()}</Text>
                </View>
              ) : null}
              {item.approved_by_person ? (
                <View style={{ flex: 1 }}>
                  <Text style={hc.detailLabel}>Approved By</Text>
                  <Text style={hc.detailValue}>{item.approved_by_person?.trim()}</Text>
                </View>
              ) : null}
            </View>

            {/* Leave Days */}
            <View style={hc.metaRow}>
              <Text style={hc.metaLabel}>Leave Days :</Text>
              <Text style={hc.metaValue}> {item.leave_count} Days</Text>
            </View>

            {/* Status Tag */}
            <View style={[hc.statusTag, { backgroundColor: sc.bg }]}>
              <Text style={[hc.statusTagText, { color: sc.text }]}>{item.leave_status}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const hc = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16,
    marginBottom: 12, overflow: 'hidden', ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  sideBar: { width: 36, justifyContent: 'center', alignItems: 'center' },
  sideText: {
    color: '#FFF', fontSize: 8, fontWeight: '900', letterSpacing: 1,
    transform: [{ rotate: '-90deg' }], width: 80, textAlign: 'center',
  },
  body: { flex: 1, padding: 14 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leaveName: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 3 },
  dateText: { fontSize: 12, color: '#6B7280', marginBottom: 3 },
  approverText: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  daysBadge: { alignItems: 'flex-end', marginLeft: 8, justifyContent: 'center' },
  daysNum: { fontSize: 28, fontWeight: '900', color: COLORS.primaryDeep, lineHeight: 30 },
  daysLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '700', textAlign: 'right' },
  // Expanded
  expandedBox: { marginTop: 14 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 14 },
  detailRow: { flexDirection: 'row', marginBottom: 14 },
  detailLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  metaLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  metaValue: { fontSize: 13, color: '#111827', fontWeight: '700' },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusTagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});

// ─── File Thumbnail ───────────────────────────────────────────────────────────
const FileThumbnail = ({ file, onRemove }) => {
  const isPDF = file.mimeType === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <View style={ft.wrap}>
      <View style={[ft.thumb, isPDF && { backgroundColor: '#FEE2E2' }]}>
        {isPDF ? <FileText color="#DC2626" size={22} /> : <Text style={ft.ext}>{file.name?.split('.').pop()?.toUpperCase()}</Text>}
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
                <TouchableOpacity
                  key={i}
                  style={[cal.cell, isSelected && cal.cellSelected]}
                  onPress={() => d && handleSelect(d)}
                  disabled={!d}
                >
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

// ─── Half Picker Modal ───────────────────────────────────────────────────────
const SelectionModal = ({ visible, options, selectedValue, onClose, onSelect, title }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={sm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={sm.sheet}>
        <View style={sm.handle} />
        {title && <Text style={sm.title}>{title}</Text>}
        {options.map(opt => (
          <TouchableOpacity key={opt} style={sm.item} onPress={() => { onSelect(opt); onClose(); }}>
            <Text style={[sm.itemText, opt === selectedValue && sm.itemTextActive]}>{opt}</Text>
            {opt === selectedValue && <CheckCircle color={COLORS.primaryDeep} size={20} />}
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  </Modal>
);

const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24, maxHeight: 400 },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: 15, color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

// ─── Main LeaveScreen ─────────────────────────────────────────────────────────
const LeaveScreen = ({ navigation, route }) => {
  const user = route?.params?.user;

  const [view, setView] = useState('DASHBOARD');
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [histFilter, setHistFilter] = useState('all');
  const [histLoading, setHistLoading] = useState(false);
  const [histLeaves, setHistLeaves] = useState([]);
  const [authorizedById, setAuthorizedById] = useState('');
  const [authorizedByName, setAuthorizedByName] = useState('');
  const [approvedByIds, setApprovedByIds] = useState('');
  const [approvedByName, setApprovedByName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [calendarTarget, setCalendarTarget] = useState(null);
  const [halfTarget, setHalfTarget] = useState(null);
  const [fromHalf, setFromHalf] = useState('Full Day');
  const [toHalf, setToHalf] = useState('Full Day');
  const [reason, setReason] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [handoverTo, setHandoverTo] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  if (!user || !user.user_id) return null;

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    try {
      const items = await axios.post(API_ENDPOINTS.LEAVE_ITEMS, { user_id: user.user_id });
      if (items.data?.success) {
        const d = items.data.data;
        setLeaveBalances(d.leave_types || []);

        setAuthorizedById(d.authorized_by || '');
        setAuthorizedByName(d.authorized_by_person?.trim() || 'Not Defined');

        setApprovedByIds(d.approved_by || '');
        setApprovedByName(d.approved_by_person?.trim() || 'Not Defined');
      }
    } catch (e) { console.log('leave_items error', e.message); }
    finally { setLoading(false); }
  };

  const fetchHistory = async (filter) => {
    setHistLoading(true);
    try {
      const url = `${API_ENDPOINTS.LEAVE_HISTORY}?user_id=${user.user_id}${filter !== 'all' ? `&filter=${filter}` : ''}`;
      const res = await axios.post(url, { user_id: user.user_id, filter: filter !== 'all' ? filter : undefined });
      if (res.data?.success) setHistLeaves(res.data.data || []);
    } catch (e) { console.log('leave_history error', e.message); }
    finally { setHistLoading(false); }
  };

  useFocusEffect(
    useCallback(() => {
      setView('DASHBOARD');
      fetchAll();
    }, [])
  );

  // ── File Picker ──────────────────────────────────────────────────────────────
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

        const valid = result.assets.filter(f => {
          const ext = f.name?.split('.').pop()?.toLowerCase();
          return ['jpg', 'jpeg', 'pdf'].includes(ext);
        });
        if (valid.length < result.assets.length)
          showAlert('warning', 'Invalid Files', 'Only JPG, JPEG, and PDF files are allowed.');
        setAttachedFiles(prev => [...prev, ...valid]);
      }
    } catch (e) { showAlert('error', 'Error', 'Could not open file picker.'); }
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!reason.trim()) { showAlert('warning', 'Missing Reason', 'Please provide a reason for your leave.'); return; }
    if (!fromDate.trim()) { showAlert('warning', 'Date Required', 'Please enter a From Date.'); return; }
    if (!selectedLeave) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('from_date', fromDate);
      formData.append('to_date', toDate || fromDate);
      formData.append('salary_head_item_fkey', selectedLeave.leave_id);
      formData.append('reason', reason);
      formData.append('from_session', fromHalf === 'Second Half' ? '2' : '1');
      formData.append('to_session', toHalf === 'First Half' ? '1' : '2');
      formData.append('contact_number', contactNo || 'N/A');
      formData.append('duties_handed_over', handoverTo || 'N/A');
      formData.append('authorized_by', authorizedById || '0');
      formData.append('approved_by', approvedByIds || '0');

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

      const res = await axios.post(API_ENDPOINTS.LEAVES, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.success === 1 || res.data?.success === true || res.data?.message?.toLowerCase().includes('success')) {
        setView('SUCCESS');
        setAttachedFiles([]);
        setReason(''); setContactNo(''); setFromDate(''); setToDate('');
      } else {
        showAlert('error', 'Submission Failed', res.data?.message || 'Submission failed.');
      }
    } catch (e) {
      showAlert('error', 'System Error', 'Failed to submit leave. Please check your connection.');
    } finally { setSubmitting(false); }
  };

  // ─── VIEWS ────────────────────────────────────────────────────────────────────
  const DashboardView = () => (
    <View style={{ flex: 1 }}>
      <LeaveHeader title="Leaves" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primaryDeep} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {leaveBalances.map((item, idx) => {
            const colors = ['#8B5CF6', '#8B5CF6', '#8B5CF6', '#8B5CF6', '#8B5CF6', '#8B5CF6'];
            const taken = parseFloat(item.leave_taken) || 0;
            const bal = parseFloat(item.leave_balance) || 0;
            const total = taken + bal;
            return (
              <TouchableOpacity key={item.leave_id} style={s.balCard} onPress={() => { setSelectedLeave(item); setView('APPLY'); }}>
                <View style={[s.balBar, { backgroundColor: colors[idx % colors.length] }]} />
                <View style={s.balBody}>
                  <View>
                    <Text style={s.balRatio}>{taken}/{total}</Text>
                    <Text style={s.balType}>{item.leave_name?.trim()}</Text>
                  </View>
                  <ChevronRight color="#9CA3AF" size={20} />
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={s.histBtn} onPress={() => { fetchHistory('all'); setHistFilter('all'); setView('HISTORY'); }}>
            <Text style={s.histBtnText}>View applied & past leaves</Text>
            <ChevronRight color={COLORS.primaryDeep} size={18} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );

  const ApplyView = () => (
    <View style={{ flex: 1 }}>
      <LeaveHeader title={`Apply ${selectedLeave?.leave_name?.trim() || ''}`} onBack={() => setView('DASHBOARD')} />
      <View style={s.remBanner}>
        <Text style={s.remText}>{selectedLeave?.leave_name?.trim().toLowerCase()} remaining : {selectedLeave?.leave_balance || 0}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* From Row */}
        <View style={s.dateRow}>
          <View style={[s.inputBox, { flex: 1.2, marginRight: 8 }]}>
            <Text style={s.label}>From Date</Text>
            <TouchableOpacity style={s.inputRow} onPress={() => setCalendarTarget('FROM')}>
              <Text style={[s.dateText, !fromDate && { color: '#9CA3AF' }]}>{fromDate || 'YYYY-MM-DD'}</Text>
              <CalendarIcon color="#9CA3AF" size={16} />
            </TouchableOpacity>
          </View>
          <View style={[s.inputBox, { flex: 1 }]}>
            <Text style={s.label}> </Text>
            <TouchableOpacity style={s.inputRow} onPress={() => setHalfTarget('FROM')}>
              <Text style={s.inputVal}>{fromHalf}</Text>
              <ChevronDown color="#9CA3AF" size={16} />
            </TouchableOpacity>
          </View>
        </View>

        {/* To Row */}
        <View style={s.dateRow}>
          <View style={[s.inputBox, { flex: 1.2, marginRight: 8 }]}>
            <Text style={s.label}>To Date</Text>
            <TouchableOpacity style={s.inputRow} onPress={() => setCalendarTarget('TO')}>
              <Text style={[s.dateText, !toDate && { color: '#9CA3AF' }]}>{toDate || 'YYYY-MM-DD'}</Text>
              <CalendarIcon color="#9CA3AF" size={16} />
            </TouchableOpacity>
          </View>
          <View style={[s.inputBox, { flex: 1 }]}>
            <Text style={s.label}> </Text>
            <TouchableOpacity style={s.inputRow} onPress={() => setHalfTarget('TO')}>
              <Text style={s.inputVal}>{toHalf}</Text>
              <ChevronDown color="#9CA3AF" size={16} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Authorised By */}
        <View style={s.inputBox}>
          <Text style={s.label}>Authorised By</Text>
          <View style={s.inputRow}>
            <Text style={s.inputVal}>{authorizedByName}</Text>
          </View>
        </View>

        {/* Approved By */}
        <View style={s.inputBox}>
          <Text style={s.label}>Approved By</Text>
          <View style={s.inputRow}>
            <Text style={s.inputVal}>{approvedByName}</Text>
          </View>
        </View>

        {/* Contact Number */}
        <View style={s.inputBox}>
          <Text style={s.label}>Contact Number</Text>
          <TextInput
            style={s.inputRow}
            value={contactNo}
            onChangeText={setContactNo}
            placeholder="+91 0000000000"
            keyboardType="phone-pad"
            placeholderTextColor="#D1D5DB"
            maxLength={20}
          />
        </View>

        {/* Duties Handed Over */}
        <View style={s.inputBox}>
          <Text style={s.label}>Duties Handed Over To</Text>
          <TextInput
            style={s.inputRow}
            value={handoverTo}
            onChangeText={setHandoverTo}
            placeholder="e.g. Handed over to Team Lead"
            placeholderTextColor="#D1D5DB"
            maxLength={20}
          />
        </View>

        {/* Reason */}
        <View style={s.inputBox}>
          <Text style={s.label}>Reason</Text>
          <TextInput
            style={[s.inputRow, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="Enter reason..."
            placeholderTextColor="#D1D5DB"
            maxLength={50}
          />
        </View>

        {/* File attachments */}
        <TouchableOpacity style={s.addFilesBtn} onPress={pickFile}>
          <Paperclip color={COLORS.primaryDeep} size={14} />
          <Text style={s.addFilesText}> Add files  (JPG, JPEG, PDF)</Text>
        </TouchableOpacity>
        {attachedFiles.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {attachedFiles.map((f, i) => (
              <FileThumbnail key={i} file={f} onRemove={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} />
            ))}
            <TouchableOpacity style={s.addMoreThumb} onPress={pickFile}>
              <Text style={s.addMorePlus}>+</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        <TouchableOpacity style={[s.submitBtn, submitting && { opacity: 0.7 }]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitText}>SUBMIT REQUEST</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      <CalendarModal
        visible={!!calendarTarget}
        selectedDate={calendarTarget === 'FROM' ? fromDate : toDate}
        onClose={() => setCalendarTarget(null)}
        onConfirm={(val) => {
          if (calendarTarget === 'FROM') {
            setFromDate(val);
            if (!toDate || toDate < val) setToDate(val);
          } else {
            if (fromDate && val < fromDate) {
              showAlert('warning', 'Invalid Date', 'End date cannot be before the start date.');
              return;
            }
            setToDate(val);
          }
          setCalendarTarget(null);
        }}
      />

      <SelectionModal
        visible={!!halfTarget}
        title={`Select ${halfTarget === 'FROM' ? 'From' : 'To'} Half`}
        options={['Full Day', 'First Half', 'Second Half']}
        selectedValue={halfTarget === 'FROM' ? fromHalf : toHalf}
        onClose={() => setHalfTarget(null)}
        onSelect={(val) => {
          if (halfTarget === 'FROM') setFromHalf(val);
          else setToHalf(val);
        }}
      />

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </View>
  );

  const HistoryView = () => {
    const tabs = [
      { key: 'all', label: 'All' },
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'past', label: 'Past' },
    ];
    return (
      <View style={{ flex: 1 }}>
        <LeaveHeader title="Leave History" onBack={() => setView('DASHBOARD')} />
        {/* Tab Bar */}
        <View style={s.tabBar}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, histFilter === t.key && s.tabActive]} onPress={() => { setHistFilter(t.key); fetchHistory(t.key); }}>
              <Text style={[s.tabText, histFilter === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {histLoading ? (
          <ActivityIndicator size="large" color={COLORS.primaryDeep} style={{ marginTop: 60 }} />
        ) : histLeaves.length === 0 ? (
          <View style={s.emptyWrap}>
            <Clock color="#D1D5DB" size={48} />
            <Text style={s.emptyText}>No leaves found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll}>
            {histLeaves.map((item, idx) => <HistoryCard key={item.leave_id || idx} item={item} />)}
          </ScrollView>
        )}
      </View>
    );
  };

  const SuccessView = () => (
    <View style={s.successWrap}>
      <View style={s.successCircle}><CheckCircle color="#22C55E" size={80} strokeWidth={1.5} /></View>
      <Text style={s.successTitle}>Request Sent Successfully!</Text>
      <Text style={s.successSub}>Your leave request has been sent successfully. We will get back to you shortly!</Text>
      <TouchableOpacity style={s.goHomeBtn} onPress={() => { setView('DASHBOARD'); fetchAll(); }}>
        <Text style={s.goHomeText}>Go Back Home</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {view === 'DASHBOARD' && DashboardView()}
      {view === 'APPLY' && ApplyView()}
      {view === 'HISTORY' && HistoryView()}
      {view === 'SUCCESS' && SuccessView()}
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 20, paddingBottom: 120 },

  // Balance cards
  balCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, overflow: 'hidden', height: 72, ...SHADOWS.light },
  balBar: { width: 5 },
  balBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  balRatio: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  balType: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  histBtn: { backgroundColor: '#F5F3FF', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  histBtnText: { color: COLORS.primaryDeep, fontWeight: '700', marginRight: 8 },

  // Apply form
  remBanner: { backgroundColor: '#F5F3FF', paddingVertical: 10, alignItems: 'center' },
  remText: { color: COLORS.primaryDeep, fontSize: 12, fontWeight: '600' },
  dateRow: { flexDirection: 'row', marginBottom: 16 },
  inputBox: { marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 6, marginLeft: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, height: 48, color: '#000'
  },
  inputVal: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },
  dateText: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },

  // Files
  addFilesBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginBottom: 12 },
  addFilesText: { color: COLORS.primaryDeep, fontWeight: '700', fontSize: 13 },
  addMoreThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed' },
  addMorePlus: { fontSize: 24, color: '#9CA3AF', fontWeight: '300' },

  submitBtn: { backgroundColor: COLORS.primaryDeep, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },

  // Approver Dropdown
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 32 },
  ddBox: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, ...SHADOWS.medium },
  ddTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  ddItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  ddItemText: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  // History Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.primaryDeep },
  tabText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  tabTextActive: { color: COLORS.primaryDeep },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600', marginTop: 12 },

  // Success
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: '#FFF' },
  successCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  successTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 14 },
  successSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 50 },
  goHomeBtn: { width: '100%', height: 54, borderRadius: 30, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  goHomeText: { color: COLORS.text, fontWeight: '800' },
});

export default LeaveScreen;
