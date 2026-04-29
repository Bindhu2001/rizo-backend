import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, Platform,
  Pressable, Dimensions, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle, CalendarDays, Check, Target, ChevronDown, ChevronLeft, Clock
} from 'lucide-react-native';
import axios from 'axios';
import { COLORS, SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';
import { format } from 'date-fns';

const formatPunchTime = (isoOrFull) => {
  if (!isoOrFull || isoOrFull === '---') return '---';
  try {
    const d = new Date(isoOrFull.replace(' ', 'T'));
    if (isNaN(d.getTime())) return isoOrFull.split(' ')[1]?.slice(0, 5) || isoOrFull;
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return isoOrFull;
  }
};

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
const FloatingInput = ({ label, value, onPress, icon, active, multiline, onChangeText, placeholder, editable, onIconPress, maxLength }) => {
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
          maxLength={maxLength}
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
              maxLength={maxLength}
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
  singleInput: { flex: 1, fontSize: 15, color: '#000', fontWeight: '500', paddingVertical: 0 },
  inputArea: { flex: 1, fontSize: 15, color: '#000', fontWeight: '500', textAlignVertical: 'top' },
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
  <Clock color="#000" size={18} strokeWidth={2} />
);


const LogCard = ({ item, isRegularisedTab, regsForDate, onRegularise }) => {
  const punchInRaw = formatPunchTime(item.punch_in_time);
  const punchOutRaw = formatPunchTime(item.punch_out_time);
  
  const d = new Date(item.date || new Date().toISOString());
  const displayMonthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const hasPunchIn = !!item.punch_in_time;
  const hasPunchOut = !!item.punch_out_time;

  return (
    <View style={lc.card}>
      <View style={lc.headerRow}>
        <View>
          <Text style={lc.dateTitle}>{displayMonthDay}</Text>
          <Text style={lc.shiftText}>{item.shift ? item.shift.replace(/_/g, ' ') : 'General Shift (9:30 AM - 6:30 PM)'}</Text>
        </View>
        <View style={lc.badgeWo}>
          <Text style={lc.badgeWoText}>{item.status || 'WO'}</Text>
        </View>
      </View>

      <View style={lc.punchContainer}>
        <View style={lc.trackLine} />
        
        {/* IN */}
        <View style={lc.punchRowBox}>
          <View style={lc.iconCol}>
            {hasPunchIn ? <CheckCircle color="#16A34A" size={18} /> : <Target color="#DC2626" size={18} />}
          </View>
          <View style={lc.timeCol}>
            {hasPunchIn ? (
              <>
                <Text style={lc.timeVal}>{punchInRaw}</Text>
                <Text style={lc.locText}>Location: {item.location || 'Not Available'}</Text>
                {!isRegularisedTab && (
                  <TouchableOpacity style={lc.regBtnActionSecondary} onPress={() => onRegularise(item, 'IN')}>
                    <Text style={lc.regBtnActionTextSecondary}>REGULARISE</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={lc.missingHdr}>Clock In</Text>
                <Text style={lc.missingVal}>MISSING</Text>
                {!isRegularisedTab && (
                  <TouchableOpacity style={lc.regBtnAction} onPress={() => onRegularise(item, 'IN')}>
                    <Text style={lc.regBtnActionText}>REGULARISE</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
          <View style={lc.chipCol}>
            <View style={lc.chipBg}><Text style={lc.chipText}>Clock IN</Text></View>
          </View>
        </View>

        {/* OUT */}
        <View style={[lc.punchRowBox, { marginTop: 32 }]}>
          <View style={[lc.iconCol, { backgroundColor: '#FFF' }]}>
            {hasPunchOut ? <CheckCircle color="#16A34A" size={18} /> : <TargetIcon color="#DC2626" />}
          </View>
          <View style={lc.timeCol}>
            {hasPunchOut ? (
              <>
                <Text style={lc.timeVal}>{punchOutRaw}</Text>
                <Text style={lc.locText}>Location: {item.location || 'Not Available'}</Text>
                {!isRegularisedTab && (
                  <TouchableOpacity style={lc.regBtnActionSecondary} onPress={() => onRegularise(item, 'OUT')}>
                    <Text style={lc.regBtnActionTextSecondary}>REGULARISE</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={lc.missingHdr}>Clock Out</Text>
                <Text style={lc.missingVal}>MISSING</Text>
                {!isRegularisedTab && (
                  <TouchableOpacity style={lc.regBtnAction} onPress={() => onRegularise(item, 'OUT')}>
                    <Text style={lc.regBtnActionText}>REGULARISE</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
          <View style={lc.chipCol}>
            <View style={lc.chipBg}><Text style={lc.chipText}>Clock Out</Text></View>
          </View>
        </View>
      </View>

      {/* Reg Statuses */}
      {isRegularisedTab && (regsForDate || []).map((reg, idx) => {
        const s = (reg.reg_status || reg.status || 'p').toLowerCase();
        let bgStyle = { backgroundColor: '#FFF3E0' }, textStyle = { color: '#F97316' }, statusString = 'Pending';
        if (s === 'a' || s === 'approved') { bgStyle.backgroundColor = '#F0FDF4'; textStyle.color = '#16A34A'; statusString = 'Approved'; }
        else if (s === 'r' || s === 'rejected') { bgStyle.backgroundColor = '#FEF2F2'; textStyle.color = '#DC2626'; statusString = 'Rejected'; }

        return (
          <View key={idx} style={[lc.regBox, bgStyle]}>
            <View style={{ flex: 1 }}>
              <Text style={lc.regTitle}>Regularisation Status</Text>
              <Text style={lc.regMsg}>{reg.remarks || 'HR team is still reviewing your request'}</Text>
            </View>
            <View style={[lc.regBadge, { backgroundColor: textStyle.color + '20' }]}>
              <Text style={[lc.regBadgeText, textStyle]}>{statusString}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const lc = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dateTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
  shiftText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  badgeWo: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeWoText: { fontSize: 10, fontWeight: '800', color: '#9CA3AF' },
  
  punchContainer: { position: 'relative', paddingLeft: 8, marginTop: 10 },
  trackLine: { position: 'absolute', left: 16.5, top: 20, bottom: 20, width: 2, backgroundColor: '#E5E7EB', borderStyle: 'dotted', zIndex: 0 },
  
  punchRowBox: { flexDirection: 'row', alignItems: 'flex-start', zIndex: 1 },
  iconCol: { width: 20, alignItems: 'center', backgroundColor: '#FFF', marginTop: 0 },
  timeCol: { flex: 1, paddingLeft: 16, paddingTop: 1 },
  timeVal: { fontSize: 14, fontWeight: '800', color: '#111827' },
  locText: { fontSize: 10, color: '#6B7280', marginTop: 4, lineHeight: 14, paddingRight: 10 },
  
  missingHdr: { fontSize: 12, color: '#4B5563', fontWeight: '500' },
  missingVal: { fontSize: 13, fontWeight: '900', color: '#DC2626', marginTop: 2 },
  regBtnAction: { backgroundColor: '#DC2626', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 10 },
  regBtnActionText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  regBtnActionSecondary: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  regBtnActionTextSecondary: { color: '#4B5563', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  
  chipCol: { marginLeft: 10 },
  chipBg: { backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  chipText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },

  regBox: { flexDirection: 'row', alignItems: 'center', marginTop: 24, padding: 14, borderRadius: 12 },
  regTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  regMsg: { fontSize: 11, color: '#6B7280', marginTop: 4, fontWeight: '500', lineHeight: 16 },
  regBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginLeft: 10 },
  regBadgeText: { fontSize: 11, fontWeight: '800' },
});

// Analog Time Picker Modal
const AnalogTimePicker = ({ visible, value, onClose, onConfirm }) => {
  const [isAm, setIsAm] = useState(true);
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [mode, setMode] = useState('hour'); // 'hour' | 'minute'

  useEffect(() => {
    if (visible) {
      setMode('hour');
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

  const getPos = (idx) => {
    const angle = (idx * 30) * (Math.PI / 180);
    return {
      x: rCenter + radius * Math.sin(angle) - 15,
      y: rCenter - radius * Math.cos(angle) - 15,
    };
  };

  const minuteMarks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const handleOk = () => {
    let finalH = hour;
    if (isAm && finalH === 12) finalH = 0;
    if (!isAm && finalH < 12) finalH += 12;
    const hh = String(finalH).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    onConfirm(`${hh}:${mm}:00`);
    onClose();
  };

  const handleTouch = (evt) => {
    const { locationX, locationY } = evt.nativeEvent;
    const dx = locationX - 100;
    const dy = locationY - 100;
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    if (mode === 'hour') {
      let h = Math.round(angle / 30);
      if (h === 0) h = 12;
      setHour(h);
    } else {
      let m = Math.round(angle / 6);
      if (m === 60) m = 0;
      setMinute(m);
    }
  };

  const handleRelease = () => {
    if (mode === 'hour') {
      setMode('minute');
    }
  };

  const handAngle = mode === 'hour' ? hour * 30 : minute * 6;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={tp.overlay}>
        <View style={tp.box}>
          <Text style={tp.title}>SELECT TIME</Text>

          <View style={tp.displayRow}>
            <TouchableOpacity
              style={mode === 'hour' ? tp.timeBox : tp.timeBoxInactive}
              onPress={() => setMode('hour')}
            >
              <Text style={[tp.timeNumber, mode !== 'hour' && tp.timeNumberInactive]}>
                {String(hour).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
            <Text style={tp.colon}>:</Text>
            <TouchableOpacity
              style={mode === 'minute' ? tp.timeBox : tp.timeBoxInactive}
              onPress={() => setMode('minute')}
            >
              <Text style={[tp.timeNumber, mode !== 'minute' && tp.timeNumberInactive]}>
                {String(minute).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
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
            <View 
              style={tp.clockFace}
              onStartShouldSetResponder={() => true}
              onResponderGrant={handleTouch}
              onResponderMove={handleTouch}
              onResponderRelease={handleRelease}
            >
              <View style={tp.centerDot} />
              <View style={[tp.hand, { transform: [{ rotate: `${handAngle}deg` }] }]} />

              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {mode === 'hour'
                  ? [1,2,3,4,5,6,7,8,9,10,11,12].map(n => {
                      const { x, y } = getPos(n);
                      const active = n === hour;
                      return (
                        <View key={n} style={[tp.numNode, { left: x, top: y }, active && tp.numNodeActive]}>
                          <Text style={[tp.numText, active && tp.numTextActive]}>{n}</Text>
                        </View>
                      );
                    })
                  : minuteMarks.map((m, idx) => {
                      const { x, y } = getPos(idx);
                      const active = m === minute;
                      return (
                        <View key={m} style={[tp.numNode, { left: x, top: y }, active && tp.numNodeActive]}>
                          <Text style={[tp.numText, active && tp.numTextActive]}>
                            {String(m).padStart(2, '0')}
                          </Text>
                        </View>
                      );
                    })
                }
              </View>
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
  const user = route?.params?.user;

  useEffect(() => {
    if (!user) {
       navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

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
  const [showMonthPickerMain, setShowMonthPickerMain] = useState(false);

  useEffect(() => {
    if (route?.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const mk = monthKey(selectedMonth);
    try {
      const [attResp, regResp] = await Promise.all([
        axios.post(API_ENDPOINTS.ATTENDANCE_LOGS, { user_id: user.user_id, month: mk }, { timeout: 10000 }).catch(() => null),
        axios.post(API_ENDPOINTS.REGULARISATION_LOGS, { user_id: user.user_id, month: mk }, { timeout: 10000 }).catch(() => null)
      ]);

      const getSafeArray = (resp) => {
        if (!resp || !resp.data) return [];
        if (Array.isArray(resp.data.data)) return resp.data.data;
        if (Array.isArray(resp.data)) return resp.data;
        return [];
      };

      setAttLogs(getSafeArray(attResp));
      setRegLogs(getSafeArray(regResp));
    } catch (e) {
      console.log('Error', e);
      setAttLogs([]);
      setRegLogs([]);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!user) return null;

  // Generate last 12 months for picker
  const pastMonthsInfo = [];
  const currentDate = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    pastMonthsInfo.push({
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      date: d,
      key: `${d.getFullYear()}-${d.getMonth()}`
    });
  }

  const regMap = {};
  regLogs.forEach(r => {
    const d = r.date || r.dates;
    if (!d) return;
    if (!regMap[d]) regMap[d] = [];
    regMap[d].push(r);
  });

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
            <ChevronLeft color="#333" size={28} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Regularise Attendance</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
          <View style={s.formWrap}>
            <FloatingInput
              label="Reason"
              value={reason}
              editable={false}
              onPress={() => setShowReasonPicker(true)}
              icon={<ChevronDown color="#9CA3AF" size={18} />}
            />

            <FloatingInput
              label="Enter Time"
              value={logTime}
              onPress={() => setShowTimePicker(true)}
              editable={false}
              icon={<ClockIcon />}
            />

            <FloatingInput
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              active={true}
              maxLength={50}
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
          <ChevronLeft color="#333" size={28} />
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

        <TouchableOpacity 
          style={s.monthDropdown}
          activeOpacity={0.7}
          onPress={() => setShowMonthPickerMain(true)}
        >
          <Text style={s.monthText}>{fmtMonth(selectedMonth)}</Text>
          <ChevronDown color={COLORS.primary} size={16} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#E91E63" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listScroll}>
          {tab === 'LOG' && attLogs.map((item, i) => (
            <LogCard key={item.date || i} item={item} isRegularisedTab={false} onRegularise={openRegForm} />
          ))}
          {tab === 'REGULARISED' && regLogs.length === 0 ? (
             <View style={{ padding: 40, alignItems: 'center' }}><Text style={{ color: '#9CA3AF' }}>No regularised logs found.</Text></View>
          ) : (
             tab === 'REGULARISED' && attLogs.filter(a => (regMap[a.date] || []).length > 0).map((item, i) => (
               <LogCard key={`reg-${i}`} item={item} isRegularisedTab={true} regsForDate={regMap[item.date] || []} onRegularise={openRegForm} />
             ))
          )}
        </ScrollView>
      )}

      {/* ── Month Picker Modal for Regularisation Screen ── */}
      <Modal visible={showMonthPickerMain} transparent animationType="slide" onRequestClose={() => setShowMonthPickerMain(false)} statusBarTranslucent>
        <Pressable style={s.modalOverlay} onPress={() => setShowMonthPickerMain(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Month</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pastMonthsInfo.map((m) => {
                const isActive = m.key === `${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`;
                return (
                  <TouchableOpacity 
                    key={m.key} 
                    style={s.monthItem} 
                    onPress={() => {
                      setSelectedMonth(m.date);
                      setShowMonthPickerMain(false);
                    }}
                  >
                    <Text style={[s.monthItemText, isActive && s.monthItemTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
  monthDropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginBottom: 10, alignSelf: 'center' },
  monthText: { fontSize: 13, fontWeight: '700', color: '#111827' },

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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: Dimensions.get('window').height * 0.5 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  monthItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', alignItems: 'center' },
  monthItemText: { fontSize: 15, color: '#4B5563', fontWeight: '500' },
  monthItemTextActive: { color: '#E91E63', fontWeight: '800' },
});

export default AttendanceRegScreen;
