import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  TextInput, Dimensions, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ChevronLeft, Calendar as CalendarIcon, ChevronDown, 
  ChevronRight, CheckCircle, Clock
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const LeaveHeader = ({ title, onBack }) => (
  <View style={headerStyles.header}>
    <TouchableOpacity onPress={onBack} style={headerStyles.backBtn}>
      <ChevronLeft color="#FFF" size={28} />
    </TouchableOpacity>
    <Text style={headerStyles.headerTitle}>{title}</Text>
    <View style={{ width: 44 }} />
  </View>
);

const headerStyles = {
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60, backgroundColor: COLORS.primaryDeep },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFF' },
};

const LeaveScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100056' };
  const [view, setView] = useState('DASHBOARD');
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [fromDate, setFromDate] = useState('2025-01-29');
  const [toDate, setToDate] = useState('2025-02-02');
  const [fromHalf, setFromHalf] = useState('Full Day');
  const [toHalf, setToHalf] = useState('Full Day');
  const [reason, setReason] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [authorisedBy, setAuthorisedBy] = useState('John Doe');
  const [approvedBy, setApprovedBy] = useState('Alex Walker');
  const [submitting, setSubmitting] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const hist = await axios.post(`https://v1.mypayrollmaster.online/api/v2qa/newapp/leave_history`, { user_id: user.user_id });
      if (hist.data?.success) setLeaves(hist.data.data || []);

      const items = await axios.post(`https://v1.mypayrollmaster.online/api/v2qa/newapp/leave_items`, { user_id: user.user_id });
      if (items.data?.success) setLeaveBalances(items.data.data || []);
    } catch (e) {
      console.log('Fetch leaves error', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      setView('DASHBOARD');
      fetchHistory();
    }, [])
  );

  const handleSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('Error', 'Please provide a reason for leave');
      return;
    }
    if (!selectedLeave) return;

    setSubmitting(true);
    try {
      const res = await axios.post('https://v1.mypayrollmaster.online/api/v2qa/newapp/leave', {
        user_id: user.user_id,
        from_date: fromDate,
        to_date: toDate,
        salary_head_item_fkey: parseInt(selectedLeave.leave_id, 10) || 0,
        reason: reason,
        from_session: fromHalf === 'Second Half' ? 2 : 1,
        to_session: toHalf === 'First Half' ? 1 : 2,
        contact_number: contactNo || 'N/A',
        duties_handed_over: 'N/A',
        authorized_by: 1, 
        approved_by: 1
      });

      if (res.data?.success === 1 || res.data?.success === true || res.data?.message?.toLowerCase().includes('success')) {
        setView('SUCCESS');
        await fetchHistory();
      } else {
        Alert.alert('Notice', res.data?.message || 'Failed to submit leave.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save leave request.\n\nDetails: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };



  const DashboardView = () => (
    <View style={{ flex: 1 }}>
      <LeaveHeader title="Leaves" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {leaveBalances.map((item, index) => {
          const colors = ['#8E24AA', '#FF9800', '#4CAF50', '#2196F3', '#E91E63', '#9C27B0'];
          const ccolor = colors[index % colors.length];
          const taken = parseFloat(item.leave_taken) || 0;
          const bal = parseFloat(item.leave_balance) || 0;
          const total = taken + bal;
          
          return (
          <TouchableOpacity 
            key={item.leave_id} 
            style={styles.balanceCard}
            onPress={() => {
              setSelectedLeave(item);
              setView('APPLY');
            }}
          >
            <View style={[styles.typeBar, { backgroundColor: ccolor }]} />
            <View style={styles.balanceContent}>
              <View>
                <Text style={styles.balanceRatio}>{taken}/{total}</Text>
                <Text style={styles.balanceType}>{item.leave_name?.trim()}</Text>
              </View>
              <ChevronRight color={COLORS.textMuted} size={20} />
            </View>
          </TouchableOpacity>
        )})}
        
        <TouchableOpacity style={styles.historyBtn} onPress={() => setView('HISTORY')}>
          <Text style={styles.historyBtnText}>View applied & past leaves</Text>
          <ChevronRight color={COLORS.primaryDeep} size={18} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const ApplyFormView = () => (
    <View style={{ flex: 1 }}>
      <LeaveHeader title={`Apply ${selectedLeave?.leave_name?.trim() || ''}`} onBack={() => setView('DASHBOARD')} />
      <View style={styles.remainingBanner}>
        <Text style={styles.remainingText}>{selectedLeave?.leave_name?.trim() || ''} remaining : {selectedLeave?.leave_balance || 0}</Text>
      </View>
      <ScrollView 
         showsVerticalScrollIndicator={false} 
         contentContainerStyle={styles.scroll}
         keyboardShouldPersistTaps="handled"
      >
        
        <View style={styles.row}>
          <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>From Date</Text>
            <View style={[styles.textInput, { flexDirection: 'row', alignItems: 'center' }]}>
              <TextInput 
                style={{ flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' }}
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />
              <CalendarIcon color={COLORS.text} size={18} />
            </View>
          </View>
          <View style={[styles.inputBox, { flex: 1 }]}>
            <Text style={styles.label}>&nbsp;</Text>
            <View style={styles.dateInput}>
              <Text style={styles.inputValue}>{fromHalf}</Text>
              <ChevronDown color={COLORS.text} size={18} />
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputBox, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>To Date</Text>
            <View style={[styles.textInput, { flexDirection: 'row', alignItems: 'center' }]}>
              <TextInput 
                style={{ flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' }}
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />
              <CalendarIcon color={COLORS.text} size={18} />
            </View>
          </View>
          <View style={[styles.inputBox, { flex: 1 }]}>
            <Text style={styles.label}>&nbsp;</Text>
            <View style={styles.dateInput}>
              <Text style={styles.inputValue}>{toHalf}</Text>
              <ChevronDown color={COLORS.text} size={18} />
            </View>
          </View>
        </View>

        <View style={styles.inputBox}>
          <Text style={styles.label}>Authorised By</Text>
          <View style={styles.dateInput}>
            <Text style={styles.inputValue}>{authorisedBy}</Text>
            <ChevronDown color={COLORS.text} size={18} />
          </View>
        </View>

        <View style={styles.inputBox}>
          <Text style={styles.label}>Approved By</Text>
          <View style={styles.dateInput}>
            <Text style={styles.inputValue}>{approvedBy}</Text>
            <ChevronDown color={COLORS.text} size={18} />
          </View>
        </View>

        <View style={styles.inputBox}>
          <Text style={styles.label}>Contact Number</Text>
          <TextInput 
            style={styles.textInput} 
            value={contactNo} 
            onChangeText={setContactNo}
            placeholder="+91 0000000000" 
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputBox}>
          <Text style={styles.label}>Reason Note</Text>
          <TextInput 
            style={[styles.textInput, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]} 
            multiline 
            value={reason}
            onChangeText={setReason}
            placeholder="Feeling unwell, additional notes..." 
          />
        </View>

        <TouchableOpacity 
            style={[styles.submitBtn, submitting && { opacity: 0.7 }, { marginTop: 10 }]} 
            onPress={handleSubmit}
            disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>APPLY</Text>}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );

  const SuccessView = () => (
    <View style={styles.successContainer}>
      <View style={styles.successCircle}>
        <CheckCircle color="#2ECC71" size={80} strokeWidth={2} />
      </View>
      <Text style={styles.successTitle}>Leave Request Sent Successfully!</Text>
      <Text style={styles.successSub}>Your leave request has been sent successfully. We will get back to you shortly!</Text>
      
      <TouchableOpacity style={styles.goHomeBtn} onPress={() => setView('DASHBOARD')}>
        <Text style={styles.goHomeText}>Go back to dashboard</Text>
      </TouchableOpacity>
    </View>
  );

  const HistoryView = () => (
    <View style={{ flex: 1 }}>
      <LeaveHeader title="Leave History" onBack={() => setView('DASHBOARD')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {leaves.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
                <Clock color={COLORS.textMuted} size={40} />
                <Text style={{ marginTop: 12, color: COLORS.textMuted, fontWeight: '600' }}>No leave history found</Text>
            </View>
        ) : (
            leaves.map((item, index) => (
                <View key={item.leave_id || index.toString()} style={styles.historyCard}>
                    <View style={[styles.statusSideBar, { backgroundColor: item.leave_status === 'Approved' ? '#4CAF50' : item.leave_status === 'Rejected' ? '#F44336' : (item.leave_status === 'Applied' ? '#2196F3' : '#F59E0B') }]}>
                        <Text style={styles.sidebarText}>{item.leave_status}</Text>
                    </View>
                    <View style={styles.historyInfo}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.historyTypeTitle}>{item.leave_name?.trim()}</Text>
                            <Text style={styles.historyDateText}>{item.from_date} to {item.to_date}</Text>
                            {item.approved_by_person && <Text style={styles.historyBy}>Appr: {item.approved_by_person}</Text>}
                        </View>
                        <View style={styles.dayBadge}>
                            <Text style={styles.dayNum}>{item.leave_count}</Text>
                            <Text style={styles.dayLabel}>Days</Text>
                        </View>
                    </View>
                </View>
            ))
        )}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {view === 'DASHBOARD' && DashboardView()}
      {view === 'APPLY' && ApplyFormView()}
      {view === 'SUCCESS' && SuccessView()}
      {view === 'HISTORY' && HistoryView()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  scroll: { padding: 20 },
  balanceCard: { 
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, 
    marginBottom: 12, overflow: 'hidden', height: 74,
    ...SHADOWS.light, borderWidth: 1, borderColor: '#F3F4F6'
  },
  typeBar: { width: 6, height: '100%' },
  balanceContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  balanceRatio: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  balanceType: { fontSize: 13, color: COLORS.textLight, fontWeight: '500' },
  historyBtn: { 
    backgroundColor: '#F3E5F5', padding: 16, borderRadius: 16, 
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 20
  },
  historyBtnText: { color: COLORS.primaryDeep, fontWeight: '700', marginRight: 8, fontSize: 13 },
  remainingBanner: { backgroundColor: '#F3E5F5', padding: 12, alignItems: 'center' },
  remainingText: { color: COLORS.primaryDeep, fontSize: 12, fontWeight: '600', textTransform: 'lowercase' },
  row: { flexDirection: 'row', marginBottom: 16 },
  inputBox: { marginBottom: 16 },
  label: { fontSize: 12, color: COLORS.textLight, marginBottom: 8, fontWeight: '600' },
  dateInput: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 14, paddingHorizontal: 16, height: 50
  },
  inputValue: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  textInput: {
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 14, paddingHorizontal: 16, height: 50, fontSize: 14, fontWeight: '600'
  },
  submitBtn: { backgroundColor: COLORS.primaryDeep, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  successCircle: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center', marginBottom: 40,
    ...SHADOWS.medium, borderWidth: 1, borderColor: '#F0FDF4',
  },
  successTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 16 },
  successSub: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', lineHeight: 22, marginBottom: 60 },
  goHomeBtn: { 
    width: '100%', height: 60, borderRadius: 30, 
    borderWidth: 1, borderColor: '#E5E7EB', 
    justifyContent: 'center', alignItems: 'center' 
  },
  goHomeText: { color: COLORS.text, fontWeight: '800' },
  historyCard: { 
    backgroundColor: '#FFF', borderRadius: 20, marginBottom: 16, 
    flexDirection: 'row', overflow: 'hidden', ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6'
  },
  statusSideBar: { width: 44, justifyContent: 'center', alignItems: 'center' },
  sidebarText: { 
    transform: [{ rotate: '-90deg' }], color: '#FFF', width: 100,
    fontSize: 10, fontWeight: '900', textAlign: 'center' 
  },
  historyInfo: { flex: 1, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTypeTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  historyDateText: { fontSize: 12, color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  historyBy: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  dayBadge: { alignItems: 'center' },
  dayNum: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  dayLabel: { fontSize: 10, color: COLORS.textLight, fontWeight: '700' }
});

export default LeaveScreen;
