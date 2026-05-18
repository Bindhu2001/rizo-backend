import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, Dimensions, Platform, KeyboardAvoidingView, RefreshControl
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, Calendar as CalendarIcon, ChevronDown,
  ChevronRight, CheckCircle, Clock, Paperclip, X, FileText
} from 'lucide-react-native';
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';

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
const LeaveHeader = ({ title, onBack, theme }) => (
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

// ─── History Card ─────────────────────────────────────────────────────────────
const HistoryCard = ({ item, onCancel, cancelling }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const sc = statusColor(item.leave_status);
  const norm = (item.leave_status || '').trim().toLowerCase();
  const canCancel = norm === 'applied' || norm === 'pending' || norm === 'p';

  return (
    <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.85} style={[hc.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {/* Coloured Sidebar */}
      <View style={[hc.sideBar, { backgroundColor: sc.side }]}>
        <Text style={hc.sideText}>{(item.leave_status || '').toUpperCase()}</Text>
      </View>

      <View style={hc.body}>
        {/* ── Collapsed Row ── */}
        <View style={hc.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={[hc.leaveName, { color: theme.text }]}>{item.leave_name?.trim()}</Text>
            <Text style={[hc.dateText, { color: theme.textLight }]}>{item.from_date}</Text>
            {item.approved_by_person
              ? <Text style={[hc.approverText, { color: theme.textMuted }]}>Approved By : {item.approved_by_person?.trim()}</Text>
              : null}
          </View>
          <View style={hc.daysBadge}>
            <Text style={[hc.daysNum, { color: theme.primaryDeep }]}>{item.leave_count}</Text>
            <Text style={[hc.daysLabel, { color: theme.textMuted }]}>Days</Text>
          </View>
        </View>

        {/* ── Expanded Detail ── */}
        {expanded && (
          <View style={hc.expandedBox}>
            <View style={[hc.divider, { backgroundColor: theme.divider }]} />

            {/* Row 1: Leave Date + Applied On */}
            <View style={hc.detailRow}>
              <View style={{ flex: 1 }}>
                <Text style={[hc.detailLabel, { color: theme.textMuted }]}>Leave Date</Text>
                <Text style={[hc.detailValue, { color: theme.text }]}>{item.from_date}{item.to_date && item.to_date !== item.from_date ? ` – ${item.to_date}` : ''}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[hc.detailLabel, { color: theme.textMuted }]}>Applied On</Text>
                <Text style={[hc.detailValue, { color: theme.text }]}>{item.from_date}</Text>
              </View>
            </View>

            {/* Row 2: Authorised By + Approved By */}
            <View style={hc.detailRow}>
              {item.authorized_by_person ? (
                <View style={{ flex: 1 }}>
                  <Text style={[hc.detailLabel, { color: theme.textMuted }]}>Authorised By</Text>
                  <Text style={[hc.detailValue, { color: theme.text }]}>{item.authorized_by_person?.trim()}</Text>
                </View>
              ) : null}
              {item.approved_by_person ? (
                <View style={{ flex: 1 }}>
                  <Text style={[hc.detailLabel, { color: theme.textMuted }]}>Approved By</Text>
                  <Text style={[hc.detailValue, { color: theme.text }]}>{item.approved_by_person?.trim()}</Text>
                </View>
              ) : null}
            </View>

            {/* Leave Days */}
            <View style={hc.metaRow}>
              <Text style={[hc.metaLabel, { color: theme.textLight }]}>Leave Days :</Text>
              <Text style={[hc.metaValue, { color: theme.text }]}> {item.leave_count} Days</Text>
            </View>

            {/* Status Tag */}
            <View style={[hc.statusTag, { backgroundColor: sc.bg }]}>
              <Text style={[hc.statusTagText, { color: sc.text }]}>{item.leave_status}</Text>
            </View>

            {/* Cancel Button — only for Applied / Pending */}
            {canCancel && (
              <TouchableOpacity
                style={[hc.cancelBtn, cancelling && { opacity: 0.6 }]}
                onPress={() => onCancel?.(item.leave_id)}
                disabled={cancelling}
                activeOpacity={0.75}
              >
                {cancelling
                  ? <ActivityIndicator size="small" color="#DC2626" />
                  : <Text style={hc.cancelBtnText}>Cancel Leave</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const hc = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(16),
    marginBottom: moderateScale(12), overflow: 'hidden', ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  sideBar: { width: moderateScale(36), justifyContent: 'center', alignItems: 'center' },
  sideText: {
    color: '#FFF', fontSize: moderateScale(8), fontWeight: '900', letterSpacing: 1,
    transform: [{ rotate: '-90deg' }], width: moderateScale(80), textAlign: 'center',
  },
  body: { flex: 1, padding: moderateScale(14) },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leaveName: { fontSize: moderateScale(14), fontWeight: '800', color: '#111827', marginBottom: 3 },
  dateText: { fontSize: moderateScale(12), color: '#6B7280', marginBottom: 3 },
  approverText: { fontSize: moderateScale(11), color: '#9CA3AF', fontWeight: '500' },
  daysBadge: { alignItems: 'flex-end', marginLeft: moderateScale(8), justifyContent: 'center' },
  daysNum: { fontSize: moderateScale(28), fontWeight: '900', color: COLORS.primaryDeep, lineHeight: 30 },
  daysLabel: { fontSize: moderateScale(10), color: '#9CA3AF', fontWeight: '700', textAlign: 'right' },
  // Expanded
  expandedBox: { marginTop: moderateScale(14) },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: moderateScale(14) },
  detailRow: { flexDirection: 'row', marginBottom: moderateScale(14) },
  detailLabel: { fontSize: moderateScale(10), color: '#9CA3AF', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: moderateScale(13), fontWeight: '700', color: '#111827' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: moderateScale(14) },
  metaLabel: { fontSize: moderateScale(12), color: '#6B7280', fontWeight: '600' },
  metaValue: { fontSize: moderateScale(13), color: '#111827', fontWeight: '700' },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: moderateScale(12), paddingVertical: 5, borderRadius: moderateScale(20) },
  statusTagText: { fontSize: moderateScale(11), fontWeight: '800', letterSpacing: 0.5 },
  cancelBtn: {
    marginTop: moderateScale(12), borderWidth: 1.5, borderColor: '#DC2626', borderRadius: moderateScale(10),
    paddingVertical: moderateScale(10), alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: moderateScale(13), fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
});

// ─── File Thumbnail ───────────────────────────────────────────────────────────
const FileThumbnail = ({ file, onRemove }) => {
  const theme = useTheme();
  const isPDF = file.mimeType === 'application/pdf' || file.name?.endsWith('.pdf');
  return (
    <View style={ft.wrap}>
      <View style={[ft.thumb, { backgroundColor: theme.cardSoft, borderColor: theme.border }, isPDF && { backgroundColor: '#FEE2E2' }]}>
        {isPDF ? <FileText color="#DC2626" size={22} /> : <Text style={ft.ext}>{file.name?.split('.').pop()?.toUpperCase()}</Text>}
        <TouchableOpacity style={ft.remove} onPress={onRemove}>
          <X color="#FFF" size={10} />
        </TouchableOpacity>
      </View>
      <Text style={[ft.name, { color: theme.textLight }]} numberOfLines={1}>{file.name}</Text>
    </View>
  );
};
const ft = StyleSheet.create({
  wrap: { width: moderateScale(72), marginRight: moderateScale(10), alignItems: 'center', overflow: 'visible' },
  thumb: { width: moderateScale(64), height: moderateScale(64), borderRadius: moderateScale(10), backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', overflow: 'visible' },
  ext: { fontSize: moderateScale(11), fontWeight: '900', color: '#1D4ED8' },
  name: { fontSize: moderateScale(9), color: '#6B7280', marginTop: 4, textAlign: 'center', maxWidth: 70 },
  remove: { position: 'absolute', top: -8, right: -8, width: moderateScale(22), height: moderateScale(22), borderRadius: moderateScale(11), backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
});

// ─── Calendar Modal ──────────────────────────────────────────────────────────
const CalendarModal = ({ visible, selectedDate, onClose, onConfirm }) => {
  const theme = useTheme();
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
      <TouchableOpacity style={[cal.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
        <View style={[cal.box, { backgroundColor: theme.card }]}>
          <View style={cal.header}>
            <TouchableOpacity onPress={prevMonth} style={cal.arrowBtn}><ChevronLeft color={theme.text} size={24} /></TouchableOpacity>
            <Text style={[cal.headerTitle, { color: theme.text }]}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
            <TouchableOpacity onPress={nextMonth} style={cal.arrowBtn}><ChevronRight color={theme.text} size={24} /></TouchableOpacity>
          </View>
          <View style={[cal.daysHeader, { borderBottomColor: theme.divider }]}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => <Text key={x} style={[cal.dhText, { color: theme.textLight }]}>{x}</Text>)}
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
                  <Text style={[cal.cellText, { color: theme.text }, isSelected && cal.cellTextSelected]}>{d || ''}</Text>
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

// ─── Half Picker Modal ───────────────────────────────────────────────────────
const SelectionModal = ({ visible, options, selectedValue, onClose, onSelect, title }) => {
  const theme = useTheme();
  return (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={[sm.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
      <View style={[sm.sheet, { backgroundColor: theme.card }]}>
        <View style={[sm.handle, { backgroundColor: theme.border }]} />
        {title && <Text style={[sm.title, { color: theme.text }]}>{title}</Text>}
        {options.map(opt => (
          <TouchableOpacity key={opt} style={[sm.item, { borderBottomColor: theme.divider }]} onPress={() => { onSelect(opt); onClose(); }}>
            <Text style={[sm.itemText, { color: theme.textLight }, opt === selectedValue && { color: theme.text, fontWeight: '600' }]}>{opt}</Text>
            {opt === selectedValue && <CheckCircle color={theme.primaryDeep} size={20} />}
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  </Modal>
  );
};

const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), paddingBottom: Platform.OS === 'ios' ? 36 : 24, maxHeight: 400 },
  handle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  title: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: moderateScale(16) },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: moderateScale(15), color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

// ─── Main LeaveScreen ─────────────────────────────────────────────────────────
const LeaveScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route?.params?.user;

  const [view, setView] = useState('DASHBOARD');
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [histFilter, setHistFilter] = useState('all');
  const [histLoading, setHistLoading] = useState(false);
  const [histLeaves, setHistLeaves] = useState([]);
  const [authorizedByList, setAuthorizedByList] = useState([]);
  const [approvedByList, setApprovedByList] = useState([]);
  const [selectedAuthBy, setSelectedAuthBy] = useState(null);
  const [selectedAppBy, setSelectedAppBy] = useState(null);
  const [showAuthPicker, setShowAuthPicker] = useState(false);
  const [showAppPicker, setShowAppPicker] = useState(false);
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
  const [refreshing, setRefreshing] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  if (!user || !user.user_id) return null;

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    try {
      const items = await axios.post(API_ENDPOINTS.LEAVE_ITEMS, { user_id: user.user_id });
      if (items.data?.success) {
        const d = items.data.data;
        setLeaveBalances(d.leave_types || []);

        const parsePersons = (idsStr, namesStr) => {
          if (!idsStr) return [];
          const ids = String(idsStr).split(',').map(s => s.trim()).filter(Boolean);
          const names = namesStr ? String(namesStr).split(',').map(s => s.trim()) : [];
          return ids.map((id, i) => ({ id, name: names[i] || id }));
        };

        const authList = parsePersons(d.authorized_by, d.authorized_by_person);
        const appList = parsePersons(d.approved_by, d.approved_by_person);

        setAuthorizedByList(authList);
        setApprovedByList(appList);
        setSelectedAuthBy(authList[0] || null);
        setSelectedAppBy(appList[0] || null);
      }
    } catch (e) { console.log('leave_items error', e.message); }
    finally { setLoading(false); }
  };

  const handleCancelLeave = (leaveId) => {
    Alert.alert(
      'Cancel Leave',
      'Are you sure you want to cancel this leave?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
            setCancellingId(leaveId);
            try {
              const res = await axios.post(API_ENDPOINTS.LEAVE_CANCEL, { user_id: user.user_id, leave_id: String(leaveId) });
              if (res.data?.success === 1 || res.data?.success === true) {
                showAlert('success', 'Cancelled', 'Your leave has been cancelled successfully.');
                fetchHistory(histFilter);
              } else {
                showAlert('error', 'Failed', res.data?.message || 'Could not cancel leave.');
              }
            } catch (e) {
              showAlert('error', 'Error', 'Failed to cancel leave. Please try again.');
            } finally {
              setCancellingId(null);
            }
          }
        },
      ]
    );
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
    if (!selectedLeave) { showAlert('warning', 'Leave Type Required', 'Please select a leave type to continue.'); return; }
    if (!fromDate.trim()) { showAlert('warning', 'Date Required', 'Please enter a From Date.'); return; }
    if (!reason.trim()) { showAlert('warning', 'Missing Reason', 'Please provide a reason for your leave.'); return; }
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
      formData.append('authorized_by', selectedAuthBy?.id || '0');
      formData.append('approved_by', selectedAppBy?.id || '0');

      // Send attachments as real multipart binary uploads under the field
      // name `document` (matches backend). React Native's fetch/axios accepts
      // a { uri, name, type } object on FormData and uploads the file as-is.
      for (let i = 0; i < attachedFiles.length; i++) {
        const file = attachedFiles[i];
        const ext = file.name?.split('.').pop()?.toLowerCase();
        const mime = file.mimeType
          || (ext === 'pdf' ? 'application/pdf'
              : ext === 'png' ? 'image/png'
              : 'image/jpeg');
        formData.append('document', {
          uri: file.uri,
          name: file.name || `document_${i}.${ext || 'jpg'}`,
          type: mime,
        });
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
      <LeaveHeader title="Leaves" onBack={() => navigation.goBack()} theme={theme} />
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primaryDeep} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}>
          {leaveBalances.map((item, idx) => {
            const colors = ['#8B5CF6', '#8B5CF6', '#8B5CF6', '#8B5CF6', '#8B5CF6', '#8B5CF6'];
            const taken = parseFloat(item.leave_taken) || 0;
            const bal = parseFloat(item.leave_balance) || 0;
            const total = taken + bal;
            return (
              <TouchableOpacity key={item.leave_id} style={[s.balCard, { backgroundColor: theme.card }]} onPress={() => { setSelectedLeave(item); setView('APPLY'); }}>
                <View style={[s.balBar, { backgroundColor: colors[idx % colors.length] }]} />
                <View style={s.balBody}>
                  <View>
                    <Text style={[s.balRatio, { color: theme.text }]}>{taken}/{total}</Text>
                    <Text style={[s.balType, { color: theme.textLight }]}>{item.leave_name?.trim()}</Text>
                  </View>
                  <ChevronRight color={theme.textMuted} size={20} />
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
      <LeaveHeader title={`Apply ${selectedLeave?.leave_name?.trim() || ''}`} onBack={() => setView('DASHBOARD')} theme={theme} />
      <View style={s.remBanner}>
        <Text style={s.remText}>{selectedLeave?.leave_name?.trim().toLowerCase()} remaining : {selectedLeave?.leave_balance || 0}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* From Row */}
        <View style={s.dateRow}>
          <View style={[s.inputBox, { flex: 1.2, marginRight: 8 }]}>
            <Text style={[s.label, { color: theme.textMuted }]}>From Date *</Text>
            <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setCalendarTarget('FROM')}>
              <Text style={[s.dateText, { color: theme.text }, !fromDate && { color: theme.textMuted }]}>{fromDate || 'YYYY-MM-DD'}</Text>
              <CalendarIcon color={theme.textMuted} size={16} />
            </TouchableOpacity>
          </View>
          <View style={[s.inputBox, { flex: 1 }]}>
            <Text style={[s.label, { color: theme.textMuted }]}> </Text>
            <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setHalfTarget('FROM')}>
              <Text style={[s.inputVal, { color: theme.text }]}>{fromHalf}</Text>
              <ChevronDown color={theme.textMuted} size={16} />
            </TouchableOpacity>
          </View>
        </View>

        {/* To Row */}
        <View style={s.dateRow}>
          <View style={[s.inputBox, { flex: 1.2, marginRight: 8 }]}>
            <Text style={[s.label, { color: theme.textMuted }]}>To Date</Text>
            <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setCalendarTarget('TO')}>
              <Text style={[s.dateText, { color: theme.text }, !toDate && { color: theme.textMuted }]}>{toDate || 'YYYY-MM-DD'}</Text>
              <CalendarIcon color={theme.textMuted} size={16} />
            </TouchableOpacity>
          </View>
          <View style={[s.inputBox, { flex: 1 }]}>
            <Text style={[s.label, { color: theme.textMuted }]}> </Text>
            <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setHalfTarget('TO')}>
              <Text style={[s.inputVal, { color: theme.text }]}>{toHalf}</Text>
              <ChevronDown color={theme.textMuted} size={16} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Authorised By */}
        {authorizedByList.length > 0 && (
          <View style={s.inputBox}>
            <Text style={[s.label, { color: theme.textMuted }]}>Authorised By</Text>
            {authorizedByList.length === 1 ? (
              <View style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Text style={[s.inputVal, { color: theme.text }]}>{selectedAuthBy?.name || 'Not Defined'}</Text>
              </View>
            ) : (
              <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setShowAuthPicker(true)}>
                <Text style={[s.inputVal, { color: theme.text }]}>{selectedAuthBy?.name || 'Select'}</Text>
                <ChevronDown color={theme.textMuted} size={16} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Approved By */}
        {approvedByList.length > 0 && (
          <View style={s.inputBox}>
            <Text style={[s.label, { color: theme.textMuted }]}>Approved By</Text>
            {approvedByList.length === 1 ? (
              <View style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Text style={[s.inputVal, { color: theme.text }]}>{selectedAppBy?.name || 'Not Defined'}</Text>
              </View>
            ) : (
              <TouchableOpacity style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={() => setShowAppPicker(true)}>
                <Text style={[s.inputVal, { color: theme.text }]}>{selectedAppBy?.name || 'Select'}</Text>
                <ChevronDown color={theme.textMuted} size={16} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Contact Number */}
        <View style={s.inputBox}>
          <Text style={[s.label, { color: theme.textMuted }]}>Contact Number</Text>
          <TextInput
            style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
            value={contactNo}
            onChangeText={setContactNo}
            placeholder="+91 0000000000"
            keyboardType="phone-pad"
            placeholderTextColor={theme.textMuted}
            maxLength={20}
          />
        </View>

        {/* Duties Handed Over */}
        <View style={s.inputBox}>
          <Text style={[s.label, { color: theme.textMuted }]}>Duties Handed Over To</Text>
          <TextInput
            style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
            value={handoverTo}
            onChangeText={setHandoverTo}
            placeholder="e.g. Handed over to Team Lead"
            placeholderTextColor={theme.textMuted}
            maxLength={20}
          />
        </View>

        {/* Reason */}
        <View style={s.inputBox}>
          <Text style={[s.label, { color: theme.textMuted }]}>Reason *</Text>
          <TextInput
            style={[s.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="Enter reason..."
            placeholderTextColor={theme.textMuted}
            maxLength={50}
          />
        </View>

        {/* File attachments */}
        <TouchableOpacity style={s.addFilesBtn} onPress={pickFile}>
          <Paperclip color={COLORS.primaryDeep} size={14} />
          <Text style={s.addFilesText}> Add files  (JPG, JPEG, PDF)</Text>
        </TouchableOpacity>
        {attachedFiles.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: moderateScale(22), marginBottom: moderateScale(16), overflow: 'visible' }} contentContainerStyle={{ overflow: 'visible' }}>
            {attachedFiles.map((f, i) => (
              <FileThumbnail key={i} file={f} onRemove={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} />
            ))}
            <TouchableOpacity style={[s.addMoreThumb, { backgroundColor: theme.cardSoft, borderColor: theme.border }]} onPress={pickFile}>
              <Text style={[s.addMorePlus, { color: theme.textMuted }]}>+</Text>
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

      <SelectionModal
        visible={showAuthPicker}
        title="Select Authorised By"
        options={authorizedByList.map(p => p.name)}
        selectedValue={selectedAuthBy?.name}
        onClose={() => setShowAuthPicker(false)}
        onSelect={(val) => {
          setSelectedAuthBy(authorizedByList.find(p => p.name === val) || null);
          setShowAuthPicker(false);
        }}
      />

      <SelectionModal
        visible={showAppPicker}
        title="Select Approved By"
        options={approvedByList.map(p => p.name)}
        selectedValue={selectedAppBy?.name}
        onClose={() => setShowAppPicker(false)}
        onSelect={(val) => {
          setSelectedAppBy(approvedByList.find(p => p.name === val) || null);
          setShowAppPicker(false);
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
        <LeaveHeader title="Leave History" onBack={() => setView('DASHBOARD')} theme={theme} />
        {/* Tab Bar */}
        <View style={[s.tabBar, { backgroundColor: theme.card, borderBottomColor: theme.divider }]}>
          {tabs.map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, histFilter === t.key && s.tabActive]} onPress={() => { setHistFilter(t.key); fetchHistory(t.key); }}>
              <Text style={[s.tabText, { color: theme.textMuted }, histFilter === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {histLoading ? (
          <ActivityIndicator size="large" color={COLORS.primaryDeep} style={{ marginTop: 60 }} />
        ) : histLeaves.length === 0 ? (
          <View style={s.emptyWrap}>
            <Clock color={theme.textMuted} size={48} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>No leaves found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll}>
            {histLeaves.map((item, idx) => (
              <HistoryCard
                key={item.leave_id || idx}
                item={item}
                onCancel={handleCancelLeave}
                cancelling={cancellingId === (item.leave_id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const SuccessView = () => (
    <View style={[s.successWrap, { backgroundColor: theme.bg }]}>
      <View style={[s.successCircle, { backgroundColor: theme.isDark ? '#14532D' : '#F0FDF4' }]}><CheckCircle color="#22C55E" size={80} strokeWidth={1.5} /></View>
      <Text style={[s.successTitle, { color: theme.text }]}>Request Sent Successfully!</Text>
      <Text style={[s.successSub, { color: theme.textLight }]}>Your leave request has been sent successfully. We will get back to you shortly!</Text>
      <TouchableOpacity style={[s.goHomeBtn, { borderColor: theme.border }]} onPress={() => { setView('DASHBOARD'); fetchAll(); }}>
        <Text style={[s.goHomeText, { color: theme.text }]}>Go Back Home</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
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
  scroll: { padding: moderateScale(20), paddingBottom: moderateScale(120) },

  // Balance cards
  balCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(16), marginBottom: moderateScale(12), overflow: 'hidden', height: moderateScale(72), ...SHADOWS.light },
  balBar: { width: 5 },
  balBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16) },
  balRatio: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text },
  balType: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 2 },
  histBtn: { backgroundColor: '#F5F3FF', padding: moderateScale(16), borderRadius: moderateScale(16), flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: moderateScale(24) },
  histBtnText: { color: COLORS.primaryDeep, fontWeight: '700', marginRight: moderateScale(8) },

  // Apply form
  remBanner: { backgroundColor: '#F5F3FF', paddingVertical: moderateScale(10), alignItems: 'center' },
  remText: { color: COLORS.primaryDeep, fontSize: moderateScale(12), fontWeight: '600' },
  dateRow: { flexDirection: 'row', marginBottom: moderateScale(16) },
  inputBox: { marginBottom: moderateScale(16) },
  label: { fontSize: moderateScale(11), fontWeight: '600', color: '#9CA3AF', marginBottom: moderateScale(6), marginLeft: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), height: moderateScale(48), color: '#000'
  },
  inputVal: { fontSize: moderateScale(14), fontWeight: '600', color: COLORS.text, flex: 1 },
  dateText: { fontSize: moderateScale(14), fontWeight: '600', color: COLORS.text, flex: 1 },

  // Files
  addFilesBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10), marginBottom: moderateScale(12) },
  addFilesText: { color: COLORS.primaryDeep, fontWeight: '700', fontSize: moderateScale(13) },
  addMoreThumb: { width: moderateScale(64), height: moderateScale(64), borderRadius: moderateScale(10), backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed' },
  addMorePlus: { fontSize: moderateScale(24), color: '#9CA3AF', fontWeight: '300' },

  submitBtn: { backgroundColor: COLORS.primaryDeep, height: moderateScale(60), borderRadius: moderateScale(30), justifyContent: 'center', alignItems: 'center', marginTop: moderateScale(8) },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: moderateScale(13), letterSpacing: 1.5 },

  // Approver Dropdown
  ddOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: moderateScale(32) },
  ddBox: { backgroundColor: '#FFF', borderRadius: moderateScale(20), padding: moderateScale(20), ...SHADOWS.medium },
  ddTitle: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text, marginBottom: moderateScale(16) },
  ddItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: moderateScale(14), borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  ddItemText: { fontSize: moderateScale(14), fontWeight: '600', color: COLORS.text },

  // History Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, paddingVertical: moderateScale(14), alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.primaryDeep },
  tabText: { fontSize: moderateScale(13), fontWeight: '700', color: '#9CA3AF' },
  tabTextActive: { color: COLORS.primaryDeep },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(60) },
  emptyText: { fontSize: moderateScale(14), color: '#9CA3AF', fontWeight: '600', marginTop: moderateScale(12) },

  // Success
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(40), backgroundColor: '#FFF' },
  successCircle: { width: moderateScale(140), height: moderateScale(140), borderRadius: moderateScale(70), backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(32) },
  successTitle: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: moderateScale(14) },
  successSub: { fontSize: moderateScale(14), color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: moderateScale(50) },
  goHomeBtn: { width: '100%', height: moderateScale(54), borderRadius: moderateScale(30), borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  goHomeText: { color: COLORS.text, fontWeight: '800' },
});

export default LeaveScreen;

