import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, FlatList, StatusBar, Modal, Pressable, Image, RefreshControl
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar as CalendarIcon, Clock, Filter, Cloud, CloudOff, ChevronLeft, ChevronDown, ChevronUp
} from 'lucide-react-native';
import { COLORS, SHADOWS, moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { initDB } from '../services/LocalDB';
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

const AttendanceScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route?.params?.user;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonthStr, setCurrentMonthStr] = useState(new Date().toISOString().slice(0, 7));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [logs, setLogs] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [devicePunches, setDevicePunches] = useState({});
  const [fetchingDevicePunches, setFetchingDevicePunches] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  if (!user) return null;

  // Generate last 12 months for picker
  const pastMonths = [];
  const currentDate = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    pastMonths.push({
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      value: `${yr}-${mo}`
    });
  }

  const fetchData = async (month) => {
    setLoading(true);
    try {
      const attRes = await axios.post(API_ENDPOINTS.ATTENDANCE_PUNCHES, {
        user_id: user.user_id, month
      }, { timeout: 10000 });
      const resData = attRes.data;
      let parsed = [];
      if (resData && resData.success === 1 && Array.isArray(resData.data)) {
        parsed = resData.data;
      } else if (resData && Array.isArray(resData.data)) {
        parsed = resData.data;
      } else if (Array.isArray(resData)) {
        parsed = resData;
      } else if (resData && resData.data && typeof resData.data === 'object') {
        // Sometimes data is a keyed object — convert to array
        parsed = Object.values(resData.data);
      }
      console.log('[AttendanceScreen] Fetched', parsed.length, 'records for', month);
      setLogs(parsed);
    } catch (e) {
      console.log('Fetch error', e?.response?.data || e.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDevicePunches = async (date) => {
    setFetchingDevicePunches(true);
    try {
      const res = await axios.post(API_ENDPOINTS.DEVICE_ATTENDANCE, {
        user_id: user.user_id, date
      }, { timeout: 10000 });
      if (res.data && res.data.success === 1) {
        const punches = Array.isArray(res.data.data) ? res.data.data :
          (res.data.data ? Object.values(res.data.data) : []);
        console.log('[AttendanceScreen] Device punches for', date, ':', punches.length);
        setDevicePunches(prev => ({ ...prev, [date]: punches }));
      } else {
        setDevicePunches(prev => ({ ...prev, [date]: [] }));
      }
    } catch (e) {
      console.log('Device punch fetch error', e?.response?.data || e.message);
      setDevicePunches(prev => ({ ...prev, [date]: [] }));
    } finally {
      setFetchingDevicePunches(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData(currentMonthStr);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData(currentMonthStr);
    }, [currentMonthStr])
  );

  const getMonthDisplayText = () => {
    const d = new Date(currentMonthStr + '-01');
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  const renderLogItem = ({ item }) => {
    const d = new Date(item.date);
    const dateNum = d.getDate().toString().padStart(2, '0');
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', weekday: 'short' }).toUpperCase();

    // Status Badge Logic - Prioritize API status
    const rawStatus = item.status || (item.punch_in_time && item.punch_out_time ? 'P/P' : 'A/A');
    const statusLabel = rawStatus.toUpperCase();
    
    let statusColor = '#E91E63'; // Default Absent Red
    let statusBg = '#FCE4EC';
    
    if (statusLabel === 'P/P' || statusLabel === 'P' || statusLabel === 'PRESENT') {
      statusColor = '#2ECC71';
      statusBg = '#E8F5E9';
    } else if (statusLabel === 'WO' || statusLabel === 'OFF' || statusLabel === 'W/O') {
      statusColor = '#9CA3AF';
      statusBg = '#F3F4F6';
    } else if (statusLabel === 'H' || statusLabel === 'HOLIDAY') {
      statusColor = '#3498DB';
      statusBg = '#EBF8FF';
    }

    const punchIn = formatPunchTime(item.punch_in_time);
    const punchOut = formatPunchTime(item.punch_out_time);

    const isExpanded = expandedDate === item.date;

    const handleExpandToggle = () => {
      const nextDate = isExpanded ? null : item.date;
      setExpandedDate(nextDate);
      if (nextDate) fetchDevicePunches(nextDate); 
    };

    // Show only API device punches in details
    const currentDevicePunches = devicePunches[item.date] || [];
    const hasDevicePunches = currentDevicePunches.length > 0;

    return (
      <View style={s.cardWrapper}>
        <TouchableOpacity
          style={[s.card, { backgroundColor: theme.card }, isExpanded && s.cardExpanded]}
          activeOpacity={0.9}
          onPress={handleExpandToggle}
        >
          <View style={[s.dateBox, { borderRightColor: theme.divider }]}>
            <Text style={[s.dateNum, { color: theme.text }]}>{dateNum}</Text>
            <Text style={[s.monthDayText, { color: theme.textMuted }]}>{monthDay}</Text>
          </View>

          <View style={s.infoCol}>
            <View style={s.punchItem}>
              <Clock size={moderateScale(13)} color={theme.textMuted} />
              <Text style={[s.timeValue, { color: theme.text }]} numberOfLines={1}>{punchIn} <Text style={[s.timeType, { color: theme.textMuted }]}>IN</Text></Text>
            </View>
            <View style={[s.punchItem, { marginTop: moderateScale(4) }]}>
              <Clock size={moderateScale(13)} color={theme.textMuted} />
              <Text style={[s.timeValue, { color: theme.text }]} numberOfLines={1}>{punchOut} <Text style={[s.timeType, { color: theme.textMuted }]}>OUT</Text></Text>
            </View>
          </View>

          <View style={s.statusGroup}>
            <View style={[s.badge, { backgroundColor: statusBg }]}>
              <Text style={[s.badgeText, { color: statusColor }]} numberOfLines={1}>{statusLabel}</Text>
            </View>
            {!!item.duration && item.duration !== "0" && (
              <Text style={[s.durationText, { color: theme.textLight }]} numberOfLines={1}>{item.duration} mins</Text>
            )}
            {isExpanded ? (
              <ChevronUp color={theme.textMuted} size={moderateScale(16)} />
            ) : (
              <ChevronDown color={theme.textMuted} size={moderateScale(16)} />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[s.detailSection, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
            <Text style={[s.detailTitle, { color: theme.text }]}>Detailed Punch History</Text>
            {fetchingDevicePunches && !hasDevicePunches ? (
              <ActivityIndicator size="small" color="#6C5CE7" style={{ marginVertical: 10 }} />
            ) : (
              <>
                {hasDevicePunches ? (
                  currentDevicePunches.map((p, idx) => (
                    <View key={idx} style={[s.punchDetailRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[s.punchTimeBox, { borderRightColor: theme.divider }]}>
                        <Text style={[s.punchTimeVal, { color: theme.text }]}>{formatPunchTime(p.LOGDATE)}</Text>
                        <View style={[s.pBadge, { backgroundColor: p.C1?.toUpperCase() === 'IN' ? '#E8F5E9' : '#FCE4EC' }]}>
                          <Text style={[s.pBadgeText, { color: p.C1?.toUpperCase() === 'IN' ? '#1B5E20' : '#C2185B' }]}>{p.C1?.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={s.punchAddressBox}>
                        <Text style={s.shiftBadgeText} numberOfLines={1}>{p.day_time_desc}</Text>
                        <Text style={[s.addressText, { color: theme.textLight }]}>{p.C3 || 'Location Attached'}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[s.noDetailText, { color: theme.textMuted }]}>No individual punch records found for this date.</Text>
                )}
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar barStyle={theme.statusBarStyle} />

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Attendance History</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ── Month Selector ── */}
      <View style={[s.monthBar, { backgroundColor: theme.bg }]}>
        <TouchableOpacity
          style={s.monthDropdown}
          activeOpacity={0.7}
          onPress={() => setShowMonthPicker(true)}
        >
          <CalendarIcon color="#6C5CE7" size={20} style={{ marginRight: 10 }} />
          <Text style={s.monthText}>{getMonthDisplayText()}</Text>
          <ChevronDown color="#6C5CE7" size={18} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>

      {/* ── List ── */}
      <View style={[s.listContainer, { backgroundColor: theme.bg }]}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#6C5CE7" />
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item, index) => item.date + index}
            renderItem={renderLogItem}
            contentContainerStyle={s.listContents}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <View style={s.center}>
                <View style={[s.emptyCircle, { backgroundColor: theme.card }]}>
                  <Clock color={theme.textMuted} size={40} />
                </View>
                <Text style={[s.emptyTitle, { color: theme.text }]}>No History Found</Text>
              </View>
            }
          />
        )}
      </View>

      {/* ── Month Picker Modal ── */}
      <Modal visible={showMonthPicker} transparent animationType="slide" onRequestClose={() => setShowMonthPicker(false)} statusBarTranslucent>
        <Pressable style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]} onPress={() => setShowMonthPicker(false)}>
          <View style={[s.modalSheet, { backgroundColor: theme.card }]}>
            <View style={[s.modalHandle, { backgroundColor: theme.border }]} />
            <Text style={[s.modalTitle, { color: theme.text }]}>Select Month</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pastMonths.map((m) => {
                const isActive = m.value === currentMonthStr;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[s.monthItem, { borderBottomColor: theme.divider }]}
                    onPress={() => {
                      setCurrentMonthStr(m.value);
                      setShowMonthPicker(false);
                    }}
                  >
                    <Text style={[s.monthItemText, { color: theme.textLight }, isActive && s.monthItemTextActive]}>{m.label}</Text>
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
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16), height: moderateScale(60), backgroundColor: '#FFF'
  },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center' },
  headerTitle: { fontSize: moderateScale(20), fontWeight: '800', color: COLORS.text },

  monthBar: { paddingVertical: moderateScale(15), alignItems: 'center', backgroundColor: '#FFF' },
  monthDropdown: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F0FF',
    paddingHorizontal: moderateScale(20), paddingVertical: moderateScale(10), borderRadius: moderateScale(25)
  },
  monthText: { fontSize: moderateScale(16), fontWeight: '700', color: '#6C5CE7' },

  listContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  listContents: { padding: moderateScale(16), paddingBottom: moderateScale(110) },

  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(20),
    padding: moderateScale(14), marginBottom: moderateScale(16), alignItems: 'center', ...SHADOWS.light
  },
  dateBox: {
    alignItems: 'center', paddingRight: moderateScale(12), borderRightWidth: 1,
    borderRightColor: '#F3F4F6', width: moderateScale(62)
  },
  dateNum: { fontSize: moderateScale(26), fontWeight: '900', color: '#111827' },
  monthDayText: { fontSize: moderateScale(10), fontWeight: '800', color: '#9CA3AF', marginTop: -2 },

  infoCol: { flex: 1, paddingLeft: moderateScale(12), paddingRight: moderateScale(8) },
  shiftTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827', marginBottom: moderateScale(8) },
  punchItem: { flexDirection: 'row', alignItems: 'center' },
  timeValue: { fontSize: moderateScale(13), fontWeight: '900', color: '#111827', marginLeft: moderateScale(6), flexShrink: 1 },
  timeType: { fontSize: moderateScale(10), fontWeight: '700', color: '#9CA3AF' },

  badge: { paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(4), borderRadius: moderateScale(8), minWidth: moderateScale(42), alignItems: 'center' },
  badgeText: { fontSize: moderateScale(11), fontWeight: '900' },

  cardWrapper: { marginBottom: moderateScale(16) },
  cardExpanded: { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  statusGroup: { alignItems: 'center', justifyContent: 'center', width: moderateScale(70) },
  durationText: { fontSize: moderateScale(10), fontWeight: '800', color: '#6B7280', marginTop: moderateScale(4), marginBottom: moderateScale(2) },

  detailSection: {
    backgroundColor: '#F9FAFB',
    borderBottomLeftRadius: moderateScale(20),
    borderBottomRightRadius: moderateScale(20),
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#F3F4F6',
    padding: moderateScale(16),
    paddingTop: moderateScale(8),
    ...SHADOWS.light
  },
  detailTitle: { fontSize: moderateScale(13), fontWeight: '800', color: COLORS.text, marginBottom: moderateScale(12), textTransform: 'uppercase', letterSpacing: 0.5 },
  punchDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: moderateScale(10),
    borderRadius: moderateScale(12),
    marginBottom: moderateScale(8),
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  punchTimeBox: { width: moderateScale(85), borderRightWidth: 1, borderRightColor: '#F3F4F6', paddingRight: moderateScale(8) },
  punchTimeVal: { fontSize: moderateScale(13), fontWeight: '800', color: '#111827' },
  pBadge: { paddingHorizontal: moderateScale(6), paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
  pBadgeText: { fontSize: moderateScale(10), fontWeight: '900' },

  punchAddressBox: { flex: 1, paddingHorizontal: moderateScale(12) },
  shiftBadgeText: { fontSize: moderateScale(10), fontWeight: '800', color: '#6C5CE7', marginBottom: 2, textTransform: 'uppercase' },
  addressText: { fontSize: moderateScale(11), color: '#6B7280', fontWeight: '600' },
  syncBox: { width: moderateScale(24), alignItems: 'center' },
  noDetailText: { fontSize: moderateScale(12), color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', paddingVertical: moderateScale(10) },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(40) },
  emptyCircle: { width: moderateScale(80), height: moderateScale(80), borderRadius: moderateScale(40), backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(20), ...SHADOWS.light },
  emptyTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), maxHeight: Dimensions.get('window').height * 0.5 },
  modalHandle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  modalTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: moderateScale(16), textAlign: 'center' },
  monthItem: { paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB', alignItems: 'center' },
  monthItemText: { fontSize: moderateScale(15), color: '#4B5563', fontWeight: '500' },
  monthItemTextActive: { color: '#6C5CE7', fontWeight: '800' },
});

export default AttendanceScreen;

