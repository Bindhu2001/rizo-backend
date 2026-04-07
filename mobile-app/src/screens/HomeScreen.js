import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Animated, Easing, Modal, ActivityIndicator, Alert, Dimensions, LayoutAnimation, UIManager, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Clock, MapPin, Bell, Briefcase, DollarSign, FileText,
  ChevronRight, ChevronDown, ChevronUp, Calendar as CalendarIcon, Gift, Power, Fingerprint, History, Navigation
} from 'lucide-react-native';
import axios from 'axios';
import * as Location from 'expo-location';
import * as Network from 'expo-network';

import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import SwipeToPunch from '../components/SwipeToPunch';
import CalendarWidget from '../components/CalendarWidget';
import { API_ENDPOINTS } from '../constants/Config';
import {
  savePunchLocal, getTodayLocalHistory, getLastPunchType,
  getPendingCount, initDB
} from '../services/LocalDB';
import SyncService from '../services/SyncService';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_URL = API_ENDPOINTS.ATTENDANCE;
const OFFICE_API_URL = API_ENDPOINTS.OFFICE;

const HomeScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { employee_name: 'Tahaniya', user_id: '1' };

  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [status, setStatus] = useState({ lastType: 'NONE', todayHistory: [] });
  const [locationName, setLocationName] = useState('Fetching location...');
  const [showConfirmOut, setShowConfirmOut] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const lastActionTime = useRef(0);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [cancelTrigger, setCancelTrigger] = useState(0);

  const toggleEvents = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEventsOpen(!eventsOpen);
  };

  // ── Initialization ────────────────────────────────────────────────────────
  useEffect(() => {
    initDB().then(() => {
      fetchStatus();
      checkOfflinePunches();
    });
    fetchLocation();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchStatus();
      checkOfflinePunches();
    });

    const syncTimer = setInterval(() => SyncService.syncAll(), 60000);
    return () => {
      unsubscribe();
      clearInterval(syncTimer);
    };
  }, [navigation]);

  // ── Location: high accuracy + human-readable name ─────────────────────────
  const fetchLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationName('Location access denied');
        return;
      }
      let loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = loc.coords;

      try {
        let geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo && geo.length > 0) {
          const r = geo[0];
          // Build a readable string: Street/Area, City, Region
          const parts = [
            r.name || r.street,
            r.district || r.subregion || r.city,
            r.region,
          ].filter(Boolean);
          const unique = [...new Set(parts)];
          setLocationName(unique.join(', ') || 'Location attached');
        } else {
          setLocationName('Location attached');
        }
      } catch (_) {
        setLocationName('Location attached');
      }
    } catch (e) {
      console.log('Loc Fetch Error', e);
      setLocationName('Location unavailable');
    }
  };

  // ── Status ────────────────────────────────────────────────────────────────
  const fetchStatus = async () => {
    try {
      const localType = await getLastPunchType(user.user_id);
      setIsPunchedIn(localType === 'IN');
      setStatus(prev => ({ ...prev, lastType: localType }));
    } catch (e) { } finally { setLoading(false); }

    try {
      const response = await axios.get(`${API_URL}/status/${user.user_id}`, { timeout: 6000 });
      if (response.data) {
        // PERFECTION GUARD: 
        // 1. Only pull from server if local DB is fully synced
        // 2. ONLY overwrite if it's been > 60s since the last user action (to avoid state reversal)
        const pCnt = await getPendingCount();
        const secondsSinceAction = (Date.now() - lastActionTime.current) / 1000;
        
        if (pCnt === 0 && secondsSinceAction > 60) {
          setStatus(response.data);
          setIsPunchedIn(response.data.lastType === 'IN');
          console.log('[Home] Server state synced successfully');
        } else {
          console.log(`[Home] Server state ignored (Sync pending or recent action within ${Math.round(secondsSinceAction)}s)`);
        }
      }
    } catch (e) {
      console.log('[Home] Cloud status fetch skipped (Offline/Server Unreachable)');
    }
  };

  const checkOfflinePunches = async () => {
    const count = await getPendingCount();
    setOfflineCount(count);
  };

  const syncOfflinePunches = async () => {
    await SyncService.syncAll();
    checkOfflinePunches();
    fetchStatus();
  };

  // ── Punch ─────────────────────────────────────────────────────────────────
  const handleSwipeComplete = () => {
    const nextType = isPunchedIn ? 'OUT' : 'IN';
    if (nextType === 'OUT') {
      setShowConfirmOut(true);
    } else {
      processPunch('IN');
    }
  };

  const processPunch = async (type) => {
    if (punching) return;
    setPunching(true);
    setShowConfirmOut(false);

    const localLastType = await getLastPunchType(user.user_id);
    if (localLastType === type.toUpperCase()) {
      Alert.alert('Sequence Warning', `You are already punched ${type}.`);
      setPunching(false);
      return;
    }

    const previousState = isPunchedIn;
    lastActionTime.current = Date.now();
    const punchTime = new Date().toISOString();

    try {
      let loc = { coords: { latitude: 0, longitude: 0 } };
      try {
        loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
      } catch (_) {
        try {
          const lastLoc = await Location.getLastKnownPositionAsync();
          if (lastLoc) loc = lastLoc;
        } catch(e) {}
      }

      const savedId = await savePunchLocal({
        userId: user.user_id,
        type,
        punchTime,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address: locationName,
      });

      if (!savedId) {
        Alert.alert('Sequence Blocked', `Cannot record two ${type}s in a row.`);
        setPunching(false);
        return;
      }
      
      // Update UI state only after successful local save
      setIsPunchedIn(type === 'IN');

      await checkOfflinePunches();

      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        syncOfflinePunches();
      } else {
        Alert.alert('📡 Offline', 'Punch saved locally. Will sync automatically.');
      }

      fetchStatus();
    } catch (e) {
      console.error(e);
      Alert.alert('❌ Error', 'Failed to save punch locally.\n\nDetails: ' + e.message);
    } finally {
      setPunching(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning,';
    if (h < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.greetingHeader}>{getGreeting()}</Text>
            <Text style={styles.userNameHeader} numberOfLines={1}>{user.employee_name || user.name}</Text>
            <View style={styles.locationBadge}>
              <MapPin color={COLORS.textLight} size={12} />
              <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {offlineCount > 0 && (
              <TouchableOpacity style={[styles.headerIcon, { backgroundColor: COLORS.primaryDeep, marginRight: 8 }]} onPress={syncOfflinePunches}>
                <History color="#FFF" size={18} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.navigate('Notifications')}>
              <Bell color={COLORS.text} size={22} />
              {offlineCount > 0 && <View style={styles.offlineDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarCircle} onPress={() => navigation.navigate('ProfileTab')}>
              <Image
                source={{ uri: user.profile_pic || `https://i.pravatar.cc/100?u=${user.user_id}` }}
                style={styles.avatar}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* SWIPE ACTION */}
        <View style={styles.swipeBox}>
          <SwipeToPunch
            isPunchedIn={isPunchedIn}
            loading={punching}
            onSwipeComplete={handleSwipeComplete}
            resetTrigger={cancelTrigger}
          />
        </View>

        {/* 2×2 GRID */}
        <View style={styles.grid}>
          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('HistoryTab')}>
            <View style={[styles.gridIcon, { backgroundColor: '#E8F5E9' }]}>
              <Fingerprint color="#2ECC71" size={20} />
            </View>
            <Text style={styles.gridVal}>Attendance</Text>
            <Text style={styles.gridLabel}>View History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('Salary')}>
            <View style={[styles.gridIcon, { backgroundColor: '#FFF9C4' }]}>
              <DollarSign color="#F1C40F" size={20} />
            </View>
            <Text style={styles.gridVal}>Salary</Text>
            <Text style={styles.gridLabel}>Check Payroll</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('LeaveTab')}>
            <View style={[styles.gridIcon, { backgroundColor: '#F3E5F5' }]}>
              <Briefcase color={COLORS.primaryDeep} size={20} />
            </View>
            <Text style={styles.gridVal}>Leave</Text>
            <Text style={styles.gridLabel}>Apply / View</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('Expense')}>
            <View style={[styles.gridIcon, { backgroundColor: '#FFEBEE' }]}>
              <FileText color="#E91E63" size={20} />
            </View>
            <Text style={styles.gridVal}>Expense</Text>
            <Text style={styles.gridLabel}>Add / Track</Text>
          </TouchableOpacity>
        </View>

        {/* CLIENT VISIT */}
        <TouchableOpacity 
          style={styles.visitButton} 
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Visits')}
        >
          <View style={styles.visitButtonLeft}>
            <View style={styles.visitIconBox}>
              <Navigation color="#FFF" size={20} />
            </View>
            <View>
              <Text style={styles.visitBtnTitle}>Client Visit</Text>
              <Text style={styles.visitBtnSub}>Track your client meetings</Text>
            </View>
          </View>
          <ChevronRight color={COLORS.textLight} size={20} />
        </TouchableOpacity>

        {/* REGULARIZATION */}
        <TouchableOpacity 
          style={[styles.visitButton, { marginBottom: 24, marginTop: -12 }]} 
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AttendanceReg')}
        >
          <View style={styles.visitButtonLeft}>
            <View style={[styles.visitIconBox, { backgroundColor: '#FF9800' }]}>
              <History color="#FFF" size={20} />
            </View>
            <View>
              <Text style={styles.visitBtnTitle}>Regularization</Text>
              <Text style={styles.visitBtnSub}>Late In / Early Out requests</Text>
            </View>
          </View>
          <ChevronRight color={COLORS.textLight} size={20} />
        </TouchableOpacity>

        {/* UPCOMING EVENTS DROPDOWN */}
        <View style={styles.eventsSection}>
          <TouchableOpacity style={styles.eventsHeader} onPress={toggleEvents} activeOpacity={0.8}>
            <View style={styles.eventsHeaderLeft}>
              <CalendarIcon color={COLORS.primaryDeep} size={20} />
              <Text style={styles.eventsSectionTitle}>Upcoming Events</Text>
            </View>
            {eventsOpen
              ? <ChevronUp color={COLORS.textLight} size={20} />
              : <ChevronDown color={COLORS.textLight} size={20} />
            }
          </TouchableOpacity>

          {eventsOpen && (
            <View style={{ padding: 12 }}>
              <CalendarWidget userId={user.user_id} />
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CLOCK OUT MODAL */}
      <Modal visible={showConfirmOut} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalPowerCircle}>
              <Power color={COLORS.danger} size={32} />
            </View>
            <Text style={styles.modalTitle}>Clock Out?</Text>
            <Text style={styles.modalSub}>Your working hours will end. Are you sure you want to clock out?</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                setShowConfirmOut(false);
                setCancelTrigger(prev => prev + 1);
              }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutBtn} onPress={() => processPunch('OUT')}>
                <Text style={styles.logoutBtnText}>Clock Out</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greetingHeader: { fontSize: 13, color: COLORS.textLight, fontWeight: '600' },
  userNameHeader: { fontSize: 24, fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 11, color: COLORS.textLight, marginLeft: 4, fontWeight: '600', flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 10, ...SHADOWS.light },
  offlineDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.primary, borderWidth: 1.5, borderColor: '#FFF' },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#FFF', ...SHADOWS.light },
  avatar: { width: '100%', height: '100%' },

  swipeBox: { marginBottom: 24 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  gridCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, ...SHADOWS.light },
  gridIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  gridVal: { fontSize: 16, fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  gridLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '500' },

  // Visit Button
  visitButton: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 24, ...SHADOWS.light 
  },
  visitButtonLeft: { flexDirection: 'row', alignItems: 'center' },
  visitIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryDeep, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  visitBtnTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  visitBtnSub: { fontSize: 11, color: COLORS.textLight, fontWeight: '600' },

  // Events Dropdown
  eventsSection: { backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden', ...SHADOWS.light, marginBottom: 16 },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  eventsHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  eventsSectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginLeft: 10 },
  eventsBody: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingHorizontal: 18, paddingBottom: 12, paddingTop: 4 },
  eventsLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  eventsLoadingText: { marginLeft: 10, color: COLORS.textLight, fontWeight: '600' },
  eventsEmpty: { color: COLORS.textLight, textAlign: 'center', paddingVertical: 20, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  eventName: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  eventMeta: { fontSize: 11, color: COLORS.textLight, marginTop: 2, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: 32, padding: 24, alignItems: 'center' },
  modalPowerCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#FFE4E4' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  modalSub: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  modalBtns: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, paddingVertical: 16, marginRight: 12, borderRadius: 16, borderWidth: 1, borderColor: '#EEF2F7', alignItems: 'center', backgroundColor: '#F9FAFB' },
  cancelBtnText: { color: COLORS.textLight, fontWeight: '700' },
  logoutBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: COLORS.danger, alignItems: 'center' },
  logoutBtnText: { color: '#FFF', fontWeight: '800' },
});

export default HomeScreen;
