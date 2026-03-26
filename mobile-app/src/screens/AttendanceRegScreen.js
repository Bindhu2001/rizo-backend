import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  TextInput, Dimensions, ActivityIndicator, Alert, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ChevronLeft, Calendar as CalendarIcon, Clock, 
  CheckCircle, ChevronRight, X
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { saveRegLocal, getRegsLocal, initDB } from '../services/LocalDB';
import SyncService from '../services/SyncService';
import * as Network from 'expo-network';

const { width } = Dimensions.get('window');

const AttendanceRegScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100056' };
  const [loading, setLoading] = useState(true);
  const [regs, setRegs] = useState([]);
  const [view, setView] = useState('LIST'); // LIST or APPLY or SUCCESS
  const [processing, setProcessing] = useState(false);

  // Form State
  const [date, setDate] = useState('29/01/2025');
  const [actualTime, setActualTime] = useState('09:15 AM');
  const [expectedTime, setExpectedTime] = useState('09:00 AM');
  const [type, setType] = useState('LATE IN');
  const [reason, setReason] = useState('');

  useEffect(() => {
    fetchRegs();
  }, []);

  const fetchRegs = async () => {
    try {
      const data = await getRegsLocal(user.user_id);
      setRegs(data || []);
    } catch (e) {
      console.log('Fetch regs error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!reason.trim()) {
      Alert.alert('Error', 'Please provide a reason');
      return;
    }
    setProcessing(true);
    try {
      await saveRegLocal({
        userId: user.user_id,
        punchDate: date,
        actualTime,
        expectedTime,
        type,
        reason
      });

      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        await SyncService.syncAll();
      }

      setView('SUCCESS');
      fetchRegs();
    } catch (e) {
      Alert.alert('Error', 'Failed to submit request');
    } finally {
      setProcessing(false);
    }
  };

  const Header = ({ title, onBack }) => (
    <View style={headerStyles.header}>
      <TouchableOpacity onPress={onBack} style={headerStyles.backBtn}>
        <ChevronLeft color={COLORS.text} size={28} />
      </TouchableOpacity>
      <Text style={headerStyles.headerTitle}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  const headerStyles = {
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60, backgroundColor: COLORS.primaryDeep },
    backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  };
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primaryDeep} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {view === 'LIST' && (
        <>
          <Header title="Regularise Attendance" onBack={() => navigation.goBack()} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>Request History</Text>
              {regs.length === 0 ? (
                <View style={styles.emptyState}>
                   <Clock color={COLORS.textMuted} size={48} />
                   <Text style={styles.emptyText}>No requests found</Text>
                </View>
              ) : (
                regs.map(item => (
                  <View key={item.id} style={styles.regCard}>
                     <View style={styles.regTop}>
                        <View>
                           <Text style={styles.regDate}>{item.punch_date}</Text>
                           <Text style={[styles.regType, { color: item.type === 'LATE IN' ? '#E67E22' : '#E74C3C' }]}>{item.type}</Text>
                        </View>
                         <View style={[styles.statusTag, { backgroundColor: item.status === 'APPROVED' ? '#E8F5E9' : (item.status === 'PENDING' ? '#FFF3E0' : '#E3F2FD') }]}>
                            <Text style={[styles.statusText, { color: item.status === 'APPROVED' ? '#2ECC71' : (item.status === 'PENDING' ? '#F39C12' : '#2196F3') }]}>{item.status === 'PENDING' ? 'LOCAL' : item.status}</Text>
                         </View>
                     </View>
                     <Text style={styles.regReason} numberOfLines={2}>{item.reason}</Text>
                     <View style={styles.regFooter}>
                        <Text style={styles.timeLabel}>Actual: {item.actual_time} | Expected: {item.expected_time}</Text>
                     </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.fab} onPress={() => setView('APPLY')}>
            <CheckCircle color="#FFF" size={24} />
            <Text style={styles.fabText}>Apply Now</Text>
          </TouchableOpacity>
        </>
      )}

      {view === 'APPLY' && (
        <>
          <Header title="Regularise Attendance" onBack={() => setView('LIST')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.formCard}>
               <View style={styles.inputBox}>
                  <Text style={styles.label}>Reason</Text>
                  <View style={styles.inputRow}>
                     <Text style={styles.inputText}>{type === 'LATE IN' ? 'Forgot to Swipe' : 'System Issue'}</Text>
                     <ChevronRight color={COLORS.textLight} size={18} style={{ marginLeft: 'auto' }} />
                  </View>
               </View>

               <View style={styles.inputBox}>
                  <Text style={styles.label}>Enter Time</Text>
                  <View style={styles.inputRow}>
                     <Clock color={COLORS.textLight} size={18} />
                     <Text style={styles.inputText}>{actualTime}</Text>
                  </View>
               </View>

               <View style={styles.inputBox}>
                  <Text style={styles.label}>Remarks</Text>
                  <TextInput 
                    style={styles.textArea} 
                    multiline 
                    placeholder="Describe the reason for regularization..."
                    value={reason}
                    onChangeText={setReason}
                  />
               </View>

               <TouchableOpacity 
                style={[styles.submitBtn, processing && { opacity: 0.7 }]} 
                onPress={handleApply}
                disabled={processing}
               >
                  {processing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>SUBMIT REQUEST</Text>}
               </TouchableOpacity>
            </View>
          </ScrollView>
        </>
      )}

      {view === 'SUCCESS' && (
        <View style={styles.successContainer}>
            <CheckCircle color="#2ECC71" size={100} strokeWidth={1} />
            <Text style={styles.successTitle}>Submitted!</Text>
            <Text style={styles.successSub}>Your regularization request has been sent for approval.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => setView('LIST')}>
                <Text style={styles.doneBtnText}>Back to List</Text>
            </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60, backgroundColor: '#FFF' },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  scroll: { padding: 20 },

  // List
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  regCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 16, ...SHADOWS.light },
  regTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  regDate: { fontSize: 14, color: COLORS.textLight, fontWeight: '700' },
  regType: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  regReason: { fontSize: 13, color: COLORS.text, lineHeight: 18, marginBottom: 12 },
  regFooter: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  timeLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyText: { color: COLORS.textMuted, marginTop: 12, fontWeight: '600' },

  fab: { 
    position: 'absolute', bottom: 30, right: 20, left: 20, height: 60,
    backgroundColor: COLORS.primaryDeep, borderRadius: 30, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium
  },
  fabText: { color: '#FFF', fontSize: 16, fontWeight: '800', marginLeft: 10 },

  // Form
  formCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...SHADOWS.light },
  inputBox: { marginBottom: 20 },
  label: { fontSize: 13, color: COLORS.textLight, fontWeight: '700', marginBottom: 10, marginLeft: 4 },
  inputRow: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6'
  },
  inputText: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginLeft: 12 },
  row: { flexDirection: 'row' },
  typeSelector: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 6 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#FFF', ...SHADOWS.light },
  typeBtnText: { color: COLORS.textLight, fontWeight: '700' },
  typeBtnTextActive: { color: COLORS.primaryDeep },
  textArea: { 
    backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, 
    height: 120, textAlignVertical: 'top', fontSize: 15, fontWeight: '600', color: COLORS.text,
    borderWidth: 1, borderColor: '#F3F4F6'
  },
  submitBtn: { backgroundColor: COLORS.primaryDeep, padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 10, ...SHADOWS.medium },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900' },

  // Success
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  successTitle: { fontSize: 24, fontWeight: '900', color: COLORS.text, marginTop: 24 },
  successSub: { fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  doneBtn: { marginTop: 40, backgroundColor: '#FFF', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30, borderWidth: 1, borderColor: '#E5E7EB' },
  doneBtnText: { color: COLORS.text, fontWeight: '800' }
});

export default AttendanceRegScreen;
