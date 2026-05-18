import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell, CheckCircle, Calendar, FileText, AlertCircle, X,
  ChevronLeft, ChevronRight
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS , moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { getLoggedUser, getNotificationsLocal, markNotificationsAsReadLocal } from '../services/LocalDB';
import NotificationManager from '../services/NotificationManager';

// ─── Inline Calendar Picker ───────────────────────────────────────────────────
const DatePickerModal = ({ visible, selectedDate, onClose, onConfirm }) => {
  const theme = useTheme();
  const [currentMonth, setCurrentMonth] = useState(selectedDate ? new Date(selectedDate) : new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const handleSelect = (d) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onConfirm(`${year}-${mm}-${dd}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={[dp.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
        <View style={[dp.box, { backgroundColor: theme.card }]}>
          <View style={dp.header}>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month - 1, 1))} style={dp.arrowBtn}>
               <ChevronLeft color={theme.text} size={20} />
            </TouchableOpacity>
            <Text style={[dp.headerTitle, { color: theme.text }]}>{monthNames[month]} {year}</Text>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={dp.arrowBtn}>
               <ChevronRight color={theme.text} size={20} />
            </TouchableOpacity>
          </View>
          <View style={[dp.daysHeader, { borderBottomColor: theme.divider }]}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(x => (
              <Text key={x} style={[dp.dhText, { color: theme.textLight }]}>{x}</Text>
            ))}
          </View>
          <View style={dp.grid}>
            {days.map((d, i) => {
              const dateStr = d ? `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
              const isSelected = dateStr === selectedDate;
              return (
                <TouchableOpacity
                  key={i}
                  style={[dp.cell, isSelected && dp.cellSelected]}
                  onPress={() => d && handleSelect(d)}
                  disabled={!d}
                >
                  <Text style={[dp.cellText, { color: theme.text }, isSelected && dp.cellTextSelected]}>{d || ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const dp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: moderateScale(24) },
  box: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), ...SHADOWS.medium },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: moderateScale(16) },
  headerTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },
  arrowBtn: { padding: moderateScale(6) },
  daysHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: moderateScale(8), marginBottom: moderateScale(8) },
  dhText: { flex: 1, textAlign: 'center', fontSize: moderateScale(12), fontWeight: '700', color: '#6B7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSelected: { backgroundColor: COLORS.primaryDeep, borderRadius: moderateScale(20) },
  cellText: { fontSize: moderateScale(13), color: '#111827', fontWeight: '500' },
  cellTextSelected: { color: '#FFF', fontWeight: '800' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const NotificationsScreen = ({ navigation }) => {
  const theme = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);

  useEffect(() => {
    loadData();
    NotificationManager.checkStatusChanges().then(() => loadData());
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const loadData = async () => {
    const u = await getLoggedUser();
    if (u) {
      setUser(u);
      const notifs = await getNotificationsLocal(u.user_id);
      setNotifications(notifs);
    }
    setLoading(false);
  };

  const handleMarkAllRead = async () => {
    if (user) {
      await markNotificationsAsReadLocal(user.user_id);
      loadData();
    }
  };

  const handleNotifClick = (item) => {
    setSelectedNotif(item);
  };

  const handleMarkRead = async () => {
    if (user && selectedNotif && selectedNotif.is_read === 0) {
      await markNotificationsAsReadLocal(user.user_id, selectedNotif.id);
      loadData();
    }
    setSelectedNotif(null);
  };

  const filteredNotifications = selectedDate
    ? notifications.filter(n => n.created_at && n.created_at.startsWith(selectedDate))
    : notifications;

  const unreadCount = filteredNotifications.filter(n => n.is_read === 0).length;

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) { return dateStr; }
  };

  const getIconForType = (message) => {
    const msg = message.toLowerCase();
    if (msg.includes('approve')) return <CheckCircle color="#2ECC71" size={20} />;
    if (msg.includes('reject')) return <AlertCircle color="#F44336" size={20} />;
    if (msg.includes('expense')) return <FileText color="#3498DB" size={20} />;
    return <Bell color="#FF9800" size={20} />;
  };

  const getBgColorForType = (message) => {
    const msg = message.toLowerCase();
    if (msg.includes('approve')) return '#E8F5E9';
    if (msg.includes('reject')) return '#FFF0F0';
    if (msg.includes('expense')) return '#E3F2FD';
    return '#FFF3E0';
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 60) return `${diffMins || 1} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return `Yesterday`;
    return `${diffDays} days ago`;
  };

  const renderItem = ({ item }) => {
    const isUnread = item.is_read === 0;
    return (
      <TouchableOpacity
        style={[styles.notifCard, { backgroundColor: theme.card, borderColor: theme.border }, isUnread && styles.unreadNotif]}
        activeOpacity={0.7}
        onPress={() => handleNotifClick(item)}
      >
        <View style={[styles.iconBox, { backgroundColor: getBgColorForType(item.message) }]}>
          {getIconForType(item.message)}
        </View>
        <View style={styles.notifMain}>
          <View style={styles.notifTop}>
            <Text style={[styles.notifTitle, { color: theme.text }, isUnread && styles.unreadTitle]}>{item.title}</Text>
            <Text style={[styles.notifTime, { color: theme.textMuted }]}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Notifications</Text>
        <TouchableOpacity
          style={[styles.headerIcon, selectedDate && styles.headerIconActive]}
          onPress={() => setShowCalendar(true)}
        >
          <Calendar color={selectedDate ? COLORS.primaryDeep : theme.text} size={22} />
        </TouchableOpacity>
      </View>

      {/* Active date filter chip */}
      {selectedDate && (
        <View style={styles.filterBar}>
          <View style={styles.filterChip}>
            <Calendar color={COLORS.primaryDeep} size={13} />
            <Text style={styles.filterChipText}>{formatDateLabel(selectedDate)}</Text>
            <TouchableOpacity onPress={() => setSelectedDate(null)} style={styles.filterClearBtn}>
              <X color={COLORS.primaryDeep} size={13} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={[styles.summaryBar, { backgroundColor: theme.card, borderBottomColor: theme.divider }]}>
        <Text style={[styles.summaryText, { color: theme.textLight }]}>{unreadCount} Unread Notifications</Text>
        <TouchableOpacity onPress={handleMarkAllRead}>
          <Text style={styles.markAll}>Mark all as read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyGroup}>
          <ActivityIndicator size="large" color={COLORS.primaryDeep} />
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={(
            <View style={styles.emptyGroup}>
              <Bell color={theme.textMuted} size={60} style={{ marginBottom: 20 }} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {selectedDate ? 'No notifications on this date' : 'All caught up!'}
              </Text>
              <Text style={[styles.emptySub, { color: theme.textLight }]}>
                {selectedDate ? `Nothing found for ${formatDateLabel(selectedDate)}` : 'No new notifications for you'}
              </Text>
            </View>
          )}
        />
      )}

      <DatePickerModal
        visible={showCalendar}
        selectedDate={selectedDate}
        onClose={() => setShowCalendar(false)}
        onConfirm={(date) => setSelectedDate(date)}
      />

      {/* Notification Detail Modal */}
      <Modal visible={!!selectedNotif} transparent animationType="fade" onRequestClose={() => setSelectedNotif(null)} statusBarTranslucent>
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={[styles.modalIconBox, { backgroundColor: selectedNotif ? getBgColorForType(selectedNotif.message) : '#FFF3E0' }]}>
              {selectedNotif ? getIconForType(selectedNotif.message) : null}
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedNotif?.title}</Text>
            <Text style={[styles.modalTime, { color: theme.textMuted }]}>{selectedNotif ? formatTime(selectedNotif.created_at) : ''}</Text>
            <Text style={[styles.modalMessage, { color: theme.textLight }]}>{selectedNotif?.message}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBackBtn, { borderColor: theme.border }]} onPress={handleMarkRead}>
                <ChevronLeft color={theme.text} size={18} />
                <Text style={[styles.modalBackText, { color: theme.text }]}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16), height: moderateScale(60) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text },
  headerIcon: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerIconActive: { backgroundColor: '#F3E8FF', borderRadius: moderateScale(12) },

  filterBar: { paddingHorizontal: moderateScale(16), paddingBottom: moderateScale(8) },
  filterChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#F3E8FF', borderRadius: moderateScale(20), paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(6), gap: moderateScale(6) },
  filterChipText: { fontSize: moderateScale(12), fontWeight: '700', color: COLORS.primaryDeep },
  filterClearBtn: { marginLeft: 2, padding: 2 },

  summaryBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: moderateScale(20), backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  summaryText: { fontSize: moderateScale(12), fontWeight: '800', color: COLORS.textLight, paddingVertical: moderateScale(14) },
  markAll: { fontSize: moderateScale(12), fontWeight: '800', color: COLORS.primaryDeep },

  list: { padding: moderateScale(20), paddingBottom: moderateScale(110) },
  notifCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    padding: moderateScale(16), borderRadius: moderateScale(24), marginBottom: moderateScale(16), ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6'
  },
  unreadNotif: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  iconBox: { width: moderateScale(48), height: moderateScale(48), borderRadius: moderateScale(16), justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(16) },
  notifMain: { flex: 1 },
  notifTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  notifTitle: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text },
  unreadTitle: { color: COLORS.primaryDeep },
  notifTime: { fontSize: moderateScale(10), color: COLORS.textMuted, fontWeight: '700' },
  notifSub: { fontSize: moderateScale(13), color: COLORS.textLight, lineHeight: 18, fontWeight: '500' },
  unreadDot: { width: moderateScale(10), height: moderateScale(10), borderRadius: 5, backgroundColor: COLORS.primaryDeep, marginLeft: moderateScale(12) },

  emptyGroup: { alignItems: 'center', justifyContent: 'center', marginTop: moderateScale(100) },
  emptyTitle: { fontSize: moderateScale(20), fontWeight: '900', color: COLORS.text, marginBottom: moderateScale(8) },
  emptySub: { fontSize: moderateScale(14), color: COLORS.textLight, fontWeight: '500', textAlign: 'center', paddingHorizontal: moderateScale(20) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: moderateScale(24) },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: moderateScale(28), padding: moderateScale(28), alignItems: 'center', ...SHADOWS.medium },
  modalIconBox: { width: moderateScale(64), height: moderateScale(64), borderRadius: moderateScale(20), justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(16) },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  modalTime: { fontSize: moderateScale(11), fontWeight: '700', color: COLORS.textMuted, marginBottom: moderateScale(16) },
  modalMessage: { fontSize: moderateScale(14), color: COLORS.textLight, lineHeight: 22, textAlign: 'center', marginBottom: moderateScale(28) },
  modalActions: { flexDirection: 'row', gap: moderateScale(12), width: '100%' },
  modalBackBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: moderateScale(14), borderRadius: moderateScale(16), borderWidth: 1, borderColor: '#E5E7EB', gap: 4 },
  modalBackText: { fontSize: moderateScale(14), fontWeight: '700', color: COLORS.text },
  modalMarkBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: moderateScale(14), borderRadius: moderateScale(16), backgroundColor: COLORS.primaryDeep, gap: moderateScale(8) },
  modalMarkText: { fontSize: moderateScale(14), fontWeight: '700', color: '#FFF' },
});

export default NotificationsScreen;

