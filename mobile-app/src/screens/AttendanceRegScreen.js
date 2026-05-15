import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Modal, Platform,
  Pressable, Dimensions, Image, KeyboardAvoidingView, RefreshControl
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle, CalendarDays, Check, Target, ChevronDown, ChevronLeft, Clock
} from 'lucide-react-native';
import axios from 'axios';
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
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
  container: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(14), marginBottom: moderateScale(24), position: 'relative' },
  activeContainer: { borderColor: '#E91E63' },
  multiline: { height: moderateScale(120), paddingVertical: moderateScale(12) },
  labelContainer: { position: 'absolute', top: -10, left: 12, backgroundColor: '#FFF', paddingHorizontal: 4 },
  label: { fontSize: moderateScale(12), color: '#6B7280', fontWeight: '500' },
  activeLabel: { color: '#E91E63', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { flex: 1, fontSize: moderateScale(15), color: '#111827', fontWeight: '500' },
  singleInput: { flex: 1, fontSize: moderateScale(15), color: '#000', fontWeight: '500', paddingVertical: 0 },
  inputArea: { flex: 1, fontSize: moderateScale(15), color: '#000', fontWeight: '500', textAlignVertical: 'top' },
});

// Custom Circular Target Icon for MISSING
const TargetIcon = ({ color }) => (
  <View style={[ti.outer, { borderColor: color }]}>
    <View style={[ti.inner, { backgroundColor: color }]} />
  </View>
);
const ti = StyleSheet.create({
  outer: { width: moderateScale(18), height: moderateScale(18), borderRadius: moderateScale(9), borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  inner: { width: moderateScale(8), height: moderateScale(8), borderRadius: 4 }
});

const ClockIcon = () => (
  <Clock color="#000" size={18} strokeWidth={2} />
);


// Compute display info for a single regularisation request.
const buildRegInfo = (reg) => {
  const s = (reg.reg_status || reg.status || 'p').toLowerCase();
  let bg = '#FFF3E0', color = '#F97316', label = 'Pending';
  if (s === 'a' || s === 'approved') { bg = '#F0FDF4'; color = '#16A34A'; label = 'Approved'; }
  else if (s === 'r' || s === 'rejected') { bg = '#FEF2F2'; color = '#DC2626'; label = 'Rejected'; }
  else if (s === 'c' || s === 'cancelled' || s === 'canceled') { bg = '#FEF3C7'; color = '#EA580C'; label = 'Cancelled'; }

  const appliedRaw = reg.created_at || reg.applied_at || reg.application_date || reg.created_on || reg.log_date_time || '';
  let applied = '';
  if (appliedRaw) {
    const d = new Date(appliedRaw);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      applied = `${dd}-${mm}-${yy} ${hh}:${mi}`;
    } else {
      applied = String(appliedRaw);
    }
  }
  return { bg, color, label, applied };
};

const LogCard = ({ item, isRegularisedTab, regsForDate, onRegularise }) => {
  const punchInRaw = formatPunchTime(item.punch_in_time);
  const punchOutRaw = formatPunchTime(item.punch_out_time);

  const d = new Date(item.date || new Date().toISOString());
  const displayMonthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const hasPunchIn = !!item.punch_in_time;
  const hasPunchOut = !!item.punch_out_time;

  // ── REGULARISED TAB ── status-focused layout (no IN/OUT punch rows) ─────────
  if (isRegularisedTab) {
    return (
      <View style={lc.card}>
        <View style={lc.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={lc.dateTitle}>{displayMonthDay}</Text>
            <Text style={lc.shiftText}>{item.shift ? item.shift.replace(/_/g, ' ') : 'General Shift (9:30 AM - 6:30 PM)'}</Text>
          </View>
          <View style={lc.badgeWo}>
            <Text style={lc.badgeWoText}>{item.status || 'WO'}</Text>
          </View>
        </View>

        {(regsForDate || []).map((reg, idx) => {
          const { bg, color, label, applied } = buildRegInfo(reg);
          const dir = (reg.direction || reg.type || '').toUpperCase();
          const reqTime = formatPunchTime(reg.log_time || reg.requested_time || reg.time);

          return (
            <View key={idx} style={[lc.regStatusCard, { backgroundColor: bg, borderColor: color + '30' }]}>
              <View style={lc.regStatusHeader}>
                <View style={lc.regDirChip}>
                  <Text style={lc.regDirChipText}>{dir === 'OUT' ? 'CLOCK OUT' : 'CLOCK IN'}</Text>
                </View>
                <View style={[lc.regStatusBadge, { backgroundColor: color }]}>
                  <Text style={lc.regStatusBadgeText} numberOfLines={1}>{label.toUpperCase()}</Text>
                </View>
              </View>

              <View style={lc.regRow}>
                <Text style={lc.regRowLabel}>Requested Time</Text>
                <Text style={lc.regRowVal}>{reqTime || '—'}</Text>
              </View>
              {!!reg.reason && (
                <View style={lc.regRow}>
                  <Text style={lc.regRowLabel}>Reason</Text>
                  <Text style={lc.regRowVal} numberOfLines={2}>{reg.reason}</Text>
                </View>
              )}
              {!!reg.remarks && (
                <View style={lc.regRow}>
                  <Text style={lc.regRowLabel}>Remarks</Text>
                  <Text style={lc.regRowVal} numberOfLines={3}>{reg.remarks}</Text>
                </View>
              )}
              {!!applied && (
                <View style={lc.regRow}>
                  <Text style={lc.regRowLabel}>Applied On</Text>
                  <Text style={lc.regRowVal}>{applied}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  // Find a regularisation request for a given direction (IN/OUT) in this date.
  const regFor = (dir) =>
    (regsForDate || []).find((r) => {
      const d = String(r.direction || r.type || '').toUpperCase();
      return d === dir;
    });

  // Renders either a per-row status pill (if a reg request exists) or the
  // REGULARISE button (if not). Keeps the same screen position so the row
  // layout never shifts. `variant` controls button styling (primary for
  // missing punches, secondary for present punches).
  const renderRowAction = (dir, variant = 'primary') => {
    const reg = regFor(dir);
    if (reg) {
      const { bg, color, label } = buildRegInfo(reg);
      return (
        <View style={[lc.statusPill, { backgroundColor: bg, borderColor: color + '40' }]}>
          <View style={[lc.statusDot, { backgroundColor: color }]} />
          <Text style={[lc.statusPillText, { color }]} numberOfLines={1}>{label}</Text>
        </View>
      );
    }
    if (variant === 'secondary') {
      return (
        <TouchableOpacity style={lc.regBtnActionSecondary} onPress={() => onRegularise(item, dir)}>
          <Text style={lc.regBtnActionTextSecondary}>REGULARISE</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={lc.regBtnAction} onPress={() => onRegularise(item, dir)}>
        <Text style={lc.regBtnActionText}>REGULARISE</Text>
      </TouchableOpacity>
    );
  };

  // ── LOG TAB ── full IN/OUT punch layout with per-row REGULARISE / status ────
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
            {hasPunchIn ? <CheckCircle color="#16A34A" size={moderateScale(18)} /> : <Clock color="#DC2626" size={moderateScale(18)} strokeWidth={2.5} />}
          </View>
          <View style={lc.timeCol}>
            {hasPunchIn ? (
              <>
                <Text style={lc.timeVal}>{punchInRaw}</Text>
                <Text style={lc.locText}>Location: {item.location || 'Not Available'}</Text>
                {renderRowAction('IN', 'secondary')}
              </>
            ) : (
              <>
                <Text style={lc.missingHdr}>Clock In</Text>
                <Text style={lc.missingVal}>MISSING</Text>
                {renderRowAction('IN')}
              </>
            )}
          </View>
          <View style={lc.chipCol}>
            <View style={lc.chipBg}><Text style={lc.chipText}>Clock IN</Text></View>
          </View>
        </View>

        {/* OUT */}
        <View style={[lc.punchRowBox, { marginTop: moderateScale(32) }]}>
          <View style={[lc.iconCol, { backgroundColor: '#FFF' }]}>
            {hasPunchOut ? <CheckCircle color="#16A34A" size={moderateScale(18)} /> : <Clock color="#DC2626" size={moderateScale(18)} strokeWidth={2.5} />}
          </View>
          <View style={lc.timeCol}>
            {hasPunchOut ? (
              <>
                <Text style={lc.timeVal}>{punchOutRaw}</Text>
                <Text style={lc.locText}>Location: {item.location || 'Not Available'}</Text>
                {renderRowAction('OUT', 'secondary')}
              </>
            ) : (
              <>
                <Text style={lc.missingHdr}>Clock Out</Text>
                <Text style={lc.missingVal}>MISSING</Text>
                {renderRowAction('OUT')}
              </>
            )}
          </View>
          <View style={lc.chipCol}>
            <View style={lc.chipBg}><Text style={lc.chipText}>Clock Out</Text></View>
          </View>
        </View>
      </View>
    </View>
  );
};

const lc = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), marginBottom: moderateScale(16), elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: moderateScale(16) },
  dateTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: 2 },
  shiftText: { fontSize: moderateScale(12), fontWeight: '600', color: '#6B7280' },
  badgeWo: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', borderWidth: 1, paddingHorizontal: moderateScale(8), paddingVertical: 4, borderRadius: moderateScale(6) },
  badgeWoText: { fontSize: moderateScale(10), fontWeight: '800', color: '#9CA3AF' },
  
  punchContainer: { position: 'relative', paddingLeft: moderateScale(8), marginTop: moderateScale(10) },
  trackLine: { position: 'absolute', left: 16.5, top: 20, bottom: 20, width: 2, backgroundColor: '#E5E7EB', borderStyle: 'dotted', zIndex: 0 },
  
  punchRowBox: { flexDirection: 'row', alignItems: 'flex-start', zIndex: 1 },
  iconCol: { width: moderateScale(20), alignItems: 'center', backgroundColor: '#FFF', marginTop: 0 },
  timeCol: { flex: 1, paddingLeft: moderateScale(16), paddingTop: 1 },
  timeVal: { fontSize: moderateScale(14), fontWeight: '800', color: '#111827' },
  locText: { fontSize: moderateScale(10), color: '#6B7280', marginTop: 4, lineHeight: 14, paddingRight: moderateScale(10) },
  
  missingHdr: { fontSize: moderateScale(12), color: '#4B5563', fontWeight: '500' },
  missingVal: { fontSize: moderateScale(13), fontWeight: '900', color: '#DC2626', marginTop: 2 },
  regBtnAction: { backgroundColor: '#DC2626', alignSelf: 'flex-start', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8), borderRadius: moderateScale(20), marginTop: moderateScale(10) },
  regBtnActionText: { color: '#FFF', fontSize: moderateScale(11), fontWeight: '800', letterSpacing: 0.5 },
  regBtnActionSecondary: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8), borderRadius: moderateScale(20), marginTop: moderateScale(10), borderWidth: 1, borderColor: '#E5E7EB' },
  regBtnActionTextSecondary: { color: '#4B5563', fontSize: moderateScale(11), fontWeight: '800', letterSpacing: 0.5 },

  // Per-row status pill — sits in the same position as REGULARISE button when
  // a regularisation request already exists for that direction.
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    marginTop: moderateScale(10),
  },
  statusDot: { width: moderateScale(8), height: moderateScale(8), borderRadius: moderateScale(4), marginRight: moderateScale(6) },
  statusPillText: { fontSize: moderateScale(11), fontWeight: '800', letterSpacing: 0.4 },

  chipCol: { marginLeft: moderateScale(10) },
  chipBg: { backgroundColor: '#EEF2FF', paddingHorizontal: moderateScale(10), paddingVertical: 5, borderRadius: moderateScale(6) },
  chipText: { fontSize: moderateScale(11), fontWeight: '700', color: '#4F46E5' },

  regBox: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(24), padding: moderateScale(14), borderRadius: moderateScale(12) },
  regTitle: { fontSize: moderateScale(13), fontWeight: '800', color: '#111827' },
  regMsg: { fontSize: moderateScale(11), color: '#6B7280', marginTop: 4, fontWeight: '500', lineHeight: 16 },
  regApplied: { fontSize: moderateScale(10), color: '#9CA3AF', marginTop: 4, fontWeight: '600' },
  regBadge: { paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(6), borderRadius: moderateScale(6), marginLeft: moderateScale(10) },
  regBadgeText: { fontSize: moderateScale(11), fontWeight: '800' },

  // Regularised tab — status-focused card body
  regStatusCard: {
    marginTop: moderateScale(12),
    padding: moderateScale(14),
    borderRadius: moderateScale(14),
    borderWidth: 1,
  },
  regStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: moderateScale(10),
  },
  regDirChip: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(6),
  },
  regDirChipText: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  regStatusBadge: {
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(6),
  },
  regStatusBadgeText: {
    fontSize: moderateScale(10),
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  regRow: {
    flexDirection: 'row',
    paddingVertical: moderateScale(6),
  },
  regRowLabel: {
    width: moderateScale(110),
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#6B7280',
  },
  regRowVal: {
    flex: 1,
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: '#111827',
  },
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
              <View style={[tp.handContainer, { transform: [{ rotate: `${handAngle}deg` }] }]}>
                <View style={tp.hand} />
              </View>

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
  box: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(24), width: moderateScale(320), ...SHADOWS.medium },
  title: { fontSize: moderateScale(12), fontWeight: '700', color: '#6B7280', letterSpacing: 1, marginBottom: moderateScale(20) },
  displayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: moderateScale(30) },
  timeBox: { backgroundColor: '#F3F4F6', paddingVertical: moderateScale(12), paddingHorizontal: moderateScale(20), borderRadius: moderateScale(12) },
  timeBoxInactive: { backgroundColor: 'transparent' },
  timeNumber: { fontSize: moderateScale(36), fontWeight: '400', color: '#111827' },
  timeNumberInactive: { color: '#6B7280' },
  colon: { fontSize: moderateScale(36), marginHorizontal: moderateScale(8), color: '#111827' },
  ampmBox: { marginLeft: 'auto', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: moderateScale(8), overflow: 'hidden', flexDirection: 'column' },
  ampmActive: { backgroundColor: '#F3F4F6', paddingVertical: moderateScale(10), paddingHorizontal: moderateScale(12) },
  ampmInactive: { backgroundColor: '#FFF', paddingVertical: moderateScale(10), paddingHorizontal: moderateScale(12) },
  ampmTextActive: { fontSize: moderateScale(13), fontWeight: '700', color: '#111827' },
  ampmTextInactive: { fontSize: moderateScale(13), fontWeight: '600', color: '#9CA3AF' },

  clockWrap: { alignItems: 'center', marginBottom: moderateScale(20) },
  clockFace: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#F9FAFB', position: 'relative' },
  centerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6B7280', position: 'absolute', top: 96, left: 96, zIndex: 10 },
  handContainer: { position: 'absolute', width: 2, height: 200, left: 99, top: 0, alignItems: 'center' },
  hand: { width: 2, height: 75, backgroundColor: '#4B5563', marginTop: 25, borderRadius: 1 },
  numNode: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', position: 'absolute' },
  numNodeActive: { backgroundColor: '#4B5563' },
  numText: { fontSize: moderateScale(14), color: '#111827' },
  numTextActive: { color: '#FFF' },

  actions: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(10), justifyContent: 'flex-end', gap: moderateScale(8) },
  btn: { paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(10) },
  btnText: { fontSize: moderateScale(14), fontWeight: '600', color: '#4B5563' },
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
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), paddingBottom: Platform.OS === 'ios' ? 36 : 24, maxHeight: 400 },
  handle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: moderateScale(15), color: '#4B5563' },
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
  const [refreshing, setRefreshing] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

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

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

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
    if (!reason) { showAlert('warning', 'Reason Required', 'Please select a reason to continue.'); return; }
    if (!logTime) { showAlert('warning', 'Time Required', 'Please enter the time.'); return; }
    if (!remarks.trim()) { showAlert('warning', 'Remarks Required', 'Please enter remarks.'); return; }
    setProcessing(true);
    try {
      const payload = {
        user_id: user.user_id,
        direction,
        dates: selectedDay.date,
        log_time: logTime,
        remarks: remarks,
      };
      const res = await axios.post(API_ENDPOINTS.REGULARISE, payload, { timeout: 10000 });
      if (res.data?.success === 1 || res.data?.success === true) {
        setView('SUCCESS');
        setTab('REGULARISED');
        fetchData();
      } else {
        showAlert('error', 'Cannot Submit', res.data?.message || 'Request failed.');
      }
    } catch (e) {
      showAlert('error', 'Error', e?.response?.data?.message || e.message || 'Submission failed');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Views ────────────────────────────────────────────────────────
  if (view === 'FORM') {
    const isSubmitActive = !!reason && !!logTime && !!remarks.trim();
    
    return (
      <SafeAreaView style={s.container}>
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => setView('MAIN')} style={s.backBtn}>
            <ChevronLeft color="#333" size={28} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Regularise Attendance</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
            <View style={s.formWrap}>
              <FloatingInput
                label="Reason *"
                value={reason}
                editable={false}
                onPress={() => setShowReasonPicker(true)}
                icon={<ChevronDown color="#9CA3AF" size={18} />}
              />

              <FloatingInput
                label="Enter Time *"
                value={logTime}
                onPress={() => setShowTimePicker(true)}
                editable={false}
                icon={<ClockIcon />}
              />

              <FloatingInput
                label="Remarks *"
                value={remarks}
                onChangeText={setRemarks}
                multiline
                active={true}
                maxLength={50}
              />

              <TouchableOpacity
                style={[s.submitBtn, isSubmitActive && s.submitBtnActive]}
                onPress={handleSubmit}
                disabled={processing}
              >
                {processing ? <ActivityIndicator color="#FFF" /> : <Text style={[s.submitText, isSubmitActive && s.submitTextActive]}>SUBMIT REQUEST</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

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
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
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
        <ScrollView contentContainerStyle={s.listScroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}>
          {tab === 'LOG' && attLogs.map((item, i) => (
            <LogCard key={item.date || i} item={item} isRegularisedTab={false} regsForDate={regMap[item.date] || []} onRegularise={openRegForm} />
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
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: moderateScale(60), paddingHorizontal: moderateScale(8), backgroundColor: '#FFF' },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(16), fontWeight: '600', color: '#111827' },

  tabBox: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: moderateScale(20), backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tabsWrap: { flexDirection: 'row' },
  tabItem: { paddingVertical: moderateScale(14), marginRight: moderateScale(24), position: 'relative' },
  tabLabel: { fontSize: moderateScale(14), fontWeight: '500', color: '#9CA3AF' },
  tabLabelActive: { color: '#E91E63', fontWeight: '700' },
  tabLine: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 3, backgroundColor: '#E91E63', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  monthDropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(8), borderRadius: moderateScale(12), marginBottom: moderateScale(10), alignSelf: 'center' },
  monthText: { fontSize: moderateScale(13), fontWeight: '700', color: '#111827' },

  listScroll: { padding: moderateScale(16), paddingBottom: moderateScale(120) },

  formScroll: { padding: moderateScale(20), paddingBottom: moderateScale(120) },
  formWrap: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(24), paddingBottom: moderateScale(40), ...SHADOWS.light, minHeight: Dimensions.get('window').height * 0.7 },
  submitBtn: { backgroundColor: '#F3F4F6', paddingVertical: moderateScale(16), borderRadius: moderateScale(50), alignItems: 'center', marginTop: 'auto' },
  submitBtnActive: { backgroundColor: '#E91E63' },
  submitText: { color: '#9CA3AF', fontSize: moderateScale(14), fontWeight: '700', letterSpacing: 0.5 },
  submitTextActive: { color: '#FFF' },

  successBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(30), backgroundColor: '#FFF' },
  successAura: { width: moderateScale(180), height: moderateScale(180), borderRadius: moderateScale(90), backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(24) },
  successCircleInner: { width: moderateScale(90), height: moderateScale(90), borderRadius: moderateScale(45), borderWidth: 6, borderColor: '#10B981', backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: moderateScale(20), fontWeight: '800', color: '#111827', marginBottom: moderateScale(12) },
  successDesc: { fontSize: moderateScale(13), color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: moderateScale(40), paddingHorizontal: moderateScale(10) },
  homeBtn: { width: '100%', paddingVertical: moderateScale(16), borderRadius: moderateScale(50), borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#FFF' },
  homeBtnText: { fontSize: moderateScale(15), fontWeight: '700', color: '#111827' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), maxHeight: Dimensions.get('window').height * 0.5 },
  modalHandle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  modalTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: moderateScale(16), textAlign: 'center' },
  monthItem: { paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB', alignItems: 'center' },
  monthItemText: { fontSize: moderateScale(15), color: '#4B5563', fontWeight: '500' },
  monthItemTextActive: { color: '#E91E63', fontWeight: '800' },
});

export default AttendanceRegScreen;

