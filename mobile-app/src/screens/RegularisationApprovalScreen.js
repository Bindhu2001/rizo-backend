import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, FlatList, StatusBar, Modal, Pressable, Image, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar as CalendarIcon, ChevronLeft, CheckCircle, XCircle, Info, Clock, ClipboardList } from 'lucide-react-native';
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
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
  const [alertCfg, setAlertCfg] = useState(null);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [historyData, setHistoryData] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFilter, setHistFilter] = useState('Approved');

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  const fetchData = async (month) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('month', month);

      const res = await axios.post(`${API_ENDPOINTS.REGULARISATION_HIERARCHY}?user_id=${user.user_id}&month=${month}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
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

  const fetchHistory = async (month, filter) => {
    setHistLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.REGULARISATION_APPROVED_LIST, {
        user_id: user.user_id,
        month_year: `${month}-01`,
        filter,
      });
      setHistoryData(res.data?.success === 1 ? (res.data.data || []) : []);
    } catch (e) {
      console.log('Reg approved list error', e);
      setHistoryData([]);
    } finally {
      setHistLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData(currentMonthStr);
    }, [currentMonthStr])
  );

  useEffect(() => {
    if (activeTab === 'HISTORY') fetchHistory(currentMonthStr, histFilter);
  }, [activeTab, currentMonthStr, histFilter]);

  const handleAction = async () => {
    if (!remarks.trim()) {
      showAlert('warning', 'Required', 'Please enter remarks.');
      return;
    }

    setProcessing(true);
    try {
      if (actionModal.type === 'CANCEL') {
        const res = await axios.post(API_ENDPOINTS.REGULARISATION_CANCEL, {
          user_id: user.user_id,
          id: String(actionModal.item.id || actionModal.item.emp_attendance_regularisation_pkey),
          remarks: remarks.trim(),
        });
        if (res.data?.success === 1 || res.data?.success === true) {
          showAlert('success', 'Cancelled', 'Regularisation cancelled successfully.', [
            { text: 'OK', onPress: () => fetchHistory(currentMonthStr, histFilter) }
          ]);
          setActionModal({ visible: false, item: null, type: '' });
          setRemarks('');
        } else {
          showAlert('error', 'Failed', res.data?.message || 'Could not cancel.');
        }
        return;
      }

      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('id', actionModal.item.id || actionModal.item.emp_attendance_regularisation_pkey);
      formData.append('status', actionModal.type === 'APPROVE' ? 'A' : 'R');
      formData.append('remarks', remarks);

      const res = await axios.post(API_ENDPOINTS.REGULARISATION_APPROVAL_ACTION, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data && res.data.success) {
        showAlert('success', 'Success', `Request ${actionModal.type === 'APPROVE' ? 'approved' : 'rejected'} successfully.`, [
          { text: 'OK', onPress: () => fetchData(currentMonthStr) }
        ]);
        setActionModal({ visible: false, item: null, type: '' });
        setRemarks('');
      } else {
        showAlert('error', 'Notice', res.data?.message || 'Action failed.');
      }
    } catch (e) {
      showAlert('error', 'Error', 'Failed to process request.');
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

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {[{ key: 'PENDING', label: 'Pending' }, { key: 'HISTORY', label: 'History' }].map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, activeTab === t.key && s.tabActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'PENDING' ? (
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
      ) : (
        <View style={{ flex: 1 }}>
          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            {[
              { key: 'Approved',               label: 'Approved',        color: '#16A34A', bg: '#DCFCE7' },
              { key: 'Rejected',               label: 'Rejected',        color: '#DC2626', bg: '#FEE2E2' },
              { key: 'CancellationOfApproved', label: 'Cancel Approval', color: '#EA580C', bg: '#FEF3C7' },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterChip, { backgroundColor: histFilter === f.key ? f.color : '#F3F4F6', borderColor: f.color }]}
                onPress={() => setHistFilter(f.key)}
              >
                <Text style={[s.filterChipText, { color: histFilter === f.key ? '#FFF' : f.color }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {histLoading ? (
            <View style={s.loaderWrap}><ActivityIndicator size="large" color={COLORS.primaryDeep} /></View>
          ) : (
            <FlatList
              data={historyData}
              keyExtractor={(item, idx) => String(item.id || item.emp_attendance_regularisation_pkey || idx)}
              contentContainerStyle={s.list}
              onRefresh={() => fetchHistory(currentMonthStr, histFilter)}
              refreshing={histLoading}
              ListEmptyComponent={
                <View style={s.empty}>
                  <ClipboardList color="#D1D5DB" size={60} />
                  <Text style={s.emptyText}>No records found</Text>
                </View>
              }
              renderItem={({ item }) => {
                const HIST_COLORS = {
                  Approved:               { side: '#16A34A', bg: '#DCFCE7', text: '#16A34A' },
                  Rejected:               { side: '#DC2626', bg: '#FEE2E2', text: '#DC2626' },
                  CancellationOfApproved: { side: '#EA580C', bg: '#FEF3C7', text: '#EA580C' },
                };
                const fc = HIST_COLORS[histFilter] || HIST_COLORS.Approved;
                const sideColor = fc.side;
                const badgeBg   = fc.bg;
                const badgeText = fc.text;
                return (
                  <View style={s.histCard}>
                    <View style={[s.histSide, { backgroundColor: sideColor }]} />
                    <View style={s.histBody}>
                      <View style={s.histHeader}>
                        <Text style={s.histEmpName}>{(item.employee_name || '').trim()}</Text>
                        <View style={[s.histBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[s.histBadgeText, { color: badgeText }]}>{item.direction || item.type || ''}</Text>
                        </View>
                      </View>
                      <View style={s.histDetail}>
                        <CalendarIcon size={13} color="#6B7280" />
                        <Text style={s.histDetailText}>{item.att_date || item.punch_date || ''}</Text>
                        {(item.LOGTIME || item.actual_time) ? (
                          <>
                            <Clock size={13} color="#6B7280" />
                            <Text style={s.histDetailText}>{item.LOGTIME || item.actual_time}</Text>
                          </>
                        ) : null}
                      </View>
                      {(item.remarks || item.reason) ? (
                        <View style={s.histRemarkBox}>
                          <Text style={s.histRemarkText} numberOfLines={2}>{item.remarks || item.reason}</Text>
                        </View>
                      ) : null}
                      {histFilter === 'Approved' && (
                        <TouchableOpacity
                          style={s.histCancelBtn}
                          onPress={() => setActionModal({ visible: true, item, type: 'CANCEL' })}
                          activeOpacity={0.75}
                        >
                          <Text style={s.histCancelBtnText}>Cancel Approval</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      <Modal visible={actionModal.visible} transparent animationType="fade" statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>
              {actionModal.type === 'CANCEL' ? 'Cancel' : actionModal.type === 'APPROVE' ? 'Approve' : 'Reject'} Request
            </Text>
            <Text style={s.modalSub}>
              {actionModal.type === 'CANCEL' ? 'Enter reason for cancellation' : `Enter remarks for ${actionModal.item?.employee_name}`}
            </Text>
            
            <TextInput
              style={s.remarksInput}
              placeholder="Enter remarks here..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              value={remarks}
              onChangeText={setRemarks}
              maxLength={100}
            />

            <View style={s.modalActions}>
              <TouchableOpacity 
                style={s.modalCancel} 
                onPress={() => { setActionModal({ visible: false, item: null, type: '' }); setRemarks(''); }}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[s.modalConfirm, (actionModal.type === 'REJECT' || actionModal.type === 'CANCEL') && { backgroundColor: '#EF4444' }]}
                onPress={handleAction}
                disabled={processing}
              >
                {processing ? <ActivityIndicator color="#FFF" /> : <Text style={s.modalConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60, backgroundColor: '#FFF' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.text },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  
  monthBar: { padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  monthDropdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#F3F0FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  monthText: { fontSize: moderateScale(14), fontWeight: '700', color: '#6C5CE7' },

  list: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOWS.light },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  empName: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },
  empId: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 2 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontSize: moderateScale(11), fontWeight: '800' },

  detailsRow: { flexDirection: 'row', marginBottom: 12, gap: 20 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: moderateScale(13), color: '#4B5563', fontWeight: '600' },

  reasonBox: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 10, borderRadius: 10, gap: 8, marginBottom: 16 },
  reasonText: { fontSize: moderateScale(12), color: '#6B7280', flex: 1, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 8, borderWidth: 1 },
  approveBtn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  approveBtnText: { color: '#047857', fontWeight: '800', fontSize: moderateScale(14) },
  rejectBtn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rejectBtnText: { color: '#B91C1C', fontWeight: '800', fontSize: moderateScale(14) },

  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 12, fontSize: moderateScale(15), color: '#9CA3AF', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%' },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: '#111827', marginBottom: 8 },
  modalSub: { fontSize: moderateScale(14), color: '#6B7280', marginBottom: 20 },
  remarksInput: {
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, height: 100,
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24,
    color: '#000',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  modalCancelText: { color: '#4B5563', fontWeight: '800' },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#10B981' },
  modalConfirmText: { color: '#FFF', fontWeight: '800' },

  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, width: '100%', position: 'absolute', bottom: 0, maxHeight: '60%' },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  sheetItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  sheetItemText: { fontSize: moderateScale(15), color: '#4B5563', textAlign: 'center' },
  sheetItemActive: { color: '#6C5CE7', fontWeight: '800' },

  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#6C5CE7' },
  tabText: { fontSize: moderateScale(14), fontWeight: '700', color: '#9CA3AF' },
  tabTextActive: { color: '#6C5CE7' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  filterChipText: { fontSize: moderateScale(12), fontWeight: '700' },

  histCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginBottom: 14, overflow: 'hidden', ...SHADOWS.light, borderWidth: 1, borderColor: '#F3F4F6' },
  histSide: { width: 6 },
  histBody: { flex: 1, padding: 14 },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  histEmpName: { fontSize: moderateScale(14), fontWeight: '800', color: '#111827', flex: 1, marginRight: 8 },
  histBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  histBadgeText: { fontSize: moderateScale(11), fontWeight: '800' },
  histDetail: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  histDetailText: { fontSize: moderateScale(12), color: '#4B5563', fontWeight: '600' },
  histRemarkBox: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 8, marginBottom: 8 },
  histRemarkText: { fontSize: moderateScale(11), color: '#6B7280', fontStyle: 'italic' },
  histCancelBtn: { borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 10, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  histCancelBtnText: { fontSize: moderateScale(13), fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
});

export default RegularisationApprovalScreen;

