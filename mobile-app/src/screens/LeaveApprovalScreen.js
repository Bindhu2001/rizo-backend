import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SectionList, FlatList,
  Pressable, ScrollView, KeyboardAvoidingView, Platform,
  Modal, TextInput, ActivityIndicator, StatusBar
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, ChevronDown, XCircle, Calendar as CalendarIcon,
  Clock, Info, ClipboardList, CheckCircle, ShieldCheck,
} from 'lucide-react-native';
import { COLORS, SHADOWS, moderateScale } from '../components/Theme';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { API_ENDPOINTS } from '../constants/Config';

const AUTH_HISTORY_FILTERS = [
  { key: 'Authorized',               label: 'Authorized',   color: '#6C5CE7', bg: '#F3F0FF' },
  { key: 'CancellationOfAuthorized', label: 'Cancel Auth',  color: '#EA580C', bg: '#FEF3C7' },
  { key: 'Rejected',                 label: 'Rejected',     color: '#DC2626', bg: '#FEE2E2' },
];
const APPR_HISTORY_FILTERS = [
  { key: 'Approved',               label: 'Approved',        color: '#16A34A', bg: '#DCFCE7' },
  { key: 'CancellationOfApproved', label: 'Cancel Approval', color: '#DC2626', bg: '#FEE2E2' },
  { key: 'Rejected',               label: 'Rejected',        color: '#DC2626', bg: '#FEE2E2' },
];
const ALL_HIST_FILTERS = [
  ...AUTH_HISTORY_FILTERS,
  ...APPR_HISTORY_FILTERS.filter(f => !AUTH_HISTORY_FILTERS.find(a => a.key === f.key)),
];

const SECTION_META = {
  authorizer: {
    side: '#6C5CE7', bg: '#F3F0FF', text: '#6C5CE7',
    label: 'AUTHORISE', action: 'Authorized', btnLabel: 'Authorize',
  },
  approver: {
    side: '#16A34A', bg: '#DCFCE7', text: '#16A34A',
    label: 'APPROVE', action: 'Approved', btnLabel: 'Approve',
  },
};

const LeaveApprovalScreen = ({ navigation, route }) => {
  const user = route?.params?.user;

  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [actionModal, setActionModal] = useState({ visible: false, item: null, sectionKey: '', actionType: '' });
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);
  const [currentMonthStr, setCurrentMonthStr] = useState(new Date().toISOString().slice(0, 7));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [historyData, setHistoryData] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFilter, setHistFilter] = useState('Approved');
  const [cancellingId, setCancellingId] = useState(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [userRoles, setUserRoles] = useState({ isAuthorizer: false, isApprover: false });
  const [histRoleView, setHistRoleView] = useState('APPR');

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  const fetchData = async (month) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('user_id', user.user_id);

      const res = await axios.post(`${API_ENDPOINTS.LEAVE_HIERARCHY}?user_id=${user.user_id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        const { authorizer_leaves = [], approver_leaves = [] } = res.data.data || {};

        setUserRoles(prev => ({
          isAuthorizer: prev.isAuthorizer || authorizer_leaves.length > 0,
          isApprover: prev.isApprover || approver_leaves.length > 0,
        }));

        // Filter locally since API returns all months
        const filteredAuth = authorizer_leaves.filter(l => (l.FROMDATE || l.from_date || '').startsWith(month));
        const filteredAppr = approver_leaves.filter(l => (l.FROMDATE || l.from_date || '').startsWith(month));

        const built = [];
        if (filteredAuth.length) built.push({ key: 'authorizer', title: 'Authorise Requests', data: filteredAuth });
        if (filteredAppr.length) built.push({ key: 'approver', title: 'Approve Requests', data: filteredAppr });
        setSections(built);
      } else {
        setSections([]);
      }
    } catch (e) {
      console.log('LeaveApproval fetch error', e);
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLeave = (item) => {
    const leaveId = item.LEAVEENTRYID || item.leave_id || item.LEAVEID;
    const empUserId =
      item.USERID || item.user_id ||
      item.employee_id || item.emp_id ||
      item.EMP_ID || item.EMP_CODE || item.emp_code;
    if (!leaveId || !empUserId) {
      showAlert('error', 'Error', 'Cannot cancel: employee ID not found in this record.');
      return;
    }
    showAlert('warning', 'Cancel Leave', `Cancel the approved leave for ${item.employee_name || 'this employee'}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
          setCancellingId(leaveId);
          try {
            const res = await axios.post(API_ENDPOINTS.LEAVE_CANCEL, { user_id: empUserId, leave_id: String(leaveId) });
            if (res.data?.success === 1 || res.data?.success === true) {
              showAlert('success', 'Cancelled', 'Leave has been cancelled successfully.');
              fetchHistory(currentMonthStr, histFilter);
            } else {
              showAlert('error', 'Failed', res.data?.message || 'Could not cancel leave.');
            }
          } catch (e) {
            showAlert('error', 'Error', 'Failed to cancel leave. Please try again.');
          } finally {
            setCancellingId(null);
          }
        }
      },
    ]);
  };

  const fetchHistory = async (month, filter) => {
    setHistLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.LEAVE_APPROVED_LIST, {
        user_id: user.user_id,
        selectedLanguage: `${month}-01`,
        filter,
      });
      setHistoryData(res.data?.success === 1 ? (res.data.data || []) : []);
    } catch (e) {
      console.log('Leave approved list error', e);
      setHistoryData([]);
    } finally {
      setHistLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(currentMonthStr); }, [currentMonthStr]));

  // When roles are first detected, initialise the role view and default filter
  useEffect(() => {
    if (!userRoles.isAuthorizer && userRoles.isApprover) {
      setHistRoleView('APPR');
      setHistFilter('Approved');
    } else if (userRoles.isAuthorizer) {
      setHistRoleView('AUTH');
      setHistFilter('Authorized');
    }
  }, [userRoles.isAuthorizer, userRoles.isApprover]);

  // When role view tab switches, reset histFilter to first valid filter for that role
  useEffect(() => {
    const filters = histRoleView === 'AUTH' ? AUTH_HISTORY_FILTERS : APPR_HISTORY_FILTERS;
    const firstKey = filters[0].key;
    setHistFilter(prev => (prev === firstKey ? prev : firstKey));
  }, [histRoleView]);

  useEffect(() => {
    if (activeTab === 'HISTORY') fetchHistory(currentMonthStr, histFilter);
  }, [activeTab, currentMonthStr, histFilter]);

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

  const openModal = (item, sectionKey, actionType) => {
    setActionModal({ visible: true, item, sectionKey, actionType });
    setRemarks('');
  };

  const closeModal = () => {
    setActionModal({ visible: false, item: null, sectionKey: '', actionType: '' });
    setRemarks('');
  };

  const handleAction = async () => {
    if (!remarks.trim()) {
      showAlert('warning', 'Required', 'Please enter remarks.');
      return;
    }
    const { item, sectionKey, actionType } = actionModal;
    const meta = SECTION_META[sectionKey];
    const action = actionType === 'REJECT' ? 'Rejected' : meta.action;

    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('leave_id', item.leave_id || item.LEAVEENTRYID);
      formData.append('action', action);
      formData.append('remarks', remarks.trim());

      const res = await axios.post(`${API_ENDPOINTS.LEAVE_ACTION}?user_id=${user.user_id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.success) {
        showAlert('success', 'Success', `Leave request ${action.toLowerCase()} successfully.`, [
          { text: 'OK', onPress: () => fetchData(currentMonthStr) }
        ]);
        closeModal();
      } else {
        showAlert('error', 'Notice', res.data?.message || 'Action failed.');
      }
    } catch (e) {
      showAlert('error', 'Error', 'Failed to process request.');
    } finally {
      setProcessing(false);
    }
  };

  const renderItem = ({ item, section }) => {
    const meta = SECTION_META[section.key];
    return (
      <View style={s.card}>
        {/* Coloured Sidebar */}
        <View style={[s.sideBar, { backgroundColor: meta.side }]}>
          <Text style={s.sideText}>{meta.label}</Text>
        </View>

        <View style={s.cardBody}>
          {/* Header */}
          <View style={s.cardHeader}>
            <View style={s.empInfo}>
              <Text style={s.empName}>{item.employee_name || item.emp_name || 'Employee'}</Text>
              <Text style={s.empId}>{item.employee_id || item.emp_id || ''}</Text>
            </View>
            <View style={[s.typeBadge, { backgroundColor: meta.bg }]}>
              <Text style={[s.typeText, { color: meta.text }]}>
                {item.leave_name || item.leave_type || 'Leave'}
              </Text>
            </View>
          </View>

          {/* Dates */}
          <View style={s.detailsRow}>
            <View style={s.detailItem}>
              <CalendarIcon size={14} color="#6B7280" />
              <Text style={s.detailText}>
                {item.from_date || item.FROMDATE}{(item.to_date || item.TODATE) && (item.to_date || item.TODATE) !== (item.from_date || item.FROMDATE) ? ` – ${item.to_date || item.TODATE}` : ''}
              </Text>
            </View>
            {(item.no_of_days || item.leave_days) != null && (
              <View style={s.detailItem}>
                <Clock size={14} color="#6B7280" />
                <Text style={s.detailText}>{item.no_of_days || item.leave_days} day{(item.no_of_days || item.leave_days) != 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>

          {/* Reason */}
          <View style={s.reasonBox}>
            <Info size={14} color="#9CA3AF" />
            <Text style={s.reasonText}>{item.reason || 'No reason provided'}</Text>
          </View>

          {/* Buttons */}
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.actionBtn, s.rejectBtn]}
              onPress={() => openModal(item, section.key, 'REJECT')}
            >
              <XCircle size={18} color="#EF4444" />
              <Text style={s.rejectBtnText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: meta.bg, borderColor: meta.side + '55', borderWidth: 1 }]}
              onPress={() => openModal(item, section.key, 'APPROVE')}
            >
              {section.key === 'authorizer'
                ? <ShieldCheck size={18} color={meta.text} />
                : <CheckCircle size={18} color={meta.text} />
              }
              <Text style={[s.approveBtnText, { color: meta.text }]}>{meta.btnLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Leave Approvals</Text>
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
        loading ? (
          <View style={s.loaderWrap}><ActivityIndicator size="large" color={COLORS.primaryDeep} /></View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, idx) => String(item.leave_id || item.LEAVEENTRYID || idx)}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={s.sectionHeader}>
                <Text style={s.sectionHeaderText}>{section.title}</Text>
                <View style={s.sectionCount}><Text style={s.sectionCountText}>{section.data.length}</Text></View>
              </View>
            )}
            contentContainerStyle={s.list}
            ListEmptyComponent={<View style={s.empty}><ClipboardList color="#D1D5DB" size={60} /><Text style={s.emptyText}>No pending requests</Text></View>}
            onRefresh={() => fetchData(currentMonthStr)}
            refreshing={loading}
            stickySectionHeadersEnabled={false}
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          {/* Role sub-tabs — only shown when user has both roles */}
          {userRoles.isAuthorizer && userRoles.isApprover && (
            <View style={s.roleTabBar}>
              {[{ key: 'AUTH', label: 'Authorizer' }, { key: 'APPR', label: 'Approver' }].map(rt => (
                <TouchableOpacity
                  key={rt.key}
                  style={[s.roleTab, histRoleView === rt.key && s.roleTabActive]}
                  onPress={() => setHistRoleView(rt.key)}
                >
                  <Text style={[s.roleTabText, histRoleView === rt.key && s.roleTabTextActive]}>{rt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Filter Dropdown */}
          {(() => {
            const filters = histRoleView === 'AUTH' ? AUTH_HISTORY_FILTERS : APPR_HISTORY_FILTERS;
            const active = filters.find(f => f.key === histFilter) || filters[0];
            return (
              <TouchableOpacity style={[s.filterDropdown, { borderColor: active.color }]} onPress={() => setShowFilterPicker(true)} activeOpacity={0.75}>
                <View style={[s.filterDot, { backgroundColor: active.color }]} />
                <Text style={[s.filterDropdownText, { color: active.color }]}>{active.label}</Text>
                <ChevronDown color={active.color} size={16} />
              </TouchableOpacity>
            );
          })()}

          {histLoading ? (
            <View style={s.loaderWrap}><ActivityIndicator size="large" color={COLORS.primaryDeep} /></View>
          ) : (
            <FlatList
              data={historyData}
              keyExtractor={(item, idx) => String(item.LEAVEENTRYID || idx)}
              contentContainerStyle={s.list}
              onRefresh={() => fetchHistory(currentMonthStr, histFilter)}
              refreshing={histLoading}
              ListEmptyComponent={<View style={s.empty}><ClipboardList color="#D1D5DB" size={60} /><Text style={s.emptyText}>No records found</Text></View>}
              renderItem={({ item }) => {
                const f = ALL_HIST_FILTERS.find(x => x.key === histFilter) || ALL_HIST_FILTERS[0];
                return (
                  <View style={s.histCard}>
                    <View style={[s.histSide, { backgroundColor: f.color }]} />
                    <View style={s.histBody}>
                      <View style={s.histHeader}>
                        <Text style={s.histEmpName}>{(item.employee_name || '').trim()}</Text>
                        <View style={[s.histBadge, { backgroundColor: f.bg }]}>
                          <Text style={[s.histBadgeText, { color: f.color }]}>{(item.leave_type || '').trim()}</Text>
                        </View>
                      </View>
                      <View style={s.histDates}>
                        <CalendarIcon size={13} color="#6B7280" />
                        <Text style={s.histDateText}>
                          {item.FROMDATE}{item.TODATE && item.TODATE !== item.FROMDATE ? ` – ${item.TODATE}` : ''}
                        </Text>
                        {item.leave_days ? (
                          <View style={[s.histDaysBadge, { backgroundColor: f.bg }]}>
                            <Text style={[s.histDaysText, { color: f.color }]}>{item.leave_days} day{item.leave_days != 1 ? 's' : ''}</Text>
                          </View>
                        ) : null}
                      </View>
                      {item.REMARKS ? (
                        <View style={s.histRemarkBox}>
                          <Text style={s.histRemarkText} numberOfLines={2}>{item.REMARKS}</Text>
                        </View>
                      ) : null}
                      {(histFilter === 'Approved' || histFilter === 'Authorized') && (
                        <TouchableOpacity
                          style={[s.histCancelBtn, cancellingId === (item.LEAVEENTRYID || item.leave_id) && { opacity: 0.6 }]}
                          onPress={() => handleCancelLeave(item)}
                          disabled={cancellingId === (item.LEAVEENTRYID || item.leave_id)}
                          activeOpacity={0.75}
                        >
                          {cancellingId === (item.LEAVEENTRYID || item.leave_id)
                            ? <ActivityIndicator size="small" color="#DC2626" />
                            : <Text style={s.histCancelBtnText}>Cancel Leave</Text>}
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

      {/* Remarks Modal */}
      <Modal visible={actionModal.visible} transparent animationType="fade" statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>
              {actionModal.actionType === 'REJECT'
                ? 'Reject'
                : SECTION_META[actionModal.sectionKey]?.btnLabel || 'Confirm'} Request
            </Text>
            <Text style={s.modalSub}>
              Enter remarks for {actionModal.item?.employee_name || actionModal.item?.emp_name || 'employee'}
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
              <TouchableOpacity style={s.modalCancel} onPress={closeModal}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.modalConfirm,
                  {
                    backgroundColor: actionModal.actionType === 'REJECT'
                      ? '#EF4444'
                      : SECTION_META[actionModal.sectionKey]?.side || '#10B981',
                  },
                ]}
                onPress={handleAction}
                disabled={processing}
              >
                {processing
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={s.modalConfirmText}>Confirm</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter Picker Modal */}
      <Modal visible={showFilterPicker} transparent animationType="slide" statusBarTranslucent>
        <Pressable style={s.modalOverlay} onPress={() => setShowFilterPicker(false)}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Select Filter</Text>
            <ScrollView>
              {(histRoleView === 'AUTH' ? AUTH_HISTORY_FILTERS : APPR_HISTORY_FILTERS).map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={s.sheetItem}
                  onPress={() => { setHistFilter(f.key); setShowFilterPicker(false); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.filterDot, { backgroundColor: f.color }]} />
                    <Text style={[s.sheetItemText, histFilter === f.key && { color: f.color, fontWeight: '800' }]}>{f.label}</Text>
                  </View>
                  {histFilter === f.key && <CheckCircle color={f.color} size={18} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Month Picker Modal */}
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

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 60, backgroundColor: '#FFF',
  },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.text },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },

  monthBar: { padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  monthDropdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#F3F0FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  monthText: { fontSize: moderateScale(14), fontWeight: '700', color: '#6C5CE7' },

  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: 16, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4,
  },
  sectionHeaderText: { fontSize: moderateScale(14), fontWeight: '800', color: '#374151', flex: 1 },
  sectionCount: {
    backgroundColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
  },
  sectionCountText: { fontSize: moderateScale(12), fontWeight: '800', color: '#374151' },

  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16,
    marginBottom: 16, overflow: 'hidden', ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  sideBar: { width: 36, justifyContent: 'center', alignItems: 'center' },
  sideText: {
    color: '#FFF', fontSize: moderateScale(8), fontWeight: '900', letterSpacing: 1,
    transform: [{ rotate: '-90deg' }], width: 80, textAlign: 'center',
  },
  cardBody: { flex: 1, padding: 14 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  empInfo: { flex: 1, marginRight: 8 },
  empName: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },
  empId: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 2 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  typeText: { fontSize: moderateScale(11), fontWeight: '800' },

  detailsRow: { flexDirection: 'row', marginBottom: 10, gap: 16, flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: moderateScale(13), color: '#4B5563', fontWeight: '600' },

  reasonBox: {
    flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 10,
    borderRadius: 10, gap: 8, marginBottom: 14,
  },
  reasonText: { fontSize: moderateScale(12), color: '#6B7280', flex: 1, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 8,
  },
  approveBtnText: { fontWeight: '800', fontSize: moderateScale(14) },
  rejectBtn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 },
  rejectBtnText: { color: '#B91C1C', fontWeight: '800', fontSize: moderateScale(14) },

  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 12, fontSize: moderateScale(15), color: '#9CA3AF', fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%' },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: '#111827', marginBottom: 8 },
  modalSub: { fontSize: moderateScale(14), color: '#6B7280', marginBottom: 20 },
  remarksInput: {
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, height: 100,
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24,
    color: '#000',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', backgroundColor: '#F3F4F6',
  },
  modalCancelText: { color: '#4B5563', fontWeight: '800' },
  modalConfirm: {
    flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  modalConfirmText: { color: '#FFF', fontWeight: '800' },

  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#6C5CE7' },
  tabText: { fontSize: moderateScale(14), fontWeight: '700', color: '#9CA3AF' },
  tabTextActive: { color: '#6C5CE7' },

  filterDropdown: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5, backgroundColor: '#FFF', gap: 8,
  },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterDropdownText: { fontSize: moderateScale(13), fontWeight: '700', marginRight: 2 },

  roleTabBar: { flexDirection: 'row', backgroundColor: '#F3F4F6', marginHorizontal: 16, marginTop: 10, borderRadius: 10, padding: 3 },
  roleTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  roleTabActive: { backgroundColor: '#FFF', ...SHADOWS.light },
  roleTabText: { fontSize: moderateScale(13), fontWeight: '700', color: '#9CA3AF' },
  roleTabTextActive: { color: '#6C5CE7', fontWeight: '800' },

  histCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginBottom: 14, overflow: 'hidden', ...SHADOWS.light, borderWidth: 1, borderColor: '#F3F4F6' },
  histSide: { width: 6 },
  histBody: { flex: 1, padding: 14 },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  histEmpName: { fontSize: moderateScale(14), fontWeight: '800', color: '#111827', flex: 1, marginRight: 8 },
  histBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  histBadgeText: { fontSize: moderateScale(11), fontWeight: '800' },
  histDates: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  histDateText: { fontSize: moderateScale(12), color: '#4B5563', fontWeight: '600', flex: 1 },
  histDaysBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  histDaysText: { fontSize: moderateScale(11), fontWeight: '700' },
  histRemarkBox: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 8, marginBottom: 8 },
  histRemarkText: { fontSize: moderateScale(11), color: '#6B7280', fontStyle: 'italic' },
  histCancelBtn: {
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 10,
    paddingVertical: 9, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  histCancelBtnText: { fontSize: moderateScale(13), fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },

  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, width: '100%', position: 'absolute', bottom: 0, maxHeight: '60%' },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  sheetItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  sheetItemText: { fontSize: moderateScale(15), color: '#4B5563', textAlign: 'center' },
  sheetItemActive: { color: '#6C5CE7', fontWeight: '800' },
});

export default LeaveApprovalScreen;

