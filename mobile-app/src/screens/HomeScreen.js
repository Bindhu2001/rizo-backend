import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Animated, Easing, Modal, ActivityIndicator, Alert, Dimensions, LayoutAnimation, UIManager, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Clock, MapPin, Bell, Briefcase, DollarSign, FileText,
  ChevronRight, ChevronDown, ChevronUp, Calendar as CalendarIcon, Gift, Power, Fingerprint, History, Navigation, CloudOff
} from 'lucide-react-native';
import axios from 'axios';
import { format } from 'date-fns';
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
  const [punchMessage, setPunchMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  const toggleEvents = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEventsOpen(!eventsOpen);
  };

  // ── Initialization ────────────────────────────────────────────────────────
  useEffect(() => {
    let timerId;
    if (isPunchedIn) {
      timerId = setInterval(() => setCurrentTime(new Date()), 1000);
    }
    return () => clearInterval(timerId);
  }, [isPunchedIn]);

  useEffect(() => {
    initDB().then(() => {
      fetchStatus();
      checkOfflinePunches();
    });
    fetchLocation();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchStatus();
      checkOfflinePunches();
      // Re-try location every time screen is focused (covers GPS-off-then-on scenario)
      fetchLocation();
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
        // GUARD: Only use server state if local DB is fully synced
        // AND at least 30s have passed since the last punch (prevents state reversal)
        const pCnt = await getPendingCount();
        const timeSinceLastAction = Date.now() - lastActionTime.current;
        if (pCnt === 0 && timeSinceLastAction > 30000) {
          setStatus(response.data);
          setIsPunchedIn(response.data.lastType === 'IN');
          console.log('[Home] Server state synced successfully');
        } else {
          console.log(`[Home] Server state deferred (pCnt=${pCnt}, timeSince=${Math.round(timeSinceLastAction / 1000)}s)`);
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
    if (isPunchedIn) {
      setShowConfirmOut(true);
    } else {
      processPunch('IN');
    }
  };

  const processPunch = async (type) => {
    if (punching) return;
    setPunching(true);
    setShowConfirmOut(false);
    lastActionTime.current = Date.now();

    console.log(`[Punch] Initiating ${type} process...`);
    const punchTime = new Date().toISOString();

    try {
      // 1. Check network first so we can show the right message
      const net = await Network.getNetworkStateAsync();
      const isOffline = !net.isConnected;

      // 2. Fetch GPS location
      //    Offline → show visible message while GPS works (can take time)
      //    Online  → silent fetch, swipe button spinner is enough
      let loc = { coords: { latitude: 0, longitude: 0 } };
      if (isOffline) {
        setPunchMessage('Fetching your location...');
      }

      try {
        // 10s timeout — GPS needs warm-up time especially after being turned on
        loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        console.log(`[Punch] Location acquired: ${loc.coords.latitude}, ${loc.coords.longitude}`);
        if (isOffline) setPunchMessage('Location found — saving punch...');
      } catch (_) {
        // Try last-known position before giving up
        try {
          const lastLoc = await Location.getLastKnownPositionAsync();
          if (lastLoc) {
            loc = lastLoc;
            console.log(`[Punch] Using last-known location: ${loc.coords.latitude}, ${loc.coords.longitude}`);
            if (isOffline) setPunchMessage('Using last known location — saving punch...');
          } else {
            if (isOffline) setPunchMessage('Saving punch (location unavailable)...');
          }
        } catch (e) {
          if (isOffline) setPunchMessage('Saving punch (location unavailable)...');
        }
      }

      // 3. Reverse geocode the actual punch-time coords
      //    Do NOT use locationName state — it may be stale ("Location unavailable")
      let punchAddress = `Lat: ${loc.coords.latitude.toFixed(5)}, Lng: ${loc.coords.longitude.toFixed(5)}`;
      const { latitude, longitude } = loc.coords;
      if (Math.abs(latitude) > 0.0001) {
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (geo && geo.length > 0) {
            const r = geo[0];
            const parts = [r.name || r.street, r.district || r.subregion || r.city, r.region].filter(Boolean);
            if (parts.length > 0) {
              punchAddress = [...new Set(parts)].join(', ');
            }
          }
        } catch (_) {}
        // Update the header location badge too
        setLocationName(punchAddress);
      }

      console.log(`[Punch] Address: ${punchAddress}`);

      // 4. Save punch locally
      const savedId = await savePunchLocal({
        userId: user.user_id,
        type,
        punchTime,
        latitude,
        longitude,
        address: punchAddress,
        isOffline,
      });

      if (!savedId) {
        console.log(`[Punch] ${type} blocked (Duplicate sequence detected)`);
        setPunching(false);
        await fetchStatus();
        return;
      }

      console.log(`[Punch] ${type} saved locally: ${savedId}`);

      // 5. Update UI state
      const isNowIn = type === 'IN';
      setIsPunchedIn(isNowIn);

      // 6. Background sync
      checkOfflinePunches();
      if (net.isConnected) {
        SyncService.syncAll().then(() => fetchStatus());
      } else {
        await fetchStatus();
      }
    } catch (e) {
      console.error('[Punch] Error:', e);
      Alert.alert('Error', 'Failed to process punch.\n\n' + e.message);
    } finally {
      setPunching(false);
      setPunchMessage('');
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
          <View style={styles.logoAndGreeting}>
            <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
            <View>
              <Text style={styles.greetingHeader}>{getGreeting()}</Text>
              <Text style={styles.userNameHeader} numberOfLines={1}>{user.employee_name || user.name}</Text>
              <View style={styles.locationBadge}>
                <MapPin color={COLORS.textLight} size={12} />
                <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
              </View>
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

        {/* SWIPE / TIMER ACTION */}
        <View style={styles.swipeBox}>
          {isPunchedIn ? (
            <View style={styles.punchedInCard}>
              <View style={styles.punchedInLeft}>
                {offlineCount > 0 ? (
                  <CloudOff color={COLORS.danger} size={20} />
                ) : (
                  <MapPin color={COLORS.danger} size={20} />
                )}
                <View style={styles.punchedInTextStack}>
                  <Text style={styles.punchedInTime}>{format(currentTime, 'hh:mm:ss a, dd MMM yyyy')}</Text>
                  <Text style={styles.punchedInLoc} numberOfLines={1}>{locationName}</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.clockOutBtn} 
                onPress={() => setShowConfirmOut(true)}
                disabled={punching}
              >
                {punching ? <ActivityIndicator color={COLORS.danger} size="small" /> : <Power color={COLORS.danger} size={20} strokeWidth={2.5} />}
              </TouchableOpacity>
            </View>
          ) : (
            <SwipeToPunch
              isPunchedIn={false}
              loading={punching}
              onSwipeComplete={handleSwipeComplete}
              resetTrigger={cancelTrigger}
            />
          )}

          {/* Offline location fetch status banner */}
          {!!punchMessage && (
            <View style={styles.punchMessageBanner}>
              <ActivityIndicator size="small" color={COLORS.primaryDeep} style={{ marginRight: 8 }} />
              <Text style={styles.punchMessageText}>{punchMessage}</Text>
            </View>
          )}
        </View>

        {/* 2×2 GRID */}
        <View style={styles.grid}>
          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('AttendanceReg', { initialTab: 'LOG' })}>
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
          onPress={() => navigation.navigate('AttendanceReg', { initialTab: 'REGULARISED' })}
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
      <Modal visible={showConfirmOut} transparent animationType="fade" statusBarTranslucent>
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

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logoAndGreeting: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerLogo: { width: 44, height: 44, marginRight: 12, borderRadius: 22 },
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
  punchMessageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  punchMessageText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDeep,
    flexShrink: 1,
  },

  punchedInCard: { flexDirection: 'row', backgroundColor: '#FFEBEB', height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, ...SHADOWS.light },
  punchedInLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingLeft: 12 },
  punchedInTextStack: { marginLeft: 12, flex: 1, marginRight: 8 },
  punchedInTime: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 1 },
  punchedInLoc: { fontSize: 11, color: COLORS.textLight, fontWeight: '600' },
  clockOutBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFD1D1', justifyContent: 'center', alignItems: 'center' },

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
