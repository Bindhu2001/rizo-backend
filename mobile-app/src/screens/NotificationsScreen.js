import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Bell, CheckCircle, Calendar, FileText, AlertCircle,
  ChevronLeft, MoreHorizontal, Circle, ArrowRight
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { getLoggedUser, getNotificationsLocal, markNotificationsAsReadLocal } from '../services/LocalDB';
import NotificationManager from '../services/NotificationManager';

const NotificationsScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
    // Also trigger a background check when screen opens
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
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <MoreHorizontal color={COLORS.text} size={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {notifications.filter(n => n.is_read === 0).length} Unread Notifications
        </Text>
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
          data={notifications}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={(
            <View style={styles.emptyGroup}>
              <Bell color={COLORS.textMuted} size={60} style={{ marginBottom: 20 }} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySub}>No new notifications for you</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  
  summaryBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, py: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
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
  emptySub: { fontSize: 14, color: COLORS.textLight, fontWeight: '500' }
});

export default NotificationsScreen;
