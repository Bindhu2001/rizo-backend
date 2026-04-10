import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Dimensions, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, Calendar as CalendarIcon, Clock, 
  MapPin, ChevronRight, Filter, ChevronDown
} from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const AttendanceScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100015' };
  const [loading, setLoading] = useState(true);
  const [currentMonthStr, setCurrentMonthStr] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [logs, setLogs] = useState([]);
  
  // ─── Fetch Logs ─────────────────────────────────────────────────────────────
  const fetchLogs = async (month) => {
    setLoading(true);
    try {
      const url = `https://v1.mypayrollmaster.online/api/v2qa/newapp/attendance_logs?user_id=${user.user_id}&month=${month}`;
      const res = await axios.post(url, {
        user_id: user.user_id,
        filter: 'past'
      });
      if (res.data?.success) {
        setLogs(res.data.data || []);
      }
    } catch (e) {
      console.log('Fetch error', e);
      Alert.alert('Error', 'Unable to fetch attendance logs');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLogs(currentMonthStr);
    }, [currentMonthStr])
  );

  const handleMonthChange = (direction) => {
    const [yr, mo] = currentMonthStr.split('-').map(Number);
    const date = new Date(yr, direction === 'prev' ? mo - 2 : mo, 1);
    
    // Don't allow future months
    if (direction === 'next' && date > new Date()) return;
    
    const newMonthStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    setCurrentMonthStr(newMonthStr);
  };

  const getStatusStyle = (status) => {
    if (status === 'P/P' || status?.includes('P')) return { bg: '#E8F5E9', text: '#2ECC71' };
    if (status === 'A/A' || status?.includes('A')) return { bg: '#FFEBEE', text: '#EF4444' };
    return { bg: '#FFF3E0', text: '#F39C12' };
  };

  const formatDisplayDate = (dateStr) => {
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const weekday = d.toLocaleString('en-US', { weekday: 'short' });
    return { day, month, weekday };
  };

  // ─── Render Item ────────────────────────────────────────────────────────────
  const renderLogItem = ({ item }) => {
    const { day, month, weekday } = formatDisplayDate(item.date);
    const ss = getStatusStyle(item.status);

    return (
      <View style={s.card}>
        <View style={s.dateCol}>
          <Text style={s.dayNum}>{day}</Text>
          <Text style={s.dayMeta}>{month}, {weekday}</Text>
        </View>
        
        <View style={s.contentCol}>
          <View style={s.topRow}>
            <Text style={s.shiftText} numberOfLines={1}>{item.shift}</Text>
            <View style={[s.statusBadge, { backgroundColor: ss.bg }]}>
              <Text style={[s.statusText, { color: ss.text }]}>{item.status}</Text>
            </View>
          </View>
          
          <View style={s.timesRow}>
            <View style={s.timeBox}>
              <Clock color="#9CA3AF" size={12} />
              <Text style={s.timeVal}>{item.punch_in_time ? item.punch_in_time.split(' ')[1]?.slice(0, 5) : '---'}</Text>
              <Text style={s.timeLabel}>In</Text>
            </View>
            <View style={s.timeBox}>
              <Clock color="#9CA3AF" size={12} />
              <Text style={s.timeVal}>{item.punch_out_time ? item.punch_out_time.split(' ')[1]?.slice(0, 5) : '---'}</Text>
              <Text style={s.timeLabel}>Out</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Attendance History</Text>
        <TouchableOpacity style={s.backBtn}>
           <Filter color={COLORS.text} size={22} />
        </TouchableOpacity>
      </View>

      {/* ── Month Selector ── */}
      <View style={s.monthSelector}>
        <TouchableOpacity onPress={() => handleMonthChange('prev')} style={s.arrowBtn}>
           <ChevronLeft color={COLORS.primaryDeep} size={24} />
        </TouchableOpacity>
        
        <View style={s.monthDisplay}>
          <CalendarIcon color={COLORS.primaryDeep} size={18} />
          <Text style={s.monthTitle}>
            {new Date(currentMonthStr + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <ChevronDown color={COLORS.primaryDeep} size={14} />
        </View>

        <TouchableOpacity onPress={() => handleMonthChange('next')} style={s.arrowBtn}>
           <ChevronRight color={COLORS.primaryDeep} size={24} />
        </TouchableOpacity>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primaryDeep} />
          <Text style={s.loadingText}>Fetching logs...</Text>
        </View>
      ) : logs.length === 0 ? (
        <View style={s.center}>
          <Clock color="#D1D5DB" size={60} />
          <Text style={s.emptyTitle}>No Records Found</Text>
          <Text style={s.emptySub}>We couldn't find any attendance logs for this month.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.date}
          renderItem={renderLogItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, height: 60, backgroundColor: '#FFF', ...SHADOWS.light
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },

  monthSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
  },
  arrowBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  monthDisplay: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3FF',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20
  },
  monthTitle: { fontSize: 15, fontWeight: '800', color: COLORS.primaryDeep, marginHorizontal: 10 },

  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16,
    marginBottom: 12, padding: 16, ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6'
  },
  dateCol: {
    width: 60, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: '#F3F4F6', marginRight: 16
  },
  dayNum: { fontSize: 24, fontWeight: '900', color: COLORS.text },
  dayMeta: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', marginTop: 2 },
  
  contentCol: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  shiftText: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '900' },
  
  timesRow: { flexDirection: 'row', alignItems: 'center' },
  timeBox: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
  timeVal: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginLeft: 6 },
  timeLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', marginLeft: 4, textTransform: 'uppercase' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadingText: { marginTop: 16, fontSize: 14, color: COLORS.textLight, fontWeight: '600' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 20 },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});

export default AttendanceScreen;
