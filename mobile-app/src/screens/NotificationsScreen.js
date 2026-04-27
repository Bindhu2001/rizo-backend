import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell, CheckCircle, Calendar, FileText, AlertCircle, X
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { getLoggedUser, getNotificationsLocal, markNotificationsAsReadLocal } from '../services/LocalDB';
import NotificationManager from '../services/NotificationManager';

// ─── Inline Calendar Picker ───────────────────────────────────────────────────
const DatePickerModal = ({ visible, selectedDate, onClose, onConfirm }) => {
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
      <TouchableOpacity style={dp.overlay} activeOpacity={1} onPress={onClose}>
        <View style={dp.box}>
          <View style={dp.header}>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month - 1, 1))} style={dp.arrowBtn}>
              <Image 
                source={require('../../assets/signup/arrow-right-02.png')} 
                style={{ width: 18, height: 18, tintColor: '#111827', transform: [{ rotate: '180deg' }] }} 
                resizeMode="contain"
              />
            </TouchableOpacity>
            <Text style={dp.headerTitle}>{monthNames[month]} {year}</Text>
            <TouchableOpacity onPress={() => setCurrentMonth(new Date(year, month + 1, 1))} style={dp.arrowBtn}>
              <Image 
                source={require('../../assets/signup/arrow-right-02.png')} 
                style={{ width: 18, height: 18, tintColor: '#111827' }} 
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
          <View style={dp.daysHeader}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(x => (
              <Text key={x} style={dp.dhText}>{x}</Text>
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
                  <Text style={[dp.cellText, isSelected && dp.cellTextSelected]}>{d || ''}</Text>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...SHADOWS.medium },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  arrowBtn: { padding: 6 },
  daysHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 8, marginBottom: 8 },
  dhText: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#6B7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSelected: { backgroundColor: COLORS.primaryDeep, borderRadius: 20 },
  cellText: { fontSize: 13, color: '#111827', fontWeight: '500' },
  cellTextSelected: { color: '#FFF', fontWeight: '800' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const NotificationsScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    loadData();
    NotificationManager.checkStatusChanges().then(() => loadData());
  }, []);

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

  const handleNotifClick = async (item) => {
    if (user && item.is_read === 0) {
      await markNotificationsAsReadLocal(user.user_id, item.id);
      loadData();
    }
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
        style={[styles.notifCard, isUnread && styles.unreadNotif]}
        activeOpacity={0.7}
        onPress={() => handleNotifClick(item)}
      >
        <View style={[styles.iconBox, { backgroundColor: getBgColorForType(item.message) }]}>
          {getIconForType(item.message)}
        </View>
        <View style={styles.notifMain}>
          <View style={styles.notifTop}>
            <Text style={[styles.notifTitle, isUnread && styles.unreadTitle]}>{item.title}</Text>
            <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.notifSub} numberOfLines={2}>{item.message}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Image 
            source={require('../../assets/signup/arrow-right-02.png')} 
            style={{ width: 24, height: 24, tintColor: COLORS.text, transform: [{ rotate: '180deg' }] }} 
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          style={[styles.headerIcon, selectedDate && styles.headerIconActive]}
          onPress={() => setShowCalendar(true)}
        >
          <Calendar color={selectedDate ? COLORS.primaryDeep : COLORS.text} size={22} />
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

      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>{unreadCount} Unread Notifications</Text>
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
          ListEmptyComponent={(
            <View style={styles.emptyGroup}>
              <Bell color={COLORS.textMuted} size={60} style={{ marginBottom: 20 }} />
              <Text style={styles.emptyTitle}>
                {selectedDate ? 'No notifications on this date' : 'All caught up!'}
              </Text>
              <Text style={styles.emptySub}>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerIconActive: { backgroundColor: '#F3E8FF', borderRadius: 12 },

  filterBar: { paddingHorizontal: 16, paddingBottom: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#F3E8FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  filterChipText: { fontSize: 12, fontWeight: '700', color: COLORS.primaryDeep },
  filterClearBtn: { marginLeft: 2, padding: 2 },

  summaryBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  summaryText: { fontSize: 12, fontWeight: '800', color: COLORS.textLight, paddingVertical: 14 },
  markAll: { fontSize: 12, fontWeight: '800', color: COLORS.primaryDeep },

  list: { padding: 20 },
  notifCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    padding: 16, borderRadius: 24, marginBottom: 16, ...SHADOWS.light,
    borderWidth: 1, borderColor: '#F3F4F6'
  },
  unreadNotif: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  notifMain: { flex: 1 },
  notifTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  notifTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  unreadTitle: { color: COLORS.primaryDeep },
  notifTime: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700' },
  notifSub: { fontSize: 13, color: COLORS.textLight, lineHeight: 18, fontWeight: '500' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primaryDeep, marginLeft: 12 },

  emptyGroup: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: COLORS.textLight, fontWeight: '500', textAlign: 'center', paddingHorizontal: 20 },
});

export default NotificationsScreen;
