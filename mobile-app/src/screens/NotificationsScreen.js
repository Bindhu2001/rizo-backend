import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Bell, CheckCircle, Calendar, FileText, AlertCircle,
  ChevronLeft, MoreHorizontal, Circle, ArrowRight
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';

const NotificationsScreen = ({ navigation }) => {
  const notifications = [
    {
      id: '1',
      title: 'Leave Approved',
      message: 'Your Sick Leave for 12 Feb has been approved by HR.',
      time: '10 mins ago',
      icon: <CheckCircle color="#2ECC71" size={20} />,
      bgColor: '#E8F5E9',
      isUnread: true,
    },
    {
      id: '2',
      title: 'Missed Punch Out',
      message: 'You missed your punch out yesterday. Please request regularization.',
      time: '2 hours ago',
      icon: <AlertCircle color="#F44336" size={20} />,
      bgColor: '#FFF0F0',
      isUnread: true,
    },
    {
      id: '3',
      title: 'Expense Claim Updated',
      message: 'Your travel claim #EX102 was updated to Processing.',
      time: 'Yesterday',
      icon: <FileText color="#3498DB" size={20} />,
      bgColor: '#E3F2FD',
      isUnread: false,
    },
    {
      id: '4',
      title: 'System Maintenance',
      message: 'The HRMS portal will be down for maintenance this weekend.',
      time: '2 days ago',
      icon: <Bell color="#FF9800" size={20} />,
      bgColor: '#FFF3E0',
      isUnread: false,
    },
  ];

  const renderItem = ({ item }) => (
    <TouchableOpacity style={[styles.notifCard, item.isUnread && styles.unreadNotif]} activeOpacity={0.7}>
      <View style={[styles.iconBox, { backgroundColor: item.bgColor }]}>
        {item.icon}
      </View>
      <View style={styles.notifMain}>
        <View style={styles.notifTop}>
          <Text style={[styles.notifTitle, item.isUnread && styles.unreadTitle]}>{item.title}</Text>
          <Text style={styles.notifTime}>{item.time}</Text>
        </View>
        <Text style={styles.notifSub} numberOfLines={2}>{item.message}</Text>
      </View>
      {item.isUnread && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

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
        <Text style={styles.summaryText}>{notifications.filter(n => n.isUnread).length} Unread Notifications</Text>
        <TouchableOpacity><Text style={styles.markAll}>Mark all as read</Text></TouchableOpacity>
      </View>

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
