import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SectionList, FlatList,
  Pressable, ScrollView, KeyboardAvoidingView,
  Modal, TextInput, ActivityIndicator, StatusBar
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, ChevronDown, XCircle, Calendar as CalendarIcon,
  Clock, Info, ClipboardList, CheckCircle, ShieldCheck,
} from 'lucide-react-native';
import { COLORS, SHADOWS, moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { API_ENDPOINTS } from '../constants/Config';

const HIST_FILTERS = {
  Authorized:               { label: 'Authorized',              color: '#6C5CE7', bg: '#F3F0FF' },
  CancellationOfAuthorized: { label: 'Cancelled by Authorizer', color: '#EA580C', bg: '#FEF3C7' },
  Approved:                 { label: 'Approved',                color: '#16A34A', bg: '#DCFCE7' },
  CancellationOfApproved:   { label: 'Cancelled by Approver',   color: '#DC2626', bg: '#FEE2E2' },
  Rejected:                 { label: 'Rejected',                color: '#DC2626', bg: '#FEE2E2' },
};
const DEFAULT_HIST_META = { label: 'Authorized', color: '#6C5CE7', bg: '#F3F0FF' };

// Build the dropdown options for the History tab based on the logged-in user's role(s).
const buildHistFilterOptions = (roles) => {
  if (!roles.isAuthorizer && !roles.isApprover) {
    return ['Authorized', 'CancellationOfAuthorized', 'Rejected'];
  }
  const keys = [];
  if (roles.isAuthorizer) keys.push('Authorized', 'CancellationOfAuthorized');
  if (roles.isApprover) keys.push('Approved', 'CancellationOfApproved');
  keys.push('Rejected');
  return keys;
};

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
  const theme = useTheme();
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
  const [histFilter, setHistFilter] = useState('Authorized');
  const [showHistFilterPicker, setShowHistFilterPicker] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [userRoles, setUserRoles] = useState({ isAuthorizer: false, isApprover: false });

  const histFilterOptions = buildHistFilterOptions(userRoles);
  const histMeta = HIST_FILTERS[histFilter] || DEFAULT_HIST_META;

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

        // If a LEAVEENTRYID appears in BOTH lists it's already past authorisation —
        // drop the duplicate from the authoriser section so it only shows as Approve.
        const apprIds = new Set(
          filteredAppr.map(l => String(l.LEAVEENTRYID || l.leave_id))
        );
        const filteredAuthOnly = filteredAuth.filter(
          l => !apprIds.has(String(l.LEAVEENTRYID || l.leave_id))
        );

        const built = [];
        if (filteredAuthOnly.length) built.push({ key: 'authorizer', title: 'Authorise Requests', data: filteredAuthOnly });
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
    // Cancel must be done on behalf of the employee who APPLIED for the leave,
    // not the logged-in approver. The API expects a company-prefixed id
    // (e.g. "GLET101333"). Try every common field name; if we only get the
    // numeric portion, prefix it with the logged-in user's company code.
    const direct =
      item.USER_ID || item.user_id || item.USERID || item.userid ||
      item.EMPLOYEE_USER_ID || item.employee_user_id ||
      item.EMPLOYEE_USERID || item.employee_userid;
    const numeric =
      item.employee_id || item.EMPLOYEE_ID || item.emp_id || item.EMP_ID ||
      item.EMP_CODE || item.emp_code || item.EMP_fkey;
    const prefixMatch = String(user.user_id || '').match(/^([A-Za-z]+)/);
    const companyPrefix = prefixMatch ? prefixMatch[1] : '';

    let empUserId = null;
    if (direct && /^[A-Za-z]+\d+$/.test(String(direct).trim())) {
      // Already in "GLET101333" form
      empUserId = String(direct).trim();
    } else if (direct) {
      // direct was numeric — combine with company prefix if missing
      const v = String(direct).trim();
      empUserId = companyPrefix && /^\d+$/.test(v) ? `${companyPrefix}${v}` : v;
    } else if (numeric) {
      const v = String(numeric).trim();
      empUserId = companyPrefix && /^\d+$/.test(v) ? `${companyPrefix}${v}` : v;
    }

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
      // Send the month under several common parameter names so whichever one
      // the backend honours, the right month is returned.
      const monthDate = `${month}-01`;
      const res = await axios.post(API_ENDPOINTS.LEAVE_APPROVED_LIST, {
        user_id: user.user_id,
        month_year: monthDate,
        month: monthDate,
        selectedLanguage: monthDate,
        filter,
      });
      const list = res.data?.success === 1 ? (res.data.data || []) : [];
      // API may return records for all months — keep only the selected month.
      const inMonth = (d) => {
        if (!d || typeof d !== 'string') return false;
        if (d.startsWith(month)) return true; // YYYY-MM-DD
        const parts = d.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          // DD-MM-YYYY → YYYY-MM
          return `${parts[2]}-${parts[1].padStart(2, '0')}` === month;
        }
        return false;
      };
      const filtered = list.filter((it) =>
        inMonth(it.FROMDATE || it.from_date || it.APPLIEDDATE || it.applied_date)
      );
      setHistoryData(filtered);
    } catch (e) {
      console.log('Leave approved list error', e);
      setHistoryData([]);
    } finally {
      setHistLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(currentMonthStr); }, [currentMonthStr]));

  // When roles are first detected, default the History filter to this user's role
  useEffect(() => {
    if (userRoles.isAuthorizer) setHistFilter('Authorized');
    else if (userRoles.isApprover) setHistFilter('Approved');
  }, [userRoles.isAuthorizer, userRoles.isApprover]);

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
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Coloured Sidebar */}
        <View style={[s.sideBar, { backgroundColor: meta.side }]}>
          <Text style={s.sideText}>{meta.label}</Text>
        </View>

        <View style={s.cardBody}>
          {/* Header */}
          <View style={s.cardHeader}>
            <View style={s.empInfo}>
              <Text style={[s.empName, { color: theme.text }]}>{item.employee_name || item.emp_name || 'Employee'}</Text>
              <Text style={[s.empId, { color: theme.textLight }]}>{item.employee_id || item.emp_id || ''}</Text>
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
              <CalendarIcon size={14} color={theme.textLight} />
              <Text style={[s.detailText, { color: theme.textLight }]}>
                {item.from_date || item.FROMDATE}{(item.to_date || item.TODATE) && (item.to_date || item.TODATE) !== (item.from_date || item.FROMDATE) ? ` – ${item.to_date || item.TODATE}` : ''}
              </Text>
            </View>
            {(item.no_of_days || item.leave_days) != null && (
              <View style={s.detailItem}>
                <Clock size={14} color={theme.textLight} />
                <Text style={[s.detailText, { color: theme.textLight }]}>{item.no_of_days || item.leave_days} day{(item.no_of_days || item.leave_days) != 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>

          {/* Reason */}
          <View style={[s.reasonBox, { backgroundColor: theme.cardSoft }]}>
            <Info size={14} color={theme.textMuted} />
            <Text style={[s.reasonText, { color: theme.textLight }]}>{item.reason || 'No reason provided'}</Text>
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
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar barStyle={theme.statusBarStyle} />

      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Leave Approvals</Text>
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
        loading ? (
          <View style={s.loaderWrap}><ActivityIndicator size="large" color={COLORS.primaryDeep} /></View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, idx) => String(item.leave_id || item.LEAVEENTRYID || idx)}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={s.sectionHeader}>
                <Text style={[s.sectionHeaderText, { color: theme.text }]}>{section.title}</Text>
                <View style={[s.sectionCount, { backgroundColor: theme.cardSoft }]}><Text style={[s.sectionCountText, { color: theme.text }]}>{section.data.length}</Text></View>
              </View>
            )}
            contentContainerStyle={s.list}
            ListEmptyComponent={<View style={s.empty}><ClipboardList color={theme.textMuted} size={60} /><Text style={[s.emptyText, { color: theme.textMuted }]}>No pending requests</Text></View>}
            onRefresh={() => fetchData(currentMonthStr)}
            refreshing={loading}
            stickySectionHeadersEnabled={false}
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          {/* Role-aware filter dropdown */}
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
              keyExtractor={(item, idx) => String(item.LEAVEENTRYID || idx)}
              contentContainerStyle={s.list}
              onRefresh={() => fetchHistory(currentMonthStr, histFilter)}
              refreshing={histLoading}
              ListEmptyComponent={<View style={s.empty}><ClipboardList color={theme.textMuted} size={60} /><Text style={[s.emptyText, { color: theme.textMuted }]}>No records found</Text></View>}
              renderItem={({ item }) => {
                const f = histMeta;
                return (
                  <View style={[s.histCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[s.histSide, { backgroundColor: f.color }]} />
                    <View style={s.histBody}>
                      <View style={s.histHeader}>
                        <Text style={[s.histEmpName, { color: theme.text }]}>{(item.employee_name || '').trim()}</Text>
                        <View style={[s.histBadge, { backgroundColor: f.bg }]}>
                          <Text style={[s.histBadgeText, { color: f.color }]}>{(item.leave_type || '').trim()}</Text>
                        </View>
                      </View>
                      <View style={s.histDates}>
                        <CalendarIcon size={13} color={theme.textLight} />
                        <Text style={[s.histDateText, { color: theme.textLight }]}>
                          {item.FROMDATE}{item.TODATE && item.TODATE !== item.FROMDATE ? ` – ${item.TODATE}` : ''}
                        </Text>
                        {item.leave_days ? (
                          <View style={[s.histDaysBadge, { backgroundColor: f.bg }]}>
                            <Text style={[s.histDaysText, { color: f.color }]}>{item.leave_days} day{item.leave_days != 1 ? 's' : ''}</Text>
                          </View>
                        ) : null}
                      </View>
                      {item.REMARKS ? (
                        <View style={[s.histRemarkBox, { backgroundColor: theme.cardSoft }]}>
                          <Text style={[s.histRemarkText, { color: theme.textLight }]} numberOfLines={2}>{item.REMARKS}</Text>
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
        <KeyboardAvoidingView behavior="padding" style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[s.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>
              {actionModal.actionType === 'REJECT'
                ? 'Reject'
                : SECTION_META[actionModal.sectionKey]?.btnLabel || 'Confirm'} Request
            </Text>
            <Text style={[s.modalSub, { color: theme.textLight }]}>
              Enter remarks for {actionModal.item?.employee_name || actionModal.item?.emp_name || 'employee'}
            </Text>

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
              <TouchableOpacity style={[s.modalCancel, { backgroundColor: theme.cardSoft }]} onPress={closeModal}>
                <Text style={[s.modalCancelText, { color: theme.textLight }]}>Cancel</Text>
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

      {/* Month Picker Modal */}
      <Modal visible={showMonthPicker} transparent animationType="slide" statusBarTranslucent>
        <Pressable style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]} onPress={() => setShowMonthPicker(false)}>
          <View style={[s.sheet, { backgroundColor: theme.card }]}>
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
      {/* History Filter Picker Modal */}
      <Modal visible={showHistFilterPicker} transparent animationType="slide" statusBarTranslucent>
        <Pressable style={[s.modalOverlay, { backgroundColor: theme.modalOverlay }]} onPress={() => setShowHistFilterPicker(false)}>
          <View style={[s.sheet, { backgroundColor: theme.card }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <Text style={[s.sheetTitle, { color: theme.text }]}>Filter History</Text>
            {histFilterOptions.map((key) => {
              const meta = HIST_FILTERS[key] || DEFAULT_HIST_META;
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

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16), height: moderateScale(60), backgroundColor: '#FFF',
  },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.text },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center' },

  monthBar: { padding: moderateScale(16), backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  monthDropdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#F3F0FF', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8), borderRadius: moderateScale(20) },
  monthText: { fontSize: moderateScale(14), fontWeight: '700', color: '#6C5CE7' },

  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: moderateScale(16), paddingBottom: moderateScale(40) },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: moderateScale(12), marginTop: 4,
  },
  sectionHeaderText: { fontSize: moderateScale(14), fontWeight: '800', color: '#374151', flex: 1 },
  sectionCount: {
    backgroundColor: '#E5E7EB', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(8), paddingVertical: 2,
  },
  sectionCountText: { fontSize: moderateScale(12), fontWeight: '800', color: '#374151' },

  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: moderateScale(16),
    marginBottom: moderateScale(16), overflow: 'hidden', ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  sideBar: { width: moderateScale(36), justifyContent: 'center', alignItems: 'center' },
  sideText: {
    color: '#FFF', fontSize: moderateScale(8), fontWeight: '900', letterSpacing: 1,
    transform: [{ rotate: '-90deg' }], width: moderateScale(80), textAlign: 'center',
  },
  cardBody: { flex: 1, padding: moderateScale(14) },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: moderateScale(10) },
  empInfo: { flex: 1, marginRight: moderateScale(8) },
  empName: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },
  empId: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 2 },
  typeBadge: { paddingHorizontal: moderateScale(10), paddingVertical: 4, borderRadius: moderateScale(8), alignSelf: 'flex-start' },
  typeText: { fontSize: moderateScale(11), fontWeight: '800' },

  detailsRow: { flexDirection: 'row', marginBottom: moderateScale(10), gap: moderateScale(16), flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(6) },
  detailText: { fontSize: moderateScale(13), color: '#4B5563', fontWeight: '600' },

  reasonBox: {
    flexDirection: 'row', backgroundColor: '#F9FAFB', padding: moderateScale(10),
    borderRadius: moderateScale(10), gap: moderateScale(8), marginBottom: moderateScale(14),
  },
  reasonText: { fontSize: moderateScale(12), color: '#6B7280', flex: 1, fontStyle: 'italic' },

  actions: { flexDirection: 'row', gap: moderateScale(12) },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: moderateScale(12), borderRadius: moderateScale(12), gap: moderateScale(8),
  },
  approveBtnText: { fontWeight: '800', fontSize: moderateScale(14) },
  rejectBtn: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 },
  rejectBtnText: { color: '#B91C1C', fontWeight: '800', fontSize: moderateScale(14) },

  empty: { alignItems: 'center', marginTop: moderateScale(100) },
  emptyText: { marginTop: moderateScale(12), fontSize: moderateScale(15), color: '#9CA3AF', fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: moderateScale(20),
  },
  modalContent: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(24), width: '100%' },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: '#111827', marginBottom: moderateScale(8) },
  modalSub: { fontSize: moderateScale(14), color: '#6B7280', marginBottom: moderateScale(20) },
  remarksInput: {
    backgroundColor: '#F9FAFB', borderRadius: moderateScale(12), padding: moderateScale(16), height: moderateScale(100),
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: moderateScale(24),
    color: '#000',
  },
  modalActions: { flexDirection: 'row', gap: moderateScale(12) },
  modalCancel: {
    flex: 1, paddingVertical: moderateScale(14), borderRadius: moderateScale(12),
    alignItems: 'center', backgroundColor: '#F3F4F6',
  },
  modalCancelText: { color: '#4B5563', fontWeight: '800' },
  modalConfirm: {
    flex: 2, paddingVertical: moderateScale(14), borderRadius: moderateScale(12), alignItems: 'center',
  },
  modalConfirmText: { color: '#FFF', fontWeight: '800' },

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
  histDates: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(6), marginBottom: moderateScale(8), flexWrap: 'wrap' },
  histDateText: { fontSize: moderateScale(12), color: '#4B5563', fontWeight: '600', flex: 1 },
  histDaysBadge: { paddingHorizontal: moderateScale(8), paddingVertical: 2, borderRadius: moderateScale(6) },
  histDaysText: { fontSize: moderateScale(11), fontWeight: '700' },
  histRemarkBox: { backgroundColor: '#F9FAFB', borderRadius: moderateScale(8), padding: moderateScale(8), marginBottom: moderateScale(8) },
  histRemarkText: { fontSize: moderateScale(11), color: '#6B7280', fontStyle: 'italic' },
  histCancelBtn: {
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: moderateScale(10),
    paddingVertical: moderateScale(9), alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  histCancelBtnText: { fontSize: moderateScale(13), fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },

  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(24), width: '100%', position: 'absolute', bottom: 0, maxHeight: '60%' },
  handle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  sheetTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: moderateScale(16), textAlign: 'center' },
  sheetItem: { paddingVertical: moderateScale(16), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  sheetItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: moderateScale(10) },
  sheetItemText: { fontSize: moderateScale(15), color: '#4B5563', textAlign: 'center' },
  sheetItemActive: { color: '#6C5CE7', fontWeight: '800' },
});

export default LeaveApprovalScreen;

