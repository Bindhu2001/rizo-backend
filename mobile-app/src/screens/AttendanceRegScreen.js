import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, Platform,
  Pressable, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, ChevronDown, CheckCircle,
  CalendarDays, ChevronRight, Check
} from 'lucide-react-native';
import axios from 'axios';
import { COLORS, SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';

const { width } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────
const REASONS = [
  'Forgot to Swipe',
  'System Issue',
  'Client Visit',
  'Power Outage',
  'Late Due to Traffic',
  'Medical Emergency',
  'Other',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtMonth = (date) => {
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
};
const monthKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};
const fmtDisplayDate = (isoDate) => {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) { return isoDate; }
};

// ─── Sub-components ──────────────────────────────────────────────────────────

// Floating Label Input
const FloatingInput = ({ label, value, onPress, icon, active, multiline, onChangeText, placeholder, editable, onIconPress }) => {
  const Container = (onPress && !editable) ? TouchableOpacity : View;
  
  return (
    <Container 
      activeOpacity={(onPress && !editable) ? 0.7 : 1} 
      onPress={!editable ? onPress : undefined} 
      style={[fi.container, active && fi.activeContainer, multiline && fi.multiline]}
    >
      <View style={fi.labelContainer}>
        <Text style={[fi.label, active && fi.activeLabel]}>{label}</Text>
      </View>
      {multiline ? (
        <TextInput
          style={fi.inputArea}
          value={value}
          onChangeText={onChangeText}
          multiline
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
        />
      ) : (
        <View style={fi.row}>
          {editable ? (
            <TextInput
              style={fi.singleInput}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              placeholderTextColor="#9CA3AF"
            />
          ) : (
            <Text style={fi.value}>{value}</Text>
          )}
          {icon && (
            onIconPress ? (
              <TouchableOpacity onPress={onIconPress} style={{ padding: 4, marginLeft: 8 }}>
                {icon}
              </TouchableOpacity>
            ) : (
              <View style={{ marginLeft: 8 }}>{icon}</View>
            )
          )}
        </View>
      )}
    </Container>
  );
};

const fi = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 24, position: 'relative' },
  activeContainer: { borderColor: '#E91E63' },
  multiline: { height: 120, paddingVertical: 12 },
  labelContainer: { position: 'absolute', top: -10, left: 12, backgroundColor: '#FFF', paddingHorizontal: 4 },
  label: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  activeLabel: { color: '#E91E63', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  singleInput: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500', paddingVertical: 0 },
  inputArea: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500', textAlignVertical: 'top' },
});

// Custom Circular Target Icon for MISSING
const TargetIcon = ({ color }) => (
  <View style={[ti.outer, { borderColor: color }]}>
    <View style={[ti.inner, { backgroundColor: color }]} />
  </View>
);
const ti = StyleSheet.create({
  outer: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  inner: { width: 8, height: 8, borderRadius: 4 }
});

const ClockIcon = () => (
  <View style={ci.circle}>
    <View style={ci.handHr} />
    <View style={ci.handMin} />
  </View>
);
const ci = StyleSheet.create({
  circle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  handHr: { position: 'absolute', width: 1.5, height: 4, backgroundColor: '#111827', top: 4 },
  handMin: { position: 'absolute', width: 4, height: 1.5, backgroundColor: '#111827', left: 8 }
});

// Attendance Log Card
const LogCard = ({ item, regMap, onRegularise }) => {
  const punchIn = item.punch_in_time;
  const punchOut = item.punch_out_time;
  const missingIn = !punchIn;
  const missingOut = !punchOut;

  const regsForDate = regMap[item.date] || [];

  return (
    <View style={lc.card}>
      {/* Header */}
      <View style={lc.header}>
        <View style={{ flex: 1 }}>
          <Text style={lc.date}>{fmtDisplayDate(item.date)}</Text>
          <Text style={lc.shift}>
            {item.shift ? item.shift.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'General Shift'} (9:30 AM - 6:30 PM)
          </Text>
        </View>
        {(item.status?.includes('WO') || item.status === 'WEEKLY_OFF') && (
          <View style={lc.woBadge}><Text style={lc.woText}>WO</Text></View>
        )}
      </View>

      {/* Punches section with connecting line */}
      <View style={lc.punchContainer}>
        <View style={lc.punchLine} />
        
        {/* Clock In */}
        <TouchableOpacity 
          style={lc.punchRow} 
          disabled={!missingIn || regsForDate.some(r => r.direction === 'IN' || r.type === 'IN')} 
          onPress={() => onRegularise(item, 'IN')}
          activeOpacity={0.7}
        >
          <View style={lc.iconWrap}>
            {missingIn ? <TargetIcon color="#F44336" /> : <View style={lc.dotGreen} />}
          </View>
          <View style={lc.punchInfo}>
            {missingIn ? (
              <View style={lc.missingRow}>
                <Text style={lc.missingTitle}>Clock In{'\n'}<Text style={lc.missingText}>MISSING</Text></Text>
                <View style={lc.regBtn}><Text style={lc.regBtnText}>REGULARISE</Text></View>
              </View>
            ) : (
              <View style={lc.filledRow}>
                <View>
                  <Text style={lc.timeText}>{punchIn?.split(' ')[1] || punchIn}</Text>
                  <Text style={lc.locText}>Location: {item.location || 'Office Premises'}</Text>
                </View>
                <View style={[lc.roleBadge]}><Text style={lc.roleText}>Clock In</Text></View>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Clock Out */}
        <TouchableOpacity 
          style={[lc.punchRow, { marginTop: 24 }]} 
          disabled={!missingOut || regsForDate.some(r => r.direction === 'OUT' || r.type === 'OUT')}
          onPress={() => onRegularise(item, 'OUT')}
          activeOpacity={0.7}
        >
          <View style={lc.iconWrap}>
            {missingOut ? <TargetIcon color="#F44336" /> : <View style={[lc.dotGreen, { backgroundColor: '#F48FB1', borderColor: '#F48FB1' }]} />}
          </View>
          <View style={lc.punchInfo}>
            {missingOut ? (
              <View style={lc.missingRow}>
                <Text style={lc.missingTitle}>Clock Out{'\n'}<Text style={lc.missingText}>MISSING</Text></Text>
                <View style={lc.regBtn}><Text style={lc.regBtnText}>REGULARISE</Text></View>
              </View>
            ) : (
              <View style={lc.filledRow}>
                <View>
                  <Text style={lc.timeText}>{punchOut?.split(' ')[1] || punchOut}</Text>
                  <Text style={lc.locText}>Location: {item.location || 'Office Premises'}</Text>
                </View>
                <View style={[lc.roleBadge, { backgroundColor: '#FCE4EC' }]}><Text style={[lc.roleText, { color: '#E91E63' }]}>Clock Out</Text></View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Regularisation Statuses */}
      {regsForDate.map((reg, idx) => {
        const s = reg.status?.toLowerCase() || 'pending';
        let bg = '#FEF3C7', text = '#D97706', msg = reg.remarks;
        if (s === 'approved') { bg = '#DCFCE7'; text = '#16A34A'; msg = reg.remarks || 'Request adjusted.'; }
        if (s === 'rejected') { bg = '#FEE2E2'; text = '#DC2626'; msg = reg.remarks || "Seems like you haven't informed your manager about your absence"; }

        return (
          <View key={idx} style={[lc.regBox, { backgroundColor: s === 'pending' ? '#FEF3C7' : (s === 'rejected' ? '#FEE2E2' : '#DCFCE7') }]}>
            <View style={{ flex: 1 }}>
              <Text style={lc.regTitle}>Regularisation Status</Text>
              <Text style={lc.regMsg}>{msg}</Text>
            </View>
            <View style={[lc.regBadge, { backgroundColor: s === 'pending' ? '#FDE68A' : (s === 'rejected' ? '#FECACA' : '#A7F3D0') }]}>
              <Text style={[lc.regBadgeText, { color: text }]}>{reg.status || 'Pending'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const lc = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 16, ...SHADOWS.light },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  date: { fontSize: 16, fontWeight: '800', color: '#111827' },
  shift: { fontSize: 12, color: '#9CA3AF', marginTop: 3, fontWeight: '600' },
  woBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  woText: { fontSize: 10, color: '#9CA3AF', fontWeight: '800' },

  punchContainer: { position: 'relative', marginTop: 8 },
  punchLine: { 
    position: 'absolute', 
    top: 14, bottom: 20, left: 8, 
    width: 2, 
    backgroundColor: '#F3F4F6',
    zIndex: -1
  },
  punchRow: { flexDirection: 'row', alignItems: 'flex-start' },
  iconWrap: { width: 18, alignItems: 'center', marginTop: 2, backgroundColor: '#FFF' },
  dotGreen: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2ECC71', borderWidth: 3.5, borderColor: '#DCFCE7' },
  
  punchInfo: { flex: 1, marginLeft: 16 },
  missingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missingTitle: { fontSize: 14, fontWeight: '700', color: '#111827', lineHeight: 18 },
  missingText: { fontSize: 11, fontWeight: '800', color: '#F44336', textTransform: 'uppercase' },
  regBtn: { backgroundColor: '#D32F2F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  regBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  filledRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeText: { fontSize: 15, fontWeight: '800', color: '#111827' },
  locText: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  roleBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  roleText: { fontSize: 10, fontWeight: '900', color: '#1976D2' },

  regBox: { flexDirection: 'row', alignItems: 'center', marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: '#F9FAFB' },
  regTitle: { fontSize: 13, fontWeight: '800', color: '#111827', marginBottom: 2 },
  regMsg: { fontSize: 11, color: '#6B7280', fontWeight: '500', lineHeight: 16 },
  regBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFF', ...SHADOWS.light },
  regBadgeText: { fontSize: 10, fontWeight: '900' },
});

// Analog Time Picker Modal
const AnalogTimePicker = ({ visible, value, onClose, onConfirm }) => {
  const [isAm, setIsAm] = useState(true);
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (visible) {
      if (value) {
        const parts = value.split(':');
        let h = parseInt(parts[0], 10) || 7;
        const m = parseInt(parts[1], 10) || 0;
        setIsAm(h < 12);
        setHour(h % 12 || 12);
        setMinute(m);
      }
    }
  }, [visible, value]);

  const rCenter = 100;
  const radius = 80;

  const getPos = (num) => {
    const angle = (num * 30) * (Math.PI / 180);
    return {
      x: rCenter + radius * Math.sin(angle) - 15,
      y: rCenter - radius * Math.cos(angle) - 15,
    };
  };

  const handleOk = () => {
    let finalH = hour;
    if (isAm && finalH === 12) finalH = 0;
    if (!isAm && finalH < 12) finalH += 12;
    const hh = String(finalH).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    onConfirm(`${hh}:${mm}:00`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={tp.overlay}>
        <View style={tp.box}>
          <Text style={tp.title}>SELECT TIME</Text>

          <View style={tp.displayRow}>
            <View style={tp.timeBox}>
              <Text style={tp.timeNumber}>{hour}</Text>
            </View>
            <Text style={tp.colon}>:</Text>
            <View style={[tp.timeBox, tp.timeBoxInactive]}>
              <Text style={[tp.timeNumber, tp.timeNumberInactive]}>{String(minute).padStart(2, '0')}</Text>
            </View>
            <View style={tp.ampmBox}>
              <TouchableOpacity style={isAm ? tp.ampmActive : tp.ampmInactive} onPress={() => setIsAm(true)}>
                <Text style={isAm ? tp.ampmTextActive : tp.ampmTextInactive}>AM</Text>
              </TouchableOpacity>
              <View style={{ height: 1, backgroundColor: '#E5E7EB' }} />
              <TouchableOpacity style={!isAm ? tp.ampmActive : tp.ampmInactive} onPress={() => setIsAm(false)}>
                <Text style={!isAm ? tp.ampmTextActive : tp.ampmTextInactive}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Clock Face */}
          <View style={tp.clockWrap}>
            <View style={tp.clockFace}>
               <View style={tp.centerDot} />
               {(() => {
                 const angle = (hour * 30 - 90) * (Math.PI / 180);
                 return (
                   <View style={[tp.hand, { transform: [ { rotate: `${hour * 30}deg` } ] }]} />
                 );
               })()}

               {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => {
                 const {x, y} = getPos(n);
                 const active = n === hour;
                 return (
                   <TouchableOpacity
                     key={n}
                     style={[tp.numNode, { left: x, top: y }, active && tp.numNodeActive]}
                     onPress={() => setHour(n)}
                   >
                     <Text style={[tp.numText, active && tp.numTextActive]}>{n}</Text>
                   </TouchableOpacity>
                 );
               })}
            </View>
          </View>

          <View style={tp.actions}>
            <TouchableOpacity onPress={onClose} style={tp.btn}><Text style={tp.btnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleOk} style={tp.btn}><Text style={tp.btnText}>Ok</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const tp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: 320, ...SHADOWS.medium },
  title: { fontSize: 12, fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginBottom: 20 },
  displayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  timeBox: { backgroundColor: '#F3F4F6', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  timeBoxInactive: { backgroundColor: 'transparent' },
  timeNumber: { fontSize: 36, fontWeight: '400', color: '#111827' },
  timeNumberInactive: { color: '#6B7280' },
  colon: { fontSize: 36, marginHorizontal: 8, color: '#111827' },
  ampmBox: { marginLeft: 'auto', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden', flexDirection: 'column' },
  ampmActive: { backgroundColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 12 },
  ampmInactive: { backgroundColor: '#FFF', paddingVertical: 10, paddingHorizontal: 12 },
  ampmTextActive: { fontSize: 13, fontWeight: '700', color: '#111827' },
  ampmTextInactive: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },

  clockWrap: { alignItems: 'center', marginBottom: 20 },
  clockFace: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#F9FAFB', position: 'relative' },
  centerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B7280', position: 'absolute', top: 96, left: 96, zIndex: 10 },
  hand: { position: 'absolute', width: 2, height: 75, backgroundColor: '#6B7280', top: 25, left: 99, transformOrigin: 'bottom' },
  numNode: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', position: 'absolute' },
  numNodeActive: { backgroundColor: '#4B5563' },
  numText: { fontSize: 14, color: '#111827' },
  numTextActive: { color: '#FFF' },

  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'flex-end', gap: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
});

// Reason Picker Modal
const ReasonPickerModal = ({ visible, value, onClose, onConfirm }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <Pressable style={rp.overlay} onPress={onClose}>
      <View style={rp.sheet}>
        <View style={rp.handle} />
        <ScrollView>
          {REASONS.map((r) => (
            <TouchableOpacity key={r} style={rp.item} onPress={() => { onConfirm(r); onClose(); }}>
              <Text style={[rp.itemText, r === value && rp.itemTextActive]}>{r}</Text>
              {r === value && <Check color="#111827" size={20} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Pressable>
  </Modal>
);
const rp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24, maxHeight: 400 },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: 15, color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const AttendanceRegScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100056' };

  const [tab, setTab] = useState(route?.params?.initialTab || 'LOG');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const [attLogs, setAttLogs] = useState([]);
  const [regLogs, setRegLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState('MAIN');
  const [selectedDay, setSelectedDay] = useState(null);

  const [direction, setDirection] = useState('IN');
  const [reason, setReason] = useState(REASONS[0]);
  const [logTime, setLogTime] = useState('18:30:00');
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);

  useEffect(() => {
    if (route?.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  const regMap = {};
  regLogs.forEach(r => {
    const d = r.date || r.dates;
    if (!d) return;
    if (!regMap[d]) regMap[d] = [];
    regMap[d].push(r);
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const mk = monthKey(selectedMonth);
    try {
      const [attRes, regRes] = await Promise.all([
        axios.get(API_ENDPOINTS.ATTENDANCE_LOGS, { params: { user_id: user.user_id, month: mk }, timeout: 10000 }),
        axios.get(API_ENDPOINTS.REGULARISATION_LOGS, { params: { user_id: user.user_id, month: mk }, timeout: 10000 }),
      ]);
      setAttLogs(attRes.data?.data || []);
      setRegLogs(regRes.data?.data || []);
    } catch (e) {
      console.log('Error', e);
    } finally {
      setLoading(false);
    }
  }, [user.user_id, selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openRegForm = (attItem, dir) => {
    setSelectedDay(attItem);
    setDirection(dir);
    setReason(REASONS[0]);
    // Auto-set the time string to either beginning or end of day based on direction
    setLogTime(dir === 'IN' ? '09:00:00' : '18:30:00');
    setRemarks('');
    setView('FORM');
  };

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const payload = {
        user_id: user.user_id,
        direction,
        dates: selectedDay.date,
        log_time: logTime,
        remarks: remarks || reason,
      };
      const res = await axios.post(API_ENDPOINTS.REGULARISE, payload, { timeout: 10000 });
      if (res.data?.success === 1) {
        setView('SUCCESS');
        setTab('REGULARISED');
        fetchData();
      } else {
        Alert.alert('Cannot Submit', res.data?.message || 'Request failed.');
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || e.message || 'Submission failed');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Views ────────────────────────────────────────────────────────
  if (view === 'FORM') {
    const isSubmitActive = !!remarks.trim() || !!reason;
    
    return (
      <SafeAreaView style={s.container}>
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => setView('MAIN')} style={s.backBtn}>
            <ChevronLeft color="#111827" size={24} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Regularise Attendance</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
          <View style={s.formWrap}>
            <FloatingInput
              label="Reason"
              value={reason}
              onChangeText={setReason}
              editable={true}
              onIconPress={() => setShowReasonPicker(true)}
              icon={<ChevronDown color="#9CA3AF" size={20} />}
            />

            <FloatingInput
              label="Enter Time"
              value={logTime}
              onPress={() => setShowTimePicker(true)}
              icon={<ClockIcon />}
            />

            <FloatingInput
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              active={true}
              placeholder="Type your remarks..."
            />

            <TouchableOpacity
              style={[s.submitBtn, isSubmitActive && s.submitBtnActive]}
              onPress={handleSubmit}
              disabled={processing || !isSubmitActive}
            >
              {processing ? <ActivityIndicator color="#FFF" /> : <Text style={[s.submitText, isSubmitActive && s.submitTextActive]}>SUBMIT REQUEST</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <AnalogTimePicker
          visible={showTimePicker}
          value={logTime}
          onClose={() => setShowTimePicker(false)}
          onConfirm={(t) => setLogTime(t)}
        />
        <ReasonPickerModal
          visible={showReasonPicker}
          value={reason}
          onClose={() => setShowReasonPicker(false)}
          onConfirm={(r) => setReason(r)}
        />
      </SafeAreaView>
    );
  }

  if (view === 'SUCCESS') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successBox}>
          <View style={s.successAura}>
            <View style={s.successCircleInner}>
               <Check color="#10B981" size={48} strokeWidth={3} />
            </View>
          </View>
          <Text style={s.successTitle}>Request Sent Successfully!</Text>
          <Text style={s.successDesc}>Your Regularisation request has been sent successfully, We will get back to you shortly!</Text>

          <TouchableOpacity style={s.homeBtn} onPress={() => setView('MAIN')} activeOpacity={0.7}>
            <Text style={s.homeBtnText}>Go Back Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color="#111827" size={24} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Attendance</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={s.tabBox}>
        <View style={s.tabsWrap}>
          <TouchableOpacity style={s.tabItem} onPress={() => setTab('LOG')}>
            <Text style={[s.tabLabel, tab === 'LOG' && s.tabLabelActive]}>Log</Text>
            {tab === 'LOG' && <View style={s.tabLine} />}
          </TouchableOpacity>

          <TouchableOpacity style={s.tabItem} onPress={() => setTab('REGULARISED')}>
            <Text style={[s.tabLabel, tab === 'REGULARISED' && s.tabLabelActive]}>Regularised</Text>
            {tab === 'REGULARISED' && <View style={s.tabLine} />}
          </TouchableOpacity>
        </View>

        <View style={s.monthSelector}>
          <TouchableOpacity
            onPress={() => {
              const d = new Date(selectedMonth);
              d.setMonth(d.getMonth() - 1);
              setSelectedMonth(d);
            }}
            style={{ padding: 8 }}
          >
            <ChevronLeft color="#111827" size={16} />
          </TouchableOpacity>
          <Text style={s.monthText}>{fmtMonth(selectedMonth)}</Text>
          <TouchableOpacity
            onPress={() => {
              const d = new Date(selectedMonth);
              d.setMonth(d.getMonth() + 1);
              setSelectedMonth(d);
            }}
            style={{ padding: 8 }}
          >
            <ChevronRight color="#111827" size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#E91E63" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listScroll}>
          {tab === 'LOG' && attLogs.map((item, i) => (
            <LogCard key={item.date || i} item={item} regMap={regMap} onRegularise={openRegForm} />
          ))}
          {/* Note: REGULARISED tab re-renders Logs that have a regularisation array mapped to them */}
          {tab === 'REGULARISED' && regLogs.length === 0 ? (
             <View style={{ padding: 40, alignItems: 'center' }}><Text style={{ color: '#9CA3AF' }}>No regularised logs found.</Text></View>
          ) : (
             tab === 'REGULARISED' && attLogs.filter(a => (regMap[a.date] || []).length > 0).map((item, i) => (
               <LogCard key={`reg-${i}`} item={item} regMap={regMap} onRegularise={openRegForm} />
             ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 60, paddingHorizontal: 8, backgroundColor: '#FFF' },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },

  tabBox: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tabsWrap: { flexDirection: 'row' },
  tabItem: { paddingVertical: 14, marginRight: 24, position: 'relative' },
  tabLabel: { fontSize: 14, fontWeight: '500', color: '#9CA3AF' },
  tabLabelActive: { color: '#E91E63', fontWeight: '700' },
  tabLine: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, backgroundColor: '#E91E63', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  monthSelector: { flexDirection: 'row', alignItems: 'center', paddingBottom: 14 },
  monthText: { fontSize: 14, fontWeight: '600', color: '#111827' },

  listScroll: { padding: 16, paddingBottom: 120 },

  formScroll: { padding: 20, paddingBottom: 120 },
  formWrap: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, paddingBottom: 40, ...SHADOWS.light, minHeight: Dimensions.get('window').height * 0.7 },
  submitBtn: { backgroundColor: '#F3F4F6', paddingVertical: 16, borderRadius: 50, alignItems: 'center', marginTop: 'auto' },
  submitBtnActive: { backgroundColor: '#E91E63' },
  submitText: { color: '#9CA3AF', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  submitTextActive: { color: '#FFF' },

  successBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#FFF' },
  successAura: { width: 180, height: 180, borderRadius: 90, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  successCircleInner: { width: 90, height: 90, borderRadius: 45, borderWidth: 6, borderColor: '#10B981', backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 12 },
  successDesc: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 40, paddingHorizontal: 10 },
  homeBtn: { width: '100%', paddingVertical: 16, borderRadius: 50, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#FFF' },
  homeBtnText: { fontSize: 15, fontWeight: '700', color: '#111827' },
});

export default AttendanceRegScreen;
