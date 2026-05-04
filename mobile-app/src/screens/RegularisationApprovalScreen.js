import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Dimensions, FlatList, StatusBar, Modal, Pressable, Image, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar as CalendarIcon, ChevronLeft, CheckCircle, XCircle, Info, Clock, ClipboardList } from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { API_ENDPOINTS } from '../constants/Config';

const RegularisationApprovalScreen = ({ navigation, route }) => {
  const user = route?.params?.user;
  const [loading, setLoading] = useState(true);
  const [currentMonthStr, setCurrentMonthStr] = useState(new Date().toISOString().slice(0, 7));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [requests, setRequests] = useState([]);
  
  const [actionModal, setActionModal] = useState({ visible: false, item: null, type: '' });
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!user) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  const fetchData = async (month) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_ENDPOINTS.REGULARISATION_HIERARCHY}?user_id=${user.user_id}&month=${month}`);
      if (res.data && res.data.success) {
        setRequests(res.data.data || []);
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.log('Fetch error', e);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData(currentMonthStr);
    }, [currentMonthStr])
  );

  const handleAction = async () => {
    if (!remarks.trim()) {
      Alert.alert('Required', 'Please enter remarks.');
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        user_id: user.user_id,
        id: actionModal.item.id || actionModal.item.emp_attendance_regularisation_pkey,
        status: actionModal.type === 'APPROVE' ? 'A' : 'R',
        remarks: remarks
      };

      const res = await axios.post(API_ENDPOINTS.REGULARISATION_APPROVAL_ACTION, payload);
      if (res.data && res.data.success) {
        Alert.alert('Success', `Request ${actionModal.type === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
        setActionModal({ visible: false, item: null, type: '' });
        setRemarks('');
        fetchData(currentMonthStr);
      } else {
        Alert.alert('Notice', res.data?.message || 'Action failed.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to process request.');
    } finally {
      setProcessing(false);
    }
  };

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

  const renderItem = ({ item }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.empInfo}>
          <Text style={s.empName}>{item.employee_name}</Text>
          <Text style={s.empId}>{item.empid || item.employee_id}</Text>
        </View>
        <View style={[s.typeBadge, { backgroundColor: (item.direction || item.type) === 'Late In' ? '#FFF3E0' : '#E3F2FD' }]}>
          <Text style={[s.typeText, { color: (item.direction || item.type) === 'Late In' ? '#E65100' : '#1565C0' }]}>{item.direction || item.type}</Text>
        </View>
      </View>

      <View style={s.detailsRow}>
        <View style={s.detailItem}>
          <CalendarIcon size={14} color="#6B7280" />
          <Text style={s.detailText}>{item.att_date || item.punch_date}</Text>
        </View>
        <View style={s.detailItem}>
          <Clock size={14} color="#6B7280" />
          <Text style={s.detailText}>
            {item.LOGTIME || item.actual_time || '--:--'}
            {item.expected_time ? ` → ${item.expected_time}` : ''}
          </Text>
        </View>
      </View>

      <View style={s.reasonBox}>
        <Info size={14} color="#9CA3AF" />
        <Text style={s.reasonText}>{item.remarks || item.reason || 'No reason provided'}</Text>
      </View>

      <View style={s.actions}>
        <TouchableOpacity 
          style={[s.actionBtn, s.rejectBtn]} 
          onPress={() => setActionModal({ visible: true, item, type: 'REJECT' })}
        >
          <XCircle size={18} color="#EF4444" />
          <Text style={s.rejectBtnText}>Reject</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[s.actionBtn, s.approveBtn]} 
          onPress={() => setActionModal({ visible: true, item, type: 'APPROVE' })}
        >
          <CheckCircle size={18} color="#10B981" />
          <Text style={s.approveBtnText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reg. Approvals</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={s.monthBar}>
        <TouchableOpacity style={s.monthDropdown} onPress={() => setShowMonthPicker(true)}>
           <CalendarIcon color="#6C5CE7" size={18} style={{ marginRight: 8 }} />
           <Text style={s.monthText}>{pastMonths.find(m => m.value === currentMonthStr)?.label}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item, index) => String(item.id || item.emp_attendance_regularisation_pkey || index)}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading && (
            <View style={s.empty}>
              <ClipboardList color="#D1D5DB" size={60} />
              <Text style={s.emptyText}>No pending requests</Text>
            </View>
          )
        }
        refreshing={loading}
        onRefresh={() => fetchData(currentMonthStr)}
      />

      <Modal visible={actionModal.visible} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>{actionModal.type === 'APPROVE' ? 'Approve' : 'Reject'} Request</Text>
            <Text style={s.modalSub}>Enter remarks for {actionModal.item?.employee_name}</Text>
            
            <TextInput
              style={s.remarksInput}
              placeholder="Enter remarks here..."
              multiline
              numberOfLines={4}
              value={remarks}
              onChangeText={setRemarks}
              maxLength={50}
            />

            <View style={s.modalActions}>
              <TouchableOpacity 
                style={s.modalCancel} 
                onPress={() => { setActionModal({ visible: false, item: null, type: '' }); setRemarks(''); }}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[s.modalConfirm, actionModal.type === 'REJECT' && { backgroundColor: '#EF4444' }]} 
                onPress={handleAction}
                disabled={processing}
              >
                {processing ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMonthPicker} transparent animationType="slide" statusBarTranslucent>
        <Pressable style={s.modalOverlay} onPress={() => setShowMonthPicker(false)}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Select Month</Text>
            <ScrollView>
              {pastMonths.map((m) => (
                <TouchableOpacity 
                  key={m.value} 
                  style={s.sheetItem} 
                  onPress={() => { setCurrentMonthStr(m.value); setShowMonthPicker(false); }}
                >
                  <Text style={[s.sheetItemText, currentMonthStr === m.value && s.sheetItemActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60, backgroundColor: '#FFF' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  
  monthBar: { padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  monthDropdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#F3F0FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  monthText: { fontSize: 14, fontWeight: '700', color: '#6C5CE7' },

  list: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOWS.light },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  empName: { fontSize: 15, fontWeight: '800', color: '#111827' },
  empId: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontSize: 11, fontWeight: '800' },

  detailsRow: { flexDirection: 'row', marginBottom: 12, gap: 20 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, color: '#4B5563', fontWeight: '600' },

  reasonBox: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 10, borderRadius: 10, gap: 8, marginBottom: 16 },
  reasonText: { fontSize: 12, color: '#6B7280', flex: 1, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 8, borderWidth: 1 },
  approveBtn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  approveBtnText: { color: '#047857', fontWeight: '800', fontSize: 14 },
  rejectBtn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rejectBtnText: { color: '#B91C1C', fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 12, fontSize: 15, color: '#9CA3AF', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 8 },
  modalSub: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  remarksInput: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, height: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  modalCancelText: { color: '#4B5563', fontWeight: '800' },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#10B981' },
  modalConfirmText: { color: '#FFF', fontWeight: '800' },

  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, width: '100%', position: 'absolute', bottom: 0, maxHeight: '60%' },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  sheetItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  sheetItemText: { fontSize: 15, color: '#4B5563', textAlign: 'center' },
  sheetItemActive: { color: '#6C5CE7', fontWeight: '800' },
});

export default RegularisationApprovalScreen;
