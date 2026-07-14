import React, { useRef, useState, useEffect, useContext } from 'react';
import { OfflineBarContext } from '../../App';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Animated, Easing, Modal, ActivityIndicator, Dimensions, LayoutAnimation, UIManager, Platform, RefreshControl, BackHandler, AppState
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Clock, MapPin, Bell, Briefcase, DollarSign, FileText,
  Calendar as CalendarIcon, Gift, Power, Fingerprint, History, Navigation, CloudOff,
  CheckCircle, ClipboardList, ChevronRight, ChevronDown, ChevronUp
} from 'lucide-react-native';
import axios from 'axios';
import { format } from 'date-fns';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SIZES, SHADOWS, moderateScale } from '../components/Theme';
import SwipeToPunch from '../components/SwipeToPunch';
import CalendarWidget from '../components/CalendarWidget';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import { API_ENDPOINTS, IMAGE_ROOT } from '../constants/Config';
import {
  savePunchLocal, getTodayLocalHistory, getLastPunchType,
  getPendingCount, initDB, savePunchConfig, getPunchConfig
} from '../services/LocalDB';
import SyncService from '../services/SyncService';
import NotificationManager from '../services/NotificationManager';
import { syncEmployeeDetails } from '../services/EmployeeSync';
import { useTheme } from '../components/ThemeContext';

const PLACEHOLDER_AVATAR = require('../../assets/signup/placeholdermen.jpeg');

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_URL = API_ENDPOINTS.ATTENDANCE;
const OFFICE_API_URL = API_ENDPOINTS.OFFICE;

const HomeScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const [user, setUser] = useState(route?.params?.user);
  // Always keep a ref to the latest user so focus-listener closures never go stale
  const userRef = useRef(route?.params?.user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Block Android back button only when HomeScreen is the focused screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.isFocused()) {
        if (eventsOpen) {
          setEventsOpen(false);
          return true;
        }
        BackHandler.exitApp();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [navigation, eventsOpen]);

  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [status, setStatus] = useState({ lastType: 'NONE', todayHistory: [] });
  const [locationName, setLocationName] = useState('Fetching location...');
  const [showConfirmOut, setShowConfirmOut] = useState(false);
  const [showShiftConfirm, setShowShiftConfirm] = useState(false);
  const [shiftConfirmType, setShiftConfirmType] = useState('IN');
  const [offlineCount, setOfflineCount] = useState(0);
  const lastActionTime = useRef(0);
  const lastLocationFetch = useRef(0);
  const lastConfigFetch = useRef(0);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [cancelTrigger, setCancelTrigger] = useState(0);
  const [punchMessage, setPunchMessage] = useState('');
  const [msgIndex, setMsgIndex] = useState(0);
  const msgFade = useRef(new Animated.Value(1)).current;
  const [punchInTime, setPunchInTime] = useState(null);
  const [punchInAddress, setPunchInAddress] = useState('');
  const [roles, setRoles] = useState({
    is_employee_hierarchy: user?.is_hierarchy == 1 || user?.is_hierarchy === true || user?.is_hierarchy === '1' || user?.is_hierarchy === 'true',
    is_leave_hierarchy: user?.is_hierarchy == 1 || user?.is_hierarchy === true || user?.is_hierarchy === '1' || user?.is_hierarchy === 'true'
  });
  const [menus, setMenus] = useState({
    leaveApproval: false,
    regularisationApproval: false,
  });
  const [alertCfg, setAlertCfg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  // Redirect to Splash if session is cleared
  useEffect(() => {
    if (!user) {
      navigation.replace('Splash');
    }
  }, [user, navigation]);

  // One-time setup on mount
  useEffect(() => {
    if (!userRef.current) return;
    initDB().then(() => {
      fetchStatus();
      fetchRoles();
      fetchMenus();
      checkOfflinePunches();
      // Use ref so we always get the latest user_id
      syncEmployeeDetails(userRef.current, navigation).then((updated) => { if (updated) setUser(updated); });
      NotificationManager.checkStatusChanges();
      NotificationManager.registerAndSendToken(userRef.current.user_id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Instant notification check when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') NotificationManager.forceCheck();
    });
    return () => sub.remove();
  }, []);

  // Focus listener — always uses userRef.current so it never captures stale data
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchStatus();
      fetchRoles();
      fetchMenus();
      checkOfflinePunches();
      syncEmployeeDetails(userRef.current, navigation).then((updated) => { if (updated) setUser(updated); });
      if (Date.now() - lastLocationFetch.current > 120000) {
        initLocationWithDisclosure();
      }
    });
    const syncTimer = setInterval(() => SyncService.syncAll(), 60000);
    return () => {
      unsubscribe();
      clearInterval(syncTimer);
    };
  }, [navigation]);

  if (!user) return null;

  const toggleEvents = () => {
    setEventsOpen(!eventsOpen);
  };

  // ── Initialization ────────────────────────────────────────────────────────

  // ── Location disclosure gate ──────────────────────────────────────────────
  const DISCLOSURE_KEY = 'location_disclosure_accepted_v1';

  const initLocationWithDisclosure = async () => {
    try {
      const accepted = await AsyncStorage.getItem(DISCLOSURE_KEY);
      if (accepted === 'true') {
        fetchLocation();
      } else {
        setShowLocationDisclosure(true);
      }
    } catch (_) {
      fetchLocation();
    }
  };

  const handleDisclosureAccept = async () => {
    setShowLocationDisclosure(false);
    try { await AsyncStorage.setItem(DISCLOSURE_KEY, 'true'); } catch (_) {}
    fetchLocation();
  };

  const handleDisclosureDecline = () => {
    setShowLocationDisclosure(false);
    setLocationName('Location access denied');
  };

  // ── Location: high accuracy + human-readable name ─────────────────────────
  const fetchLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationName('Location access denied');
        return;
      }

      // Show last-known position instantly while full GPS fix loads
      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      if (lastKnown && locationName === 'Fetching location...') {
        try {
          const geo = await Location.reverseGeocodeAsync(lastKnown.coords);
          if (geo?.length > 0) {
            const r = geo[0];
            const parts = [r.name || r.street, r.district || r.subregion || r.city, r.region].filter(Boolean);
            setLocationName([...new Set(parts)].join(', ') || 'Location attached');
          }
        } catch (_) {}
      }

      let loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = loc.coords;
      lastLocationFetch.current = Date.now();

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

  const fetchRoles = async () => {
    try {
      const res = await axios.post(API_ENDPOINTS.CHECK_ROLES, { user_id: user.user_id });
      if (res.data) {
        // If the API returns success, we look at the roles object
        const isResSuccess = res.data.success == 1 || res.data.success === true || res.data.success === '1' || res.data.success === 'true';
        if (isResSuccess) {
          const apiRoles = res.data.roles || {};
          
          const isHierarchy = res.data.is_hierarchy == 1 || res.data.is_hierarchy === true || res.data.is_hierarchy === '1' || res.data.is_hierarchy === 'true';
          
          setRoles({
            is_employee_hierarchy: apiRoles.is_employee_hierarchy == 1 || apiRoles.is_employee_hierarchy === true || apiRoles.is_employee_hierarchy === '1' || apiRoles.is_employee_hierarchy === 'true' || isHierarchy,
            is_leave_hierarchy: apiRoles.is_leave_hierarchy == 1 || apiRoles.is_leave_hierarchy === true || apiRoles.is_leave_hierarchy === '1' || apiRoles.is_leave_hierarchy === 'true' || isHierarchy
          });
        }
      }
    } catch (e) {
      console.log('[Home] Roles fetch error:', e);
    }
  };

  const fetchMenus = async () => {
    try {
      const res = await axios.post(API_ENDPOINTS.ALLOCATE_MENUS, { user_id: user.user_id });
      if (res.data && (res.data.success == 1 || res.data.success === true)) {
        const data = res.data.data || {};
        setMenus({
          leaveApproval: data['Team Leave Requests'] === 'Y',
          regularisationApproval: data['Approve/Reject Regularisation'] === 'Y',
        });
      }
    } catch (e) {
      console.log('[Home] Menu allocation fetch error:', e);
    }
  };

  // ── Status ────────────────────────────────────────────────────────────────
  const fetchStatus = async () => {
    // 1. Instantly load from Local DB to prevent UI flicker
    let localType = 'NONE';
    try {
      localType = await getLastPunchType(user.user_id);
      setIsPunchedIn(localType === 'IN');
      setStatus(prev => ({ ...prev, lastType: localType }));

      const localLogs = await getTodayLocalHistory(user.user_id);
      if (localLogs && localLogs.length > 0) {
        setPunchInTime(new Date(localLogs[0].punch_time));
        setPunchInAddress(localLogs[0].address || '');
      }

      // Load persistent action time
      const lastStored = await AsyncStorage.getItem(`LAST_ACTION_${user.user_id}`);
      if (lastStored) lastActionTime.current = parseInt(lastStored, 10);
    } catch (e) {
      console.log('[Home] Local status fetch error:', e);
    } finally {
      setLoading(false);
    }

    // 2. Cross-verify with Cloud
    try {
      const today = format(new Date(), 'yyyy-MM');
      const response = await axios.post(API_ENDPOINTS.ATTENDANCE_LOGS, {
        user_id: user.user_id,
        month: today
      }, { timeout: 8000 });

      const logs = Array.isArray(response.data?.data) ? response.data.data : (Array.isArray(response.data) ? response.data : []);
      
      if (logs.length > 0) {
        // Sort logs descending to ensure logs[0] is the most recent
        const sortedLogs = [...logs].sort((a, b) => new Date(b.date + 'T' + (b.punch_in_time?.split(' ')[1] || '00:00:00')) - new Date(a.date + 'T' + (a.punch_in_time?.split(' ')[1] || '00:00:00')));
        const latest = sortedLogs[0];
        
        // Robust check: If we have an IN time but no OUT time for the latest log entry, we are Punched In.
        const serverType = (latest.punch_in_time && (!latest.punch_out_time || latest.punch_out_time === '---')) ? 'IN' : 'NONE';
        
        const pCnt = await getPendingCount();
        const timeSinceLastAction = Date.now() - lastActionTime.current;
        
        // REVERSAL GUARD: Trust local SQLite as the primary source of truth for today's state
        // because ATTENDANCE_LOGS groups by day and may parse as 'NONE' if there are multiple punches.
        if (pCnt === 0 || timeSinceLastAction > 900000) { // 15 mins
          
          let finalType = localType === 'IN' ? 'IN' : 'NONE';
          
          // If server explicitly says we are logged in, but local doesn't know (e.g. fresh install or logged in from another device), honor it
          if (serverType === 'IN' && localType !== 'IN') {
             finalType = 'IN';
          }
          
          // Only update if it's different to prevent layout jumps
          if (finalType !== isPunchedIn) {
             setIsPunchedIn(finalType === 'IN');
             setStatus(prev => ({ ...prev, lastType: finalType }));
          }

          // Update punch time string if available and missing locally
          if (finalType === 'IN' && latest.punch_in_time && !punchInTime) {
            setPunchInTime(new Date(latest.punch_in_time.replace(' ', 'T')));
          }
        }
      }
    } catch (e) {
      console.log('[Home] Cloud sync skipped', e.message);
    }
  };

  const checkOfflinePunches = async () => {
    const count = await getPendingCount();
    setOfflineCount(count);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStatus(),
      fetchRoles(),
      fetchMenus(),
      checkOfflinePunches(),
      syncEmployeeDetails(user, navigation).then((updated) => { if (updated) setUser(updated); })
    ]);
    initLocationWithDisclosure();
    setRefreshing(false);
  };

  const syncOfflinePunches = async () => {
    await SyncService.syncAll();
    checkOfflinePunches();
    fetchStatus();
  };

  // ── Punch ─────────────────────────────────────────────────────────────────

  const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Fetch punch config from server (store in LocalDB for offline use).
  // punchtype:
  //   M → mobile, anywhere
  //   O → single office, within 100 m of data.latitude/longitude
  //   A → all branches, within 100 m of ANY branch location
  //   S / W → not permitted
  const checkPunchAllowed = async () => {
    let data = null;
    let serverTimeMs = null;

    // 1. Try live fetch — skip if config was fetched less than 10 minutes ago
    const configAge = Date.now() - lastConfigFetch.current;
    if (configAge > 600000) {
      try {
        const res = await axios.post(
          `${API_ENDPOINTS.EMPLOYEE_PUNCH_DETAILS}?user_id=${encodeURIComponent(user.user_id)}`,
          null,
          { timeout: 6000 },
        );
        const dateHeader = res.headers?.date || res.headers?.Date;
        if (dateHeader) {
          const parsed = Date.parse(dateHeader);
          if (isFinite(parsed)) serverTimeMs = parsed;
        }
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const ok = body?.status === true || body?.status === 1 || body?.status === '1' || body?.success === 1;
        if (ok && body?.data) {
          data = body.data;
          lastConfigFetch.current = Date.now();
          try { await savePunchConfig(user.user_id, data); } catch (_) {}
        }
      } catch (e) {
        console.log('[Punch] network fetch failed', e?.message);
      }
    } else {
      console.log('[Punch] using cached config (age ' + Math.round(configAge / 1000) + 's)');
    }

    // Clock drift check (server Date header vs device clock, allow 2 min jitter)
    if (serverTimeMs !== null) {
      const driftSec = Math.round(Math.abs(Date.now() - serverTimeMs) / 1000);
      console.log(`[Punch] clock drift ${driftSec}s`);
      if (driftSec > 120) {
        return { allowed: false, message: 'Please enable "Automatic date & time" in your phone Settings and try again.' };
      }
    }

    // 2. Offline fallback — read from LocalDB
    if (!data) {
      try {
        const cached = await getPunchConfig(user.user_id);
        if (cached) { data = cached; console.log('[Punch] using LocalDB cached config'); }
      } catch (_) {}
    }

    // 3. No config at all → allow (first install, never online)
    if (!data) return { allowed: true };

    const t = String(data.punchtype || '').toUpperCase();

    if (t === 'S' || t === 'W') {
      return { allowed: false, message: 'Punching is not allowed for your account. Please contact HR.' };
    }
    if (t === 'M') return { allowed: true };
    if (t !== 'O' && t !== 'A') return { allowed: true }; // unknown type → allow

    // Build list of office locations to validate against
    let offices = [];

    if (t === 'O') {
      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      if (isFinite(lat) && isFinite(lng) && Math.abs(lat) > 0.0001) {
        offices.push({ lat, lng });
      }
    } else {
      // A type — multiple branches; response may have a 'branches' array,
      // parallel lat/lng arrays, or a single lat/lng entry
      if (Array.isArray(data.branches)) {
        data.branches.forEach(b => {
          const lat = parseFloat(b.latitude);
          const lng = parseFloat(b.longitude);
          if (isFinite(lat) && isFinite(lng) && Math.abs(lat) > 0.0001) offices.push({ lat, lng });
        });
      } else if (Array.isArray(data.latitude)) {
        data.latitude.forEach((latStr, i) => {
          const lat = parseFloat(latStr);
          const lng = parseFloat(Array.isArray(data.longitude) ? data.longitude[i] : data.longitude);
          if (isFinite(lat) && isFinite(lng) && Math.abs(lat) > 0.0001) offices.push({ lat, lng });
        });
      } else {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (isFinite(lat) && isFinite(lng) && Math.abs(lat) > 0.0001) offices.push({ lat, lng });
      }
      // A type with no valid branch coords → allow (config incomplete)
      if (offices.length === 0) return { allowed: true };
    }

    if (offices.length === 0) {
      return { allowed: false, message: 'Office location is not configured correctly. Please contact HR.' };
    }

    // GPS check
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      return { allowed: false, message: 'Location permission is required to punch from the office. Please enable it in settings.' };
    }
    let loc = null;
    try {
      loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000)),
      ]);
    } catch (_) {
      try { loc = await Location.getLastKnownPositionAsync(); } catch (__) {}
    }
    if (!loc?.coords) {
      return { allowed: false, message: "You're not in an accurate location. Please enable GPS and try again." };
    }

    const { latitude: uLat, longitude: uLng } = loc.coords;
    const minDist = Math.min(...offices.map(o => haversineMeters(uLat, uLng, o.lat, o.lng)));
    console.log(`[Punch] nearest office ${Math.round(minDist)} m (${offices.length} location(s) checked)`);

    if (minDist > 100) {
      return {
        allowed: false,
        message: `You're not in an accurate location. You must be within 100 m of the office (currently ~${Math.round(minDist)} m away).`,
      };
    }
    return { allowed: true };
  };

  const handleSwipeComplete = async () => {
    const verdict = await checkPunchAllowed();
    if (!verdict.allowed) {
      setCancelTrigger((t) => t + 1);
      showAlert('warning', 'Punch Not Allowed', verdict.message || "You're not in an accurate location.");
      return;
    }
    const type = isPunchedIn ? 'OUT' : 'IN';
    setShiftConfirmType(type);
    setShowShiftConfirm(true);
  };

  const processPunch = async (type) => {
    if (punching) return;
    setPunching(true);
    setShowConfirmOut(false);
    const now = Date.now();
    lastActionTime.current = now;
    await AsyncStorage.setItem(`LAST_ACTION_${user.user_id}`, now.toString());

    console.log(`[Punch] Initiating ${type} process...`);
    const punchTime = new Date().toISOString();

    try {
      // 1. Check network first so we can show the right message
      const net = await Network.getNetworkStateAsync();
      const isOffline = !net.isConnected;

      // 2. Fetch GPS location
      let loc = { coords: { latitude: 0, longitude: 0 } };
      setPunchMessage('Fetching your location...');

      // Use last-known location immediately for speed, then upgrade with fresh GPS
      try {
        const lastLoc = await Location.getLastKnownPositionAsync();
        if (lastLoc?.coords) {
          loc = lastLoc;
          console.log(`[Punch] Last-known location: ${loc.coords.latitude}, ${loc.coords.longitude}`);
        }
      } catch (_) {}

      try {
        // 5s timeout — use last-known as fallback above if this times out
        const fresh = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        loc = fresh;
        console.log(`[Punch] Fresh location acquired: ${loc.coords.latitude}, ${loc.coords.longitude}`);
        setPunchMessage('Location found — saving punch...');
      } catch (_) {
        if (loc.coords.latitude !== 0) {
          console.log(`[Punch] GPS timed out, using last-known location`);
          setPunchMessage('Using last known location — saving punch...');
        } else {
          setPunchMessage('Saving punch (location unavailable)...');
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
      if (isNowIn) {
        setPunchInTime(new Date(punchTime));
        setPunchInAddress(punchAddress);
      } else {
        setPunchInTime(null);
        setPunchInAddress('');
      }

      // 6. Background sync
      checkOfflinePunches();
      if (net.isConnected) {
        SyncService.syncAll().then(() => fetchStatus());
      } else {
        await fetchStatus();
      }
    } catch (e) {
      console.error('[Punch] Error:', e);
      showAlert('error', 'Error', 'Failed to process punch. Please try again.');
    } finally {
      setPunching(false);
      setPunchMessage('');
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Morning,';
    if (h < 17) return 'Afternoon,';
    return 'Evening,';
  };

  const getWorkDuration = () => {
    if (!punchInTime) return null;
    const diffMs = Date.now() - new Date(punchInTime).getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return { hours, minutes, totalHours: hours + minutes / 60 };
  };

  const getSystemMessages = () => {
    const dur = getWorkDuration();
    const msgs = [];

    if (!dur) return msgs;

    const { hours, minutes } = dur;
    msgs.push({ icon: '⏱️', text: `You have worked ${hours}h ${minutes}m today.`, color: '#0369A1' });

    return msgs;
  };

  useEffect(() => {
    const msgs = getSystemMessages();
    if (msgs.length <= 1) return;
    const timer = setInterval(() => {
      Animated.timing(msgFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setMsgIndex(prev => (prev + 1) % msgs.length);
        Animated.timing(msgFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [isPunchedIn, punchInTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const offlineBarVisible = useContext(OfflineBarContext);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primaryDeep]} tintColor={COLORS.primaryDeep} />}
      >

        {offlineBarVisible && <View style={{ height: 32 }} />}
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.logoAndGreeting}>
            <View>
              <Text style={[styles.greetingHeader, { color: theme.textLight }]}>{getGreeting()}</Text>
              <Text style={[styles.userNameHeader, { color: theme.text }]} numberOfLines={1} allowFontScaling={false}>{user.employee_name || user.name}</Text>
              <View style={styles.locationBadge}>
                <MapPin color={theme.textLight} size={14} strokeWidth={2.5} />
                <Text style={[styles.locationText, { fontWeight: '700', color: theme.textLight }]} numberOfLines={1}>{locationName || 'Fetching location...'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerRight}>
            {offlineCount > 0 && (
              <TouchableOpacity style={[styles.headerIcon, { backgroundColor: COLORS.primaryDeep, marginRight: 8 }]} onPress={syncOfflinePunches}>
                <History color="#FFF" size={18} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.headerIcon, { backgroundColor: theme.card }]} onPress={() => navigation.navigate('Notifications')}>
              <Bell color={theme.text} size={22} />
              {offlineCount > 0 && <View style={styles.offlineDot} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarCircle} onPress={() => navigation.navigate('ProfileTab')}>
              <Image
                source={
                  user.profile_pic
                    ? { uri: user.profile_pic.startsWith('http') ? user.profile_pic : `${IMAGE_ROOT}/${user.profile_pic}` }
                    : PLACEHOLDER_AVATAR
                }
                style={styles.avatar}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* SWIPE / PUNCH AREA */}
        <View style={styles.swipeBoxContainer}>
          <View style={[styles.punchCard, { backgroundColor: theme.card }]}>

            {/* Status row — only shown when punched in and time is known */}
            {isPunchedIn && !!punchInTime && (
              <View style={styles.punchStatusRow}>
                <View style={[styles.punchDot, { backgroundColor: '#39B54A' }]} />
                <Text style={[styles.punchStatusText, { color: '#2E7D32' }]}>
                  {`Checked in at ${format(punchInTime, 'hh:mm a')}`}
                </Text>
              </View>
            )}

            {/* Action title */}
            <Text style={[styles.punchActionTitle, { color: punching ? theme.textMuted : (isPunchedIn ? '#E91E63' : '#39B54A') }]}>
              {punching
                ? (isPunchedIn ? 'Checking Out…' : 'Checking In…')
                : (isPunchedIn ? 'Check Out' : 'Check In')}
            </Text>

            {/* Swipe */}
            <View style={{ width: '100%', height: 68, marginTop: moderateScale(12) }}>
              <SwipeToPunch
                isPunchedIn={isPunchedIn}
                loading={punching}
                onSwipeComplete={handleSwipeComplete}
                resetTrigger={cancelTrigger}
                trackHeight={68}
                locationName={isPunchedIn ? punchInAddress : ''}
                punchTime={isPunchedIn && punchInTime ? format(punchInTime, 'hh:mm a') : null}
              />
            </View>

            {/* Live status — always visible while punching */}
            {(punching || !!punchMessage) && (
              <View style={styles.punchMessageBanner}>
                <ActivityIndicator size="small" color={COLORS.primaryDeep} style={{ marginRight: 8 }} />
                <Text style={styles.punchMessageText}>
                  {punchMessage || (isPunchedIn ? 'Processing check out...' : 'Processing check in...')}
                </Text>
              </View>
            )}

          </View>
        </View>

        {/* System message ticker */}
        {(() => {
          const msgs = getSystemMessages();
          if (!msgs.length) return null;
          const msg = msgs[msgIndex % msgs.length];
          return (
            <Animated.View style={[styles.sysMsgBar, { opacity: msgFade, borderLeftColor: msg.color }]}>
              <Text style={styles.sysMsgIcon}>{msg.icon}</Text>
              <Text style={[styles.sysMsgText, { color: msg.color }]} numberOfLines={2}>{msg.text}</Text>
              {msgs.length > 1 && (
                <Text style={styles.sysMsgDots}>{msgs.map((_, i) => i === msgIndex % msgs.length ? '●' : '○').join(' ')}</Text>
              )}
            </Animated.View>
          );
        })()}

        {/* 2×2 GRID */}
        <View style={styles.grid}>
          <TouchableOpacity style={[styles.gridCard, { backgroundColor: theme.card }]} activeOpacity={0.7} onPress={() => navigation.navigate('Attendance', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#E3F2FD' }]}>
              <Clock color="#2196F3" size={20} />
            </View>
            <Text style={[styles.gridVal, { color: theme.text }]}>Attendance</Text>
            <Text style={[styles.gridLabel, { color: theme.textLight }]}>View History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.gridCard, { backgroundColor: theme.card }]} activeOpacity={0.7} onPress={() => navigation.navigate('Salary', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#FFF9C4' }]}>
              <DollarSign color="#F1C40F" size={20} />
            </View>
            <Text style={[styles.gridVal, { color: theme.text }]}>Salary</Text>
            <Text style={[styles.gridLabel, { color: theme.textLight }]}>Check Payroll</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.gridCard, { backgroundColor: theme.card }]} activeOpacity={0.7} onPress={() => navigation.navigate('Leave', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#F3E5F5' }]}>
              <Briefcase color={COLORS.primaryDeep} size={20} />
            </View>
            <Text style={[styles.gridVal, { color: theme.text }]}>Leave</Text>
            <Text style={[styles.gridLabel, { color: theme.textLight }]}>Apply / View</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.gridCard, { backgroundColor: theme.card }]} activeOpacity={0.7} onPress={() => navigation.navigate('Expense', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#FFEBEE' }]}>
              <FileText color="#E91E63" size={20} />
            </View>
            <Text style={[styles.gridVal, { color: theme.text }]}>Expense</Text>
            <Text style={[styles.gridLabel, { color: theme.textLight }]}>Add / Track</Text>
          </TouchableOpacity>
        </View>

        {/* APPROVALS ROW */}
        {(menus.leaveApproval || menus.regularisationApproval) && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textLight }]}>Approvals</Text>
            <View style={styles.approvalRow}>
              {menus.leaveApproval && (
                <TouchableOpacity style={[styles.approvalCard, { backgroundColor: theme.card }]} activeOpacity={0.7} onPress={() => navigation.navigate('LeaveApproval', { user })}>
                  <View style={[styles.approvalIconBox, { backgroundColor: '#DCFCE7' }]}>
                    <CheckCircle color="#16A34A" size={22} />
                  </View>
                  <Text style={[styles.approvalTitle, { color: theme.text }]}>Leave</Text>
                  <Text style={[styles.approvalSub, { color: theme.textLight }]}>Approval</Text>
                </TouchableOpacity>
              )}

              {menus.regularisationApproval && (
                <TouchableOpacity style={[styles.approvalCard, { backgroundColor: theme.card }]} activeOpacity={0.7} onPress={() => navigation.navigate('RegularisationApproval', { user })}>
                  <View style={[styles.approvalIconBox, { backgroundColor: '#FFF3E0' }]}>
                    <ClipboardList color="#F97316" size={22} />
                  </View>
                  <Text style={[styles.approvalTitle, { color: theme.text }]}>Regularisation</Text>
                  <Text style={[styles.approvalSub, { color: theme.textLight }]}>Approval</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* CLIENT VISIT */}
        <TouchableOpacity
          style={[styles.visitButton, { backgroundColor: theme.card }]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Visits', { user })}
        >
          <View style={styles.visitButtonLeft}>
            <View style={styles.visitIconBox}>
              <Navigation color="#FFF" size={20} />
            </View>
            <View>
              <Text style={[styles.visitBtnTitle, { color: theme.text }]}>Client Visit</Text>
              <Text style={[styles.visitBtnSub, { color: theme.textLight }]}>Track your client meetings</Text>
            </View>
          </View>
          <ChevronRight color={theme.textLight} size={20} />
        </TouchableOpacity>

        {/* REGULARIZATION */}
        <TouchableOpacity
          style={[styles.visitButton, { backgroundColor: theme.card, marginBottom: 24, marginTop: -12 }]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AttendanceReg', { user, initialTab: 'LOG' })}
        >
          <View style={styles.visitButtonLeft}>
            <View style={[styles.visitIconBox, { backgroundColor: '#FF9800' }]}>
              <History color="#FFF" size={20} />
            </View>
            <View>
              <Text style={[styles.visitBtnTitle, { color: theme.text }]}>Regularization</Text>
              <Text style={[styles.visitBtnSub, { color: theme.textLight }]}>Late In / Early Out requests</Text>
            </View>
          </View>
          <ChevronRight color={theme.textLight} size={20} />
        </TouchableOpacity>

        {/* UPCOMING EVENTS DROPDOWN */}
        <View style={[styles.eventsSection, { backgroundColor: theme.card }]}>
          <TouchableOpacity style={styles.eventsHeader} onPress={toggleEvents} activeOpacity={0.8}>
            <View style={styles.eventsHeaderLeft}>
              <CalendarIcon color={COLORS.primaryDeep} size={20} />
              <Text style={[styles.eventsSectionTitle, { color: theme.text }]}>Upcoming Events</Text>
            </View>
            {eventsOpen
              ? <ChevronUp color={theme.textLight} size={20} />
              : <ChevronDown color={theme.textLight} size={20} />
            }
          </TouchableOpacity>

          {eventsOpen && (
            <View style={{ padding: 12 }}>
              <CalendarWidget userId={user.user_id} />
            </View>
          )}
        </View>

      </ScrollView>

      {/* SHIFT POLICY CONFIRM MODAL — shown before both Punch IN and Punch OUT */}
      <Modal
        visible={showShiftConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowShiftConfirm(false); setCancelTrigger(prev => prev + 1); }}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalPowerCircle, {
              backgroundColor: shiftConfirmType === 'OUT' ? '#FFF0F0' : '#EEF2FF',
              borderColor: shiftConfirmType === 'OUT' ? '#FFE4E4' : '#C7D2FE'
            }]}>
              {shiftConfirmType === 'OUT'
                ? <Power color={COLORS.danger} size={32} />
                : <Fingerprint color={COLORS.primaryDeep} size={32} />
              }
            </View>
            <Text style={styles.modalTitle}>Attendance</Text>
            <Text style={styles.modalSub}>Attendance direction is decided by your shift policy</Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                disabled={punching}
                onPress={() => {
                  setShowShiftConfirm(false);
                  setCancelTrigger(prev => prev + 1);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logoutBtn, { backgroundColor: shiftConfirmType === 'OUT' ? COLORS.danger : COLORS.primaryDeep }, punching && { opacity: 0.6 }]}
                disabled={punching}
                onPress={() => {
                  setShowShiftConfirm(false);
                  processPunch(shiftConfirmType);
                }}
              >
                {punching ? <ActivityIndicator color="#FFF" /> : <Text style={styles.logoutBtnText}>OK</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      <LocationDisclosureModal
        visible={showLocationDisclosure}
        onAccept={handleDisclosureAccept}
        onDecline={handleDisclosureDecline}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', overflow: 'hidden' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  scroll: { flexGrow: 1, padding: moderateScale(20), paddingBottom: moderateScale(110) },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: moderateScale(16) },
  logoAndGreeting: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerLogo: { width: moderateScale(44), height: moderateScale(44), marginRight: moderateScale(16), marginLeft: 4 },
  greetingHeader: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '600' },
  userNameHeader: { fontSize: moderateScale(24), fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: moderateScale(11), color: COLORS.textLight, marginLeft: 4, fontWeight: '600', flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(22), backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(10), ...SHADOWS.light },
  offlineDot: { position: 'absolute', top: 10, right: 10, width: moderateScale(9), height: moderateScale(9), borderRadius: 5, backgroundColor: COLORS.primary, borderWidth: 1.5, borderColor: '#FFF' },
  avatarCircle: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(22), overflow: 'hidden', borderWidth: 2, borderColor: '#FFF', ...SHADOWS.light },
  avatar: { width: '100%', height: '100%' },

  swipeBoxContainer: { marginBottom: moderateScale(20) },
  punchCard: {
    borderRadius: moderateScale(20),
    padding: moderateScale(18),
    ...SHADOWS.light,
  },
  punchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: moderateScale(4),
  },
  punchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  punchStatusText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  punchActionTitle: {
    fontSize: moderateScale(22),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  punchMessageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: moderateScale(12),
    paddingVertical: moderateScale(10),
    paddingHorizontal: moderateScale(14),
    marginTop: moderateScale(12),
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  punchMessageText: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: COLORS.primaryDeep,
    flexShrink: 1,
  },

  sysMsgBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4FF',
    borderRadius: moderateScale(14), paddingVertical: moderateScale(10),
    paddingHorizontal: moderateScale(14), marginBottom: moderateScale(16),
    borderLeftWidth: 4, borderLeftColor: '#4F46E5',
  },
  sysMsgIcon: { fontSize: moderateScale(16), marginRight: moderateScale(8) },
  sysMsgText: { flex: 1, fontSize: moderateScale(12), fontWeight: '700', lineHeight: 18 },
  sysMsgDots: { fontSize: moderateScale(8), color: '#9CA3AF', marginLeft: moderateScale(8) },

  punchedInCard: { flexDirection: 'row', backgroundColor: '#FFEBEB', height: moderateScale(68), borderRadius: moderateScale(34), alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), ...SHADOWS.light },
  punchedInLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingLeft: moderateScale(12) },
  punchedInTextStack: { marginLeft: moderateScale(12), flex: 1, marginRight: moderateScale(8) },
  punchedInTime: { fontSize: moderateScale(13), fontWeight: '800', color: COLORS.text, marginBottom: 1 },
  punchedInLoc: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '600' },
  clockOutBtn: { width: moderateScale(52), height: moderateScale(52), borderRadius: moderateScale(26), backgroundColor: '#FFD1D1', justifyContent: 'center', alignItems: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: moderateScale(24) },
  gridCard: { width: '48%', backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), marginBottom: moderateScale(16), ...SHADOWS.light },
  gridIcon: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(12) },
  gridVal: { fontSize: moderateScale(16), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  gridLabel: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '500' },

  sectionLabel: { fontSize: moderateScale(13), fontWeight: '800', color: COLORS.textLight, letterSpacing: 0.5, marginBottom: moderateScale(12), marginLeft: 4, textTransform: 'uppercase' },
  approvalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: moderateScale(24) },
  approvalCard: { width: '48%', backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), ...SHADOWS.light },
  approvalIconBox: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(14), justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(14) },
  approvalTitle: { fontSize: moderateScale(15), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  approvalSub: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600' },

  // Visit Button
  visitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), marginBottom: moderateScale(24), ...SHADOWS.light
  },
  visitButtonLeft: { flexDirection: 'row', alignItems: 'center' },
  visitIconBox: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(14), backgroundColor: COLORS.primaryDeep, justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(16) },
  visitBtnTitle: { fontSize: moderateScale(16), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  visitBtnSub: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '600' },

  // Events Dropdown
  eventsSection: { backgroundColor: '#FFF', borderRadius: moderateScale(24), overflow: 'hidden', ...SHADOWS.light, marginBottom: moderateScale(16) },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: moderateScale(18) },
  eventsHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  eventsSectionTitle: { fontSize: moderateScale(16), fontWeight: '800', color: COLORS.text, marginLeft: moderateScale(10) },
  eventsBody: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingHorizontal: moderateScale(18), paddingBottom: moderateScale(12), paddingTop: 4 },
  eventsLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(16) },
  eventsLoadingText: { marginLeft: moderateScale(10), color: COLORS.textLight, fontWeight: '600' },
  eventsEmpty: { color: COLORS.textLight, textAlign: 'center', paddingVertical: moderateScale(20), fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  eventDot: { width: moderateScale(10), height: moderateScale(10), borderRadius: 5, marginRight: moderateScale(14) },
  eventName: { fontSize: moderateScale(14), fontWeight: '800', color: COLORS.text },
  eventMeta: { fontSize: moderateScale(11), color: COLORS.textLight, marginTop: 2, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: moderateScale(20) },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: moderateScale(32), padding: moderateScale(24), alignItems: 'center' },
  modalPowerCircle: { width: moderateScale(80), height: moderateScale(80), borderRadius: moderateScale(40), backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(20), borderWidth: 1, borderColor: '#FFE4E4' },
  modalTitle: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: moderateScale(10) },
  modalSub: { fontSize: moderateScale(14), color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: moderateScale(32) },
  modalBtns: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, paddingVertical: moderateScale(16), marginRight: moderateScale(12), borderRadius: moderateScale(16), borderWidth: 1, borderColor: '#EEF2F7', alignItems: 'center', backgroundColor: '#F9FAFB' },
  cancelBtnText: { color: COLORS.textLight, fontWeight: '700' },
  logoutBtn: { flex: 1, paddingVertical: moderateScale(16), borderRadius: moderateScale(16), backgroundColor: COLORS.danger, alignItems: 'center' },
  logoutBtnText: { color: '#FFF', fontWeight: '800' },
});

export default HomeScreen;
