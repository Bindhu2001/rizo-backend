import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Dimensions, FlatList, StatusBar, Modal, Pressable, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar as CalendarIcon, Clock, Filter, Cloud, CloudOff, ChevronLeft, ChevronDown, ChevronUp
} from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';
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
  const user = route?.params?.user;

  const [loading, setLoading] = useState(true);
  const [currentMonthStr, setCurrentMonthStr] = useState(new Date().toISOString().slice(0, 7));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [logs, setLogs] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [devicePunches, setDevicePunches] = useState({});
  const [fetchingDevicePunches, setFetchingDevicePunches] = useState(false);

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
      const attRes = await axios.get(`${API_ENDPOINTS.ATTENDANCE_PUNCHES}?user_id=${user.user_id}&month=${month}`, { timeout: 10000 });
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
      const res = await axios.get(`${API_ENDPOINTS.DEVICE_ATTENDANCE}?user_id=${user.user_id}&date=${date}`, { timeout: 10000 });
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
          style={[s.card, isExpanded && s.cardExpanded]}
          activeOpacity={0.9}
          onPress={handleExpandToggle}
        >
          <View style={s.dateBox}>
            <Text style={s.dateNum}>{dateNum}</Text>
            <Text style={s.monthDayText}>{monthDay}</Text>
          </View>

          <View style={s.infoCol}>
            <View style={s.punchRow}>
              <View style={s.punchItem}>
                <Clock size={14} color="#9CA3AF" />
                <Text style={s.timeValue}>{punchIn} <Text style={s.timeType}>IN</Text></Text>
              </View>
              <View style={[s.punchItem, { marginLeft: 16 }]}>
                <Clock size={14} color="#9CA3AF" />
                <Text style={s.timeValue}>{punchOut} <Text style={s.timeType}>OUT</Text></Text>
              </View>
            </View>
          </View>

          <View style={s.statusGroup}>
            <View style={[s.badge, { backgroundColor: statusBg }]}>
              <Text style={[s.badgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            {!!item.duration && item.duration !== "0" && (
              <Text style={s.durationText}>{item.duration} mins</Text>
            )}
            {isExpanded ? (
              <ChevronUp color="#9CA3AF" size={16} />
            ) : (
              <ChevronDown color="#9CA3AF" size={16} />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={s.detailSection}>
            <Text style={s.detailTitle}>Detailed Punch History</Text>
            {fetchingDevicePunches && !hasDevicePunches ? (
              <ActivityIndicator size="small" color="#6C5CE7" style={{ marginVertical: 10 }} />
            ) : (
              <>
                {hasDevicePunches ? (
                  currentDevicePunches.map((p, idx) => (
                    <View key={idx} style={s.punchDetailRow}>
                      <View style={s.punchTimeBox}>
                        <Text style={s.punchTimeVal}>{formatPunchTime(p.LOGDATE)}</Text>
                        <View style={[s.pBadge, { backgroundColor: p.C1?.toUpperCase() === 'IN' ? '#E8F5E9' : '#FCE4EC' }]}>
                          <Text style={[s.pBadgeText, { color: p.C1?.toUpperCase() === 'IN' ? '#1B5E20' : '#C2185B' }]}>{p.C1?.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={s.punchAddressBox}>
                        <Text style={s.shiftBadgeText} numberOfLines={1}>{p.day_time_desc}</Text>
                        <Text style={s.addressText} numberOfLines={2}>{p.C3 || 'Location Attached'}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={s.noDetailText}>No individual punch records found for this date.</Text>
                )}
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Attendance History</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ── Month Selector ── */}
      <View style={s.monthBar}>
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
      <View style={s.listContainer}>
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
            ListEmptyComponent={
              <View style={s.center}>
                <View style={s.emptyCircle}>
                  <Clock color="#9CA3AF" size={40} />
                </View>
                <Text style={s.emptyTitle}>No History Found</Text>
              </View>
            }
          />
        )}
      </View>

      {/* ── Month Picker Modal ── */}
      <Modal visible={showMonthPicker} transparent animationType="slide" onRequestClose={() => setShowMonthPicker(false)} statusBarTranslucent>
        <Pressable style={s.modalOverlay} onPress={() => setShowMonthPicker(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Month</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {pastMonths.map((m) => {
                const isActive = m.value === currentMonthStr;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={s.monthItem}
                    onPress={() => {
                      setCurrentMonthStr(m.value);
                      setShowMonthPicker(false);
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
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 60, backgroundColor: '#FFF'
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },

  monthBar: { paddingVertical: 15, alignItems: 'center', backgroundColor: '#FFF' },
  monthDropdown: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F0FF',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25
  },
  monthText: { fontSize: 16, fontWeight: '700', color: '#6C5CE7' },

  listContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  listContents: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 20,
    padding: 16, marginBottom: 16, alignItems: 'center', ...SHADOWS.light
  },
  dateBox: {
    alignItems: 'center', paddingRight: 16, borderRightWidth: 1,
    borderRightColor: '#F3F4F6', width: 75
  },
  dateNum: { fontSize: 28, fontWeight: '900', color: '#111827' },
  monthDayText: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', marginTop: -2 },

  infoCol: { flex: 1, paddingLeft: 16 },
  shiftTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 8 },
  punchRow: { flexDirection: 'row', alignItems: 'center' },
  punchItem: { flexDirection: 'row', alignItems: 'center' },
  timeValue: { fontSize: 14, fontWeight: '900', color: '#111827', marginLeft: 6 },
  timeType: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, minWidth: 45, alignItems: 'center' },
  badgeText: { fontSize: 12, fontWeight: '900' },

  cardWrapper: { marginBottom: 16 },
  cardExpanded: { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  statusGroup: { alignItems: 'center', minWidth: 60 },
  durationText: { fontSize: 10, fontWeight: '800', color: '#6B7280', marginTop: 4, marginBottom: 2 },

  detailSection: {
    backgroundColor: '#F9FAFB',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#F3F4F6',
    padding: 16,
    paddingTop: 8,
    ...SHADOWS.light
  },
  detailTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  punchDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  punchTimeBox: { width: 85, borderRightWidth: 1, borderRightColor: '#F3F4F6', paddingRight: 8 },
  punchTimeVal: { fontSize: 13, fontWeight: '800', color: '#111827' },
  pBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
  pBadgeText: { fontSize: 10, fontWeight: '900' },

  punchAddressBox: { flex: 1, paddingHorizontal: 12 },
  shiftBadgeText: { fontSize: 10, fontWeight: '800', color: '#6C5CE7', marginBottom: 2, textTransform: 'uppercase' },
  addressText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  syncBox: { width: 24, alignItems: 'center' },
  noDetailText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginBottom: 20, ...SHADOWS.light },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: Dimensions.get('window').height * 0.5 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  monthItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', alignItems: 'center' },
  monthItemText: { fontSize: 15, color: '#4B5563', fontWeight: '500' },
  monthItemTextActive: { color: '#6C5CE7', fontWeight: '800' },
});

export default AttendanceScreen;
