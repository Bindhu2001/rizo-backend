import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, FlatList, StatusBar, Modal, Pressable, Image, TextInput, KeyboardAvoidingView
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as CalendarIcon, ChevronLeft, ChevronDown, CheckCircle, XCircle, Info, Clock, ClipboardList } from 'lucide-react-native';
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { API_ENDPOINTS } from '../constants/Config';

const HIST_FILTERS = {
  Approved:               { label: 'Approved',         color: '#16A34A', bg: '#DCFCE7' },
  Rejected:               { label: 'Rejected',         color: '#DC2626', bg: '#FEE2E2' },
  CancellationOfApproved: { label: 'Cancelled Approval', color: '#EA580C', bg: '#FEF3C7' },
};
const HIST_FILTER_KEYS = ['Approved', 'Rejected', 'CancellationOfApproved'];

const RegularisationApprovalScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
  const [showHistFilterPicker, setShowHistFilterPicker] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const histMeta = HIST_FILTERS[histFilter] || HIST_FILTERS.Approved;

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

  const handleCancelReg = (item) => {
    const regId = item.id || item.emp_attendance_regularisation_pkey;
    if (!regId) {
      showAlert('error', 'Error', 'Cannot cancel: regularisation ID not found in this record.');
      return;
    }
    showAlert('warning', 'Cancel Regularisation', `Cancel the approved regularisation for ${item.employee_name || 'this employee'}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          setCancellingId(regId);
          try {
            const res = await axios.post(API_ENDPOINTS.REGULARISATION_CANCEL, {
              user_id: user.user_id,
              id: String(regId),
              remarks: 'Cancelled',
            });
            if (res.data?.success === 1 || res.data?.success === true) {
              showAlert('success', 'Cancelled', res.data?.message || 'Regularisation has been cancelled successfully.');
              fetchHistory(currentMonthStr, histFilter);
            } else {
              showAlert('error', 'Cannot Cancel', res.data?.message || 'Could not cancel regularisation.');
            }
          } catch (e) {
            showAlert('error', 'Error', 'Failed to cancel regularisation. Please try again.');
          } finally {
            setCancellingId(null);
          }
        }
      },
    ]);
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
    <View style={[s.card, { backgroundColor: theme.card }]}>
      <View style={s.cardHeader}>
        <View style={s.empInfo}>
          <Text style={[s.empName, { color: theme.text }]}>{item.employee_name}</Text>
          <Text style={[s.empId, { color: theme.textLight }]}>{item.empid || item.employee_id}</Text>
        </View>
        <View style={[s.typeBadge, { backgroundColor: (item.direction || item.type) === 'Late In' ? '#FFF3E0' : '#E3F2FD' }]}>
          <Text style={[s.typeText, { color: (item.direction || item.type) === 'Late In' ? '#E65100' : '#1565C0' }]}>{item.direction || item.type}</Text>
        </View>
      </View>

      <View style={s.detailsRow}>
        <View style={s.detailItem}>
          <CalendarIcon size={14} color={theme.textLight} />
          <Text style={[s.detailText, { color: theme.textLight }]}>{item.att_date || item.punch_date}</Text>
        </View>
        <View style={s.detailItem}>
          <Clock size={14} color={theme.textLight} />
          <Text style={[s.detailText, { color: theme.textLight }]}>
            {item.LOGTIME || item.actual_time || '--:--'}
            {item.expected_time ? ` → ${item.expected_time}` : ''}
          </Text>
        </View>
      </View>

      <View style={[s.reasonBox, { backgroundColor: theme.cardSoft }]}>
        <Info size={14} color={theme.textMuted} />
        <Text style={[s.reasonText, { color: theme.textLight }]}>{item.remarks || item.reason || 'No reason provided'}</Text>
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
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar barStyle={theme.statusBarStyle} />
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Reg. Approvals</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={[s.monthBar, { backgroundColor: theme.bg, borderBottomColor: theme.divider }]}>
        <TouchableOpacity style={s.monthDropdown} onPress={() => setShowMonthPicker(true)}>
           <CalendarIcon color="#6C5CE7" size={18} style={{ marginRight: 8 }} />
           <Text style={s.monthText}>{pastMonths.find(m => m.value === currentMonthStr)?.label}</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={[s.tabBar, { backgroundColor: theme.bg, borderBottomColor: theme.divider }]}>
        {[{ key: 'PENDING', label: 'Pending' }, { key: 'HISTORY', label: 'History' }].map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, activeTab === t.key && s.tabActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[s.tabText, { color: theme.textMuted }, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
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
                <ClipboardList color={theme.textMuted} size={60} />
                <Text style={[s.emptyText, { color: theme.textMuted }]}>No pending requests</Text>
              </View>
            )
          }
          refreshing={loading}
          onRefresh={() => fetchData(currentMonthStr)}
        />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Filter dropdown */}
          <TouchableOpacity style={[s.histFilterDropdown, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setShowHistFilterPicker(true)} activeOpacity={0.8}>
            <View style={[s.histFilterDot, { backgroundColor: histMeta.color }]} />
            <Text style={[s.histFilterText, { color: theme.text }]}>{histMeta.label}</Text>
            <ChevronDown size={18} color={theme.textLight} />
          </TouchableOpacity>

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
                  <ClipboardList color={theme.textMuted} size={60} />
                  <Text style={[s.emptyText, { color: theme.textMuted }]}>No records found</Text>
                </View>
              }
              renderItem={({ item }) => {
                const sideColor = histMeta.color;
                const badgeBg   = histMeta.bg;
                const badgeText = histMeta.color;
                return (
                  <View style={[s.histCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[s.histSide, { backgroundColor: sideColor }]} />
                    <View style={s.histBody}>
                      <View style={s.histHeader}>
                        <Text style={[s.histEmpName, { color: theme.text }]}>{(item.employee_name || '').trim()}</Text>
                        <View style={[s.histBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[s.histBadgeText, { color: badgeText }]}>{item.direction || item.type || ''}</Text>
                        </View>
                      </View>
                      <View style={s.histDetail}>
                        <CalendarIcon size={13} color={theme.textLight} />
                        <Text style={[s.histDetailText, { color: theme.textLight }]}>{item.att_date || item.punch_date || ''}</Text>
                        {(item.LOGTIME || item.actual_time) ? (
                          <>
                            <Clock size={13} color={theme.textLight} />
                            <Text style={[s.histDetailText, { color: theme.textLight }]}>{item.LOGTIME || item.actual_time}</Text>
                          </>
                        ) : null}
                      </View>
                      {(item.remarks || item.reason) ? (
                        <View style={[s.histRemarkBox, { backgroundColor: theme.cardSoft }]}>
                          <Text style={[s.histRemarkText, { color: theme.textLight }]} numberOfLines={2}>{item.remarks || item.reason}</Text>
                        </View>
                      ) : null}
                      {histFilter === 'Approved' && (
                        <TouchableOpacity
                          style={[s.histCancelBtn, cancellingId === (item.id || item.emp_attendance_regularisation_pkey) && { opacity: 0.6 }]}
                          onPress={() => handleCancelReg(item)}
                          disabled={cancellingId === (item.id || item.emp_attendance_regularisation_pkey)}
                          activeOpacity={0.75}
                        >
                          {cancellingId === (item.id || item.emp_attendance_regularisation_pkey)
                            ? <ActivityIndicator size="small" color="#DC2626" />
                            : <Text style={s.histCancelBtnText}>Cancel Regularisation</Text>}
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

      <Modal visible={actionModal.visible} transparent animationType="fade" onRequestClose={() => { setActionModal({ visible: false, item: null, type: '' }); setRemarks(''); }} statusBarTranslucent>
        <KeyboardAvoidingView behavior="padding" style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[s.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>{actionModal.type === 'APPROVE' ? 'Approve' : 'Reject'} Request</Text>
            <Text style={[s.modalSub, { color: theme.textLight }]}>Enter remarks for {actionModal.item?.employee_name}</Text>

            <TextInput
              style={[s.remarksInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
              placeholder="Enter remarks here..."
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={4}
              value={remarks}
              onChangeText={setRemarks}
              maxLength={100}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalCancel, { backgroundColor: theme.cardSoft }]}
                onPress={() => { setActionModal({ visible: false, item: null, type: '' }); setRemarks(''); }}
              >
                <Text style={[s.modalCancelText, { color: theme.textLight }]}>Cancel</Text>
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showMonthPicker} transparent animationType="slide" onRequestClose={() => setShowMonthPicker(false)} statusBarTranslucent>
        <Pressable style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]} onPress={() => setShowMonthPicker(false)}>
          <View style={[s.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(moderateScale(24), insets.bottom + moderateScale(8)) }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Select Month</Text>
            <ScrollView>
              {pastMonths.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.sheetItem, { borderBottomColor: theme.divider }]}
                  onPress={() => { setCurrentMonthStr(m.value); setShowMonthPicker(false); }}
                >
                  <Text style={[s.sheetItemText, { color: theme.textLight }, currentMonthStr === m.value && s.sheetItemActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      <Modal visible={showHistFilterPicker} transparent animationType="slide" onRequestClose={() => setShowHistFilterPicker(false)} statusBarTranslucent>
        <Pressable style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]} onPress={() => setShowHistFilterPicker(false)}>
          <View style={[s.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(moderateScale(24), insets.bottom + moderateScale(8)) }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Filter History</Text>
            {HIST_FILTER_KEYS.map((key) => {
              const meta = HIST_FILTERS[key];
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.sheetItem, { borderBottomColor: theme.divider }]}
                  onPress={() => { setHistFilter(key); setShowHistFilterPicker(false); }}
                >
                  <View style={s.sheetItemRow}>
                    <View style={[s.histFilterDot, { backgroundColor: meta.color }]} />
                    <Text style={[s.sheetItemText, { color: theme.textLight }, histFilter === key && s.sheetItemActive]}>{meta.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16), height: moderateScale(60), backgroundColor: '#FFF' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.text },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center' },
  
  monthBar: { padding: moderateScale(16), backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  monthDropdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#F3F0FF', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8), borderRadius: moderateScale(20) },
  monthText: { fontSize: moderateScale(14), fontWeight: '700', color: '#6C5CE7' },

  list: { padding: moderateScale(16), paddingBottom: moderateScale(40) },
  card: { backgroundColor: '#FFF', borderRadius: moderateScale(16), padding: moderateScale(16), marginBottom: moderateScale(16), ...SHADOWS.light },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: moderateScale(12) },
  empName: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },
  empId: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 2 },
  typeBadge: { paddingHorizontal: moderateScale(10), paddingVertical: 4, borderRadius: moderateScale(8) },
  typeText: { fontSize: moderateScale(11), fontWeight: '800' },

  detailsRow: { flexDirection: 'row', marginBottom: moderateScale(12), gap: moderateScale(20) },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(6) },
  detailText: { fontSize: moderateScale(13), color: '#4B5563', fontWeight: '600' },

  reasonBox: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: moderateScale(10), borderRadius: moderateScale(10), gap: moderateScale(8), marginBottom: moderateScale(16) },
  reasonText: { fontSize: moderateScale(12), color: '#6B7280', flex: 1, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: moderateScale(12) },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: moderateScale(12), borderRadius: moderateScale(12), gap: moderateScale(8), borderWidth: 1 },
  approveBtn: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  approveBtnText: { color: '#047857', fontWeight: '800', fontSize: moderateScale(14) },
  rejectBtn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rejectBtnText: { color: '#B91C1C', fontWeight: '800', fontSize: moderateScale(14) },

  empty: { alignItems: 'center', marginTop: moderateScale(100) },
  emptyText: { marginTop: moderateScale(12), fontSize: moderateScale(15), color: '#9CA3AF', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: moderateScale(20) },
  modalContent: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(24), width: '100%' },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: '#111827', marginBottom: moderateScale(8) },
  modalSub: { fontSize: moderateScale(14), color: '#6B7280', marginBottom: moderateScale(20) },
  remarksInput: {
    backgroundColor: '#F9FAFB', borderRadius: moderateScale(12), padding: moderateScale(16), height: moderateScale(100),
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: moderateScale(24),
    color: '#000',
  },
  modalActions: { flexDirection: 'row', gap: moderateScale(12) },
  modalCancel: { flex: 1, paddingVertical: moderateScale(14), borderRadius: moderateScale(12), alignItems: 'center', backgroundColor: '#F3F4F6' },
  modalCancelText: { color: '#4B5563', fontWeight: '800' },
  modalConfirm: { flex: 2, paddingVertical: moderateScale(14), borderRadius: moderateScale(12), alignItems: 'center', backgroundColor: '#10B981' },
  modalConfirmText: { color: '#FFF', fontWeight: '800' },

  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), width: '100%', position: 'absolute', bottom: 0, maxHeight: '60%' },
  handle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  sheetTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: moderateScale(16), textAlign: 'center' },
  sheetItem: { paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  sheetItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: moderateScale(10) },
  sheetItemText: { fontSize: moderateScale(15), color: '#4B5563', textAlign: 'center' },
  sheetItemActive: { color: '#6C5CE7', fontWeight: '800' },

  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, paddingVertical: moderateScale(12), alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#6C5CE7' },
  tabText: { fontSize: moderateScale(14), fontWeight: '700', color: '#9CA3AF' },
  tabTextActive: { color: '#6C5CE7' },

  histFilterDropdown: {
    flexDirection: 'row', alignItems: 'center', gap: moderateScale(10),
    marginHorizontal: moderateScale(16), marginTop: moderateScale(12), marginBottom: 4,
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(11), ...SHADOWS.light,
  },
  histFilterDot: { width: moderateScale(10), height: moderateScale(10), borderRadius: 5 },
  histFilterText: { flex: 1, fontSize: moderateScale(14), fontWeight: '700', color: '#374151' },

  histCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(16), marginBottom: moderateScale(14), overflow: 'hidden', ...SHADOWS.light, borderWidth: 1, borderColor: '#F3F4F6' },
  histSide: { width: moderateScale(6) },
  histBody: { flex: 1, padding: moderateScale(14) },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: moderateScale(8) },
  histEmpName: { fontSize: moderateScale(14), fontWeight: '800', color: '#111827', flex: 1, marginRight: moderateScale(8) },
  histBadge: { paddingHorizontal: moderateScale(8), paddingVertical: 3, borderRadius: moderateScale(8) },
  histBadgeText: { fontSize: moderateScale(11), fontWeight: '800' },
  histDetail: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(6), marginBottom: moderateScale(8), flexWrap: 'wrap' },
  histDetailText: { fontSize: moderateScale(12), color: '#4B5563', fontWeight: '600' },
  histRemarkBox: { backgroundColor: '#F9FAFB', borderRadius: moderateScale(8), padding: moderateScale(8) },
  histRemarkText: { fontSize: moderateScale(11), color: '#6B7280', fontStyle: 'italic' },
  histCancelBtn: {
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: moderateScale(10),
    paddingVertical: moderateScale(9), alignItems: 'center', justifyContent: 'center', marginTop: moderateScale(8),
  },
  histCancelBtnText: { fontSize: moderateScale(13), fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
});

export default RegularisationApprovalScreen;

