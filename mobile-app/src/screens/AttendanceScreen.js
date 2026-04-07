import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, Dimensions, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ChevronLeft, Calendar as CalendarIcon, Clock, 
  MapPin, Fingerprint, History, Info, ChevronRight, Download, WifiOff
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { getTodayLocalHistory, getPendingCount, initDB } from '../services/LocalDB';
import * as Location from 'expo-location';
import axios from 'axios';
import { API_ENDPOINTS } from '../constants/Config';

const API_URL = API_ENDPOINTS.ATTENDANCE;

const HistoryItem = ({ item, index, isLast }) => {
  const isPunchIn = item.type === 'IN';
  const iconBg = isPunchIn ? '#E8F5E9' : '#FFF0F0';
  const iconColor = isPunchIn ? '#2ECC71' : '#EF4444';
  const statusColor = item.sync_status === 'SYNCED' ? '#10B981' : '#F59E0B';
  const statusText = item.sync_status === 'SYNCED' ? 'Synced' : 'Not Synced';

  const [address, setAddress] = useState(item.address || null);

  useEffect(() => {
    const isInvalid = !address || 
      address.includes('Fetching') || 
      address.includes('attached') || 
      (!isNaN(parseFloat(address.split(',')[0])) && address.includes('.'));
      
    if (isInvalid && item.latitude && item.longitude) {
      reverseGeocode();
    }
  }, [item.latitude, item.longitude]);

  const reverseGeocode = async () => {
    try {
      let geo = await Location.reverseGeocodeAsync({ 
        latitude: Number(item.latitude), 
        longitude: Number(item.longitude) 
      });
      if (geo && geo.length > 0) {
        const r = geo[0];
        const parts = [
          r.name || r.street,
          r.district || r.subregion || r.city,
          r.region,
        ].filter(Boolean);
        const unique = [...new Set(parts)];
        setAddress(unique.join(', '));
      }
    } catch (e) {
      console.log('Geocode error', e);
    }
  };

  // Format time properly
  const time = new Date(item.punch_time || item.punchTime || Date.now()).toLocaleTimeString([], { 
    hour: '2-digit', minute: '2-digit', hour12: true 
  });
  const date = new Date(item.punch_time || item.punchTime || Date.now()).toLocaleDateString([], {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return (
    <View style={[styles.historyCard, !isLast && styles.historyBorder]}>
      <View style={[styles.historyIcon, { backgroundColor: iconBg }]}>
        <Clock color={iconColor} size={20} strokeWidth={2.5} />
      </View>
      <View style={styles.historyMain}>
        <Text style={styles.historyType}>{isPunchIn ? 'Check In' : 'Check Out'}</Text>
        <View style={styles.locRow}>
          <MapPin color={COLORS.textMuted} size={10} />
          <Text style={styles.historyLoc}>
             {address || (item.latitude ? 'Loading location...' : date)}
          </Text>
        </View>
      </View>
      <View style={styles.historyEnd}>
        <Text style={styles.historyTime}>{time}</Text>
        <View style={[styles.syncBadge, { backgroundColor: statusColor + '15', flexDirection: 'row', alignItems: 'center' }]}>
          {item.sync_status !== 'SYNCED' && <WifiOff size={10} color={statusColor} style={{ marginRight: 4 }} />}
          <Text style={[styles.syncText, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>
    </View>
  );
};

const AttendanceScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100056' };
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [offlineCount, setOfflineCount] = useState(0);

  useEffect(() => {
    fetchHistory();
    const unsubscribe = navigation.addListener('focus', () => fetchHistory());
    return unsubscribe;
  }, [navigation]);

  const fetchHistory = async () => {
    try {
      const localPunches = await getTodayLocalHistory(user.user_id);
      setHistory(localPunches);
      
      const count = await getPendingCount();
      setOfflineCount(count);

      // Try cloud history merge
      const response = await axios.get(`${API_URL}/history/${user.user_id}`, { timeout: 7000 });
      if (response.data && Array.isArray(response.data)) {
        // Map server punches to ensure they show as SYNCED
        const serverPunches = response.data.map(p => ({
            ...p,
            sync_status: 'SYNCED',
            // Normalize time field
            punch_time: p.punch_time || p.punchTime
        }));
        
        // Merge local and server punches
        // Rule: if a local punch exists, and it's pending, it's unique.
        // If a local punch is synced, it's likely already in the server list.
        // We'll deduplicate based on time (within 1 minute) and type.
        
        const merged = [...localPunches];
        
        serverPunches.forEach(srv => {
            const srvTime = new Date(srv.punch_time).getTime();
            const exists = localPunches.some(loc => {
                const locTime = new Date(loc.punch_time).getTime();
                const diff = Math.abs(srvTime - locTime);
                return diff < 60000 && loc.type === srv.type; // 1 min threshold
            });
            
            if (!exists) {
                merged.push(srv);
            }
        });

        const sorted = merged.sort((a, b) => {
           const timeA = new Date(a.punch_time).getTime();
           const timeB = new Date(b.punch_time).getTime();
           return timeB - timeA; // Descending
        });
        
        setHistory(sorted);
      }
    } catch (e) {
      console.log('History Fetch: Using local only', e.message);
    } finally {
      setLoading(false);
    }
  };

  let durationText = '';
  if (history && history.length >= 2) {
    if (history[0].type === 'OUT' && history[1].type === 'IN') {
       const outDate = new Date(history[0].punch_time || history[0].punchTime);
       const inDate = new Date(history[1].punch_time || history[1].punchTime);
       const diffMs = outDate - inDate;
       if (diffMs > 0) {
          const hrs = Math.floor(diffMs / (1000 * 60 * 60));
          const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          durationText = `${hrs}h ${mins}m`;
       }
    }
  }

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primaryDeep} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance History</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <Download color={COLORS.text} size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.syncBanner}>
        <Text style={styles.syncBannerText}>
          {offlineCount > 0 ? `📡 ${offlineCount} punches waiting to sync` : '✅ All punches synced'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* Stats Summary */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{(history || []).length}</Text>
            <Text style={styles.statLabel}>Total Punches</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
             <Text style={styles.statVal}>{durationText || '--'}</Text>
             <Text style={styles.statLabel}>Current Duration</Text>
          </View>
        </View>

        {/* History List */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.historyList}>
          {history.length === 0 ? (
            <View style={styles.empty}>
              <History color={COLORS.textMuted} size={40} />
              <Text style={styles.emptyText}>No history records found</Text>
            </View>
          ) : (
            history.map((item, index) => (
              <HistoryItem 
                key={item.id || index} 
                item={item} 
                index={index} 
                isLast={index === history.length - 1} 
              />
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },

  syncBanner: { backgroundColor: COLORS.primaryDeep, paddingVertical: 8, alignItems: 'center' },
  syncBannerText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Stats
  statsCard: { 
    backgroundColor: COLORS.primaryDeep, borderRadius: 24, padding: 20, 
    flexDirection: 'row', alignItems: 'center', marginBottom: 32, ...SHADOWS.medium 
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },

  // List
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 16, marginLeft: 4 },
  historyList: { backgroundColor: '#FFF', borderRadius: 24, padding: 8, ...SHADOWS.light },
  historyCard: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  historyIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  historyMain: { flex: 1 },
  historyType: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  locRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  historyLoc: { fontSize: 11, color: COLORS.textLight, fontWeight: '600', marginLeft: 4 },
  historyEnd: { alignItems: 'flex-end' },
  historyTime: { fontSize: 14, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  syncBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  syncText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { marginTop: 16, color: COLORS.textMuted, fontSize: 14, fontWeight: '600' }
});

export default AttendanceScreen;
