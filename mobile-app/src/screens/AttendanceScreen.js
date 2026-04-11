import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Dimensions, FlatList, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, Calendar as CalendarIcon, Clock, 
  MapPin, ChevronRight, Filter, ChevronDown, CheckCircle2, AlertCircle
} from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const AttendanceScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100015' };
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Log'); // 'Log' or 'Regularised'
  const [currentMonthStr, setCurrentMonthStr] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [logs, setLogs] = useState([]);
  const [regLogs, setRegLogs] = useState([]);
  
  // ─── Fetch Data ─────────────────────────────────────────────────────────────
  const fetchData = async (month) => {
    setLoading(true);
    try {
      // 1. Fetch Attendance Logs
      const attUrl = `https://v1.mypayrollmaster.online/api/v2qa/newapp/attendance_logs?user_id=${user.user_id}&month=${month}`;
      const attRes = await axios.get(attUrl); 
      if (attRes.data?.success) {
        setLogs(attRes.data.data || []);
      }

      // 2. Fetch Regularisation Logs
      const regUrl = `https://v1.mypayrollmaster.online/api/v2qa/newapp/regularisation_logs?user_id=${user.user_id}&month=${month}`;
      const regRes = await axios.get(regUrl);
      if (regRes.data?.success) {
        setRegLogs(regRes.data.data || []);
      }
    } catch (e) {
      console.log('Fetch error', e);
      // Fallback
      try {
        const attUrl = `https://v1.mypayrollmaster.online/api/v2qa/newapp/attendance_logs?user_id=${user.user_id}&month=${month}`;
        const attRes = await axios.post(attUrl, { user_id: user.user_id, filter: 'past' });
        if (attRes.data?.success) setLogs(attRes.data.data || []);
      } catch(e2) {
        Alert.alert('Error', 'Unable to fetch logs');
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData(currentMonthStr);
    }, [currentMonthStr])
  );

  const handleMonthChange = (direction) => {
    const [yr, mo] = currentMonthStr.split('-').map(Number);
    const date = new Date(yr, direction === 'prev' ? mo - 2 : mo, 1);
    const newMonthStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    setCurrentMonthStr(newMonthStr);
  };

  const formatDisplayDate = (dateStr) => {
    const d = new Date(dateStr);
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  };

  // ─── Render Log Item ────────────────────────────────────────────────────────
  const renderLogItem = ({ item }) => {
    const isMissingIn = item.punch_in_time === null;
    const isMissingOut = item.punch_out_time === null && !item.status?.includes('WO');
    
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
             <View>
                <Text style={s.cardDate}>{formatDisplayDate(item.date)}</Text>
                <Text style={s.cardShift}>{item.shift || 'General Shift (9:30 AM - 6:30 PM)'}</Text>
             </View>
             {item.status?.includes('WO') && (
                <View style={s.woBadge}><Text style={s.woText}>WO</Text></View>
             )}
        </View>

        <View style={s.punchList}>
            <View style={s.punchRow}>
                <View style={s.punchIconCol}>
                    <View style={[s.dot, !isMissingIn ? s.dotGreen : s.dotRed]} />
                    <View style={s.verticalLine} />
                </View>
                <View style={s.punchContent}>
                    {isMissingIn ? (
                        <View style={s.missingRow}>
                            <Text style={s.missingText}>Clock In{"\n"}<Text style={s.missingSub}>MISSING</Text></Text>
                            <TouchableOpacity 
                                style={s.regBtn} 
                                onPress={() => navigation.navigate('AttendanceReg', { date: item.date, direction: 'IN' })}
                            >
                                <Text style={s.regBtnText}>REGULARISE</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={s.filledRow}>
                            <View>
                                <Text style={s.punchTime}>{item.punch_in_time?.split(' ')[1] || item.punch_in_time}</Text>
                                <Text style={s.punchLoc} numberOfLines={1}>Location: Office Premises</Text>
                            </View>
                            <View style={s.roleBadge}><Text style={s.roleText}>Clock In</Text></View>
                        </View>
                    )}
                </View>
            </View>

            <View style={s.punchRow}>
                <View style={s.punchIconCol}>
                    <View style={[s.dot, !isMissingOut ? s.dotGreen : s.dotRed]} />
                </View>
                <View style={s.punchContent}>
                    {isMissingOut ? (
                        <View style={s.missingRow}>
                            <Text style={s.missingText}>Clock Out{"\n"}<Text style={s.missingSub}>MISSING</Text></Text>
                            <TouchableOpacity 
                                style={s.regBtn}
                                onPress={() => navigation.navigate('AttendanceReg', { date: item.date, direction: 'OUT' })}
                            >
                                <Text style={s.regBtnText}>REGULARISE</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        item.punch_out_time ? (
                            <View style={s.filledRow}>
                                <View>
                                    <Text style={s.punchTime}>{item.punch_out_time?.split(' ')[1] || item.punch_out_time}</Text>
                                    <Text style={s.punchLoc} numberOfLines={1}>Location: Office Premises</Text>
                                </View>
                                <View style={[s.roleBadge, { backgroundColor: '#FCE4EC' }]}><Text style={[s.roleText, { color: COLORS.primary }]}>Clock Out</Text></View>
                            </View>
                        ) : null
                    )}
                </View>
            </View>
        </View>
      </View>
    );
  };

  // ─── Render Regularised Item ────────────────────────────────────────────────
  const renderRegItem = ({ item }) => {
    const statusColor = item.status === 'Approved' ? '#2ECC71' : (item.status === 'Rejected' ? '#F44336' : '#F39C12');
    const statusBg = item.status === 'Approved' ? '#E8F5E9' : (item.status === 'Rejected' ? '#FFEBEE' : '#FFF3E0');

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
             <View>
                <Text style={s.cardDate}>{formatDisplayDate(item.date)}</Text>
                <Text style={s.cardShift}>{item.shift || 'General Shift (9:30 AM - 6:30 PM)'}</Text>
             </View>
             <View style={s.woBadge}><Text style={s.woText}>WO</Text></View>
        </View>

        <View style={s.regDetail}>
            <View style={s.punchIconCol}>
                <View style={[s.dot, { borderColor: statusColor, backgroundColor: '#FFF' }]}>
                   <View style={[s.dotInner, { backgroundColor: statusColor }]} />
                </View>
            </View>
            <View style={s.punchContent}>
                 <Text style={s.missingText}>Clock {item.direction || 'Out'}{"\n"}<Text style={[s.missingSub, { color: statusColor }]}>{item.time || '18:45:33'}</Text></Text>
            </View>
        </View>

        <View style={[s.statusFooter, { backgroundColor: statusBg }]}>
            <View style={{ flex: 1 }}>
                <Text style={s.footerLabel}>Regularisation Status</Text>
                <Text style={s.footerSub} numberOfLines={2}>{item.remarks || (item.status === 'Approved' ? '1 Sick leave is been adjusted.' : 'HR team is still reviewing your request')}</Text>
            </View>
            <View style={[s.statusTag, { backgroundColor: '#FFF' }]}>
                <Text style={[s.statusTagText, { color: statusColor }]}>{item.status || 'Pending'}</Text>
            </View>
        </View>
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
        <Text style={s.headerTitle}>Attendance</Text>
        <View style={s.monthPick}>
           <Text style={s.monthPickText}>
             {new Date(currentMonthStr + '-01').toLocaleString('en-US', { month: 'short' })} '{new Date(currentMonthStr + '-01').getFullYear().toString().slice(-2)}
           </Text>
           <ChevronDown color={COLORS.text} size={16} />
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={s.tabBar}>
        {['Log', 'Regularised'].map(tab => (
            <TouchableOpacity 
                key={tab} 
                onPress={() => setActiveTab(tab)}
                style={[s.tab, activeTab === tab && s.activeTab]}
            >
                <Text style={[s.tabText, activeTab === tab && s.activeTabText]}>{tab}</Text>
            </TouchableOpacity>
        ))}
      </View>

      {/* ── List ── */}
      <View style={s.listContainer}>
        {loading ? (
            <View style={s.center}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        ) : (
            <FlatList
                data={activeTab === 'Log' ? logs : regLogs}
                keyExtractor={(item, index) => item.date + index}
                renderItem={activeTab === 'Log' ? renderLogItem : renderRegItem}
                contentContainerStyle={s.listContents}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={s.center}>
                        <View style={s.emptyCircle}>
                            <Clock color={COLORS.textMuted} size={40} />
                        </View>
                        <Text style={s.emptyTitle}>No {activeTab} Found</Text>
                        <Text style={s.emptySub}>There are no logs available for this month.</Text>
                    </View>
                }
            />
        )}
      </View>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 60, backgroundColor: '#FFF'
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  monthPick: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  monthPickText: { fontSize: 13, fontWeight: '700', marginRight: 4, color: COLORS.text },

  tabBar: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#FFF' },
  tab: { paddingVertical: 14, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  activeTabText: { color: COLORS.primary },

  listContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  listContents: { padding: 16, paddingBottom: 40 },
  
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 16, ...SHADOWS.light },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  cardDate: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  cardShift: { fontSize: 12, color: COLORS.textLight, marginTop: 2, fontWeight: '500' },
  woBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  woText: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700' },

  punchList: { marginTop: 0 },
  punchRow: { flexDirection: 'row' },
  punchIconCol: { width: 20, alignItems: 'center', marginRight: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#DDD', zIndex: 2 },
  dotGreen: { borderColor: '#2ECC71', backgroundColor: '#2ECC71' },
  dotRed: { borderColor: '#F44336', backgroundColor: '#FFF' },
  verticalLine: { width: 2, flex: 1, backgroundColor: '#F3F4F6', marginVertical: -4 },
  
  punchContent: { flex: 1, paddingBottom: 20 },
  missingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missingText: { fontSize: 14, fontWeight: '700', color: COLORS.text, lineHeight: 18 },
  missingSub: { fontSize: 11, fontWeight: '800', color: '#F44336', textTransform: 'uppercase' },
  regBtn: { backgroundColor: '#D32F2F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  regBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  filledRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  punchTime: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  punchLoc: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  roleBadge: { backgroundColor: '#F0F7FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleText: { fontSize: 10, fontWeight: '800', color: '#2196F3' },

  // Regularised Tab styles
  regDetail: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  dotInner: { width: 6, height: 6, borderRadius: 3 },
  statusFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 8 },
  footerLabel: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  footerSub: { fontSize: 10, color: COLORS.textLight, marginTop: 2, fontWeight: '600' },
  statusTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, ...SHADOWS.light },
  statusTagText: { fontSize: 10, fontWeight: '900' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginBottom: 20, ...SHADOWS.light },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});

export default AttendanceScreen;
