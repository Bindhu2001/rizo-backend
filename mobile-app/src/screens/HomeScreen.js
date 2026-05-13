import React, { useRef, useState, useEffect, useContext } from 'react';
import { OfflineBarContext } from '../../App';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Animated, Easing, Modal, ActivityIndicator, Dimensions, LayoutAnimation, UIManager, Platform, RefreshControl
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
import { API_ENDPOINTS, IMAGE_ROOT } from '../constants/Config';
import {
  savePunchLocal, getTodayLocalHistory, getLastPunchType,
  getPendingCount, initDB
} from '../services/LocalDB';
import SyncService from '../services/SyncService';
import NotificationManager from '../services/NotificationManager';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_URL = API_ENDPOINTS.ATTENDANCE;
const OFFICE_API_URL = API_ENDPOINTS.OFFICE;

const HomeScreen = ({ navigation, route }) => {
  const user = route?.params?.user;

  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [status, setStatus] = useState({ lastType: 'NONE', todayHistory: [] });
  const [locationName, setLocationName] = useState('Fetching location...');
  const [showConfirmOut, setShowConfirmOut] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const lastActionTime = useRef(0);
  const lastLocationFetch = useRef(0);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [cancelTrigger, setCancelTrigger] = useState(0);
  const [punchMessage, setPunchMessage] = useState('');
  const [punchInTime, setPunchInTime] = useState(null);
  const [punchInAddress, setPunchInAddress] = useState('');
  const [roles, setRoles] = useState({
    is_employee_hierarchy: user?.is_hierarchy == 1 || user?.is_hierarchy === true || user?.is_hierarchy === '1' || user?.is_hierarchy === 'true',
    is_leave_hierarchy: user?.is_hierarchy == 1 || user?.is_hierarchy === true || user?.is_hierarchy === '1' || user?.is_hierarchy === 'true'
  });
  const [alertCfg, setAlertCfg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user) {
      navigation.replace('Splash');
    }
  }, [user, navigation]);

  useEffect(() => {
    if (!user) return;
    initDB().then(() => {
      fetchStatus();
      fetchRoles();
      checkOfflinePunches();
      setTimeout(fetchLocation, 1000);
      NotificationManager.checkStatusChanges();
      NotificationManager.registerAndSendToken(user.user_id);
    });

    const unsubscribe = navigation.addListener('focus', () => {
      fetchStatus();
      fetchRoles();
      checkOfflinePunches();
      // Only re-fetch GPS if 2 minutes have passed since last successful fetch
      if (Date.now() - lastLocationFetch.current > 120000) {
        fetchLocation();
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
    await Promise.all([fetchStatus(), fetchRoles(), checkOfflinePunches()]);
    fetchLocation();
    setRefreshing(false);
  };

  const syncOfflinePunches = async () => {
    await SyncService.syncAll();
    checkOfflinePunches();
    fetchStatus();
  };

  // ── Punch ─────────────────────────────────────────────────────────────────
  // Distance between two GPS points in metres (Haversine).
  const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Returns { allowed: bool, message?: string } based on the employee's
  // configured punchtype:
  //   M → mobile, allowed from anywhere
  //   O → office, only allowed within 100 m of the office lat/lng
  //   S / W → punching not permitted from this app
  //
  // Works online AND offline: the punch config is cached in AsyncStorage
  // after the first successful online fetch, and GPS works without internet,
  // so the location gate stays accurate when offline too.
  const checkPunchAllowed = async () => {
    const cacheKey = `PUNCH_CONFIG_${user.user_id}`;
    let data = null;
    let debug = '';

    // 1. Try fresh from the server (endpoint expects GET with query param)
    try {
      const res = await axios.get(
        `${API_ENDPOINTS.EMPLOYEE_PUNCH_DETAILS}?user_id=${encodeURIComponent(user.user_id)}`,
        { timeout: 8000 },
      );
      const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      console.log('[Punch] config response', raw);
      debug = `HTTP ${res.status} body=${raw.slice(0, 250)}`;
      const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const ok = body?.status === true || body?.status === 1 || body?.status === '1' || body?.success === 1;
      if (ok && body?.data) {
        data = body.data;
        try { await AsyncStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
      }
    } catch (e) {
      console.log('[Punch] network fetch failed', e?.message);
      debug = `request error: ${e?.message || 'unknown'}`;
    }

    // 2. Fall back to cached config (offline path)
    if (!data) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          data = JSON.parse(cached);
          console.log('[Punch] using cached config');
        }
      } catch (_) {}
    }

    // 3. Still no config → block with diagnostic info so we can see what
    // the device actually received. (Previously this silently allowed which
    // bypassed the gate whenever the request shape was unexpected.)
    if (!data) {
      return {
        allowed: false,
        message: `Could not verify punch eligibility. Please connect to internet and try again. (${debug || 'no response'})`,
      };
    }

    const t = String(data.punchtype || '').toUpperCase();

    if (t === 'S' || t === 'W') {
      return { allowed: false, message: 'Punching is not allowed for your account. Please contact HR.' };
    }
    if (t === 'M') return { allowed: true };  // Mobile — anywhere
    if (t !== 'O') return { allowed: true };  // Unknown — allow

    // Office punch — GPS check (works offline)
    const officeLat = parseFloat(data.latitude);
    const officeLng = parseFloat(data.longitude);
    if (!isFinite(officeLat) || !isFinite(officeLng)
      || Math.abs(officeLat) > 90 || Math.abs(officeLng) > 180) {
      return {
        allowed: false,
        message: 'Office location is not configured correctly. Please contact HR.',
      };
    }

    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      return { allowed: false, message: 'Location permission is required to punch from the office. Please enable it in settings.' };
    }
    let loc = null;
    try {
      loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 12000)),
      ]);
    } catch (_) {
      try { loc = await Location.getLastKnownPositionAsync(); } catch (__) {}
    }
    if (!loc?.coords) {
      return { allowed: false, message: "You're not in an accurate location. Please enable GPS and try again." };
    }

    const dist = haversineMeters(loc.coords.latitude, loc.coords.longitude, officeLat, officeLng);
    console.log(`[Punch] distance ${Math.round(dist)} m from office (${officeLat},${officeLng})`);
    if (dist > 100) {
      return {
        allowed: false,
        message: `You're not in an accurate location. You must be within 100 m of the office (currently ~${Math.round(dist)} m away).`,
      };
    }
    return { allowed: true };
  };

  const handleSwipeComplete = async () => {
    const verdict = await checkPunchAllowed();
    if (!verdict.allowed) {
      setCancelTrigger((t) => t + 1); // reset the swipe knob
      showAlert('warning', 'Punch Not Allowed', verdict.message || "You're not in an accurate location.");
      return;
    }
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
    const hour = new Date().getHours();
    const msgs = [];

    if (!dur) {
      msgs.push({ icon: '🕐', text: 'Your attendance will be recorded when you clock out.', color: '#4F46E5' });
      return msgs;
    }

    const { hours, minutes, totalHours } = dur;
    msgs.push({ icon: '⏱️', text: `You have worked ${hours}h ${minutes}m today.`, color: '#0369A1' });

    if (totalHours < 4) {
      msgs.push({ icon: '⚠️', text: 'Short shift detected. You may need to apply regularisation.', color: '#B45309' });
    } else if (totalHours >= 9) {
      msgs.push({ icon: '🌟', text: 'Overtime recorded! Great dedication today.', color: '#059669' });
    } else if (totalHours >= 7.5) {
      msgs.push({ icon: '✅', text: 'Full shift completed. Well done!', color: '#059669' });
    }

    if (hour < 17 && totalHours < 8) {
      msgs.push({ icon: '📋', text: 'Early clock-out. Regularisation may be required later.', color: '#DC2626' });
    }

    if (hour >= 20) {
      msgs.push({ icon: '🌙', text: 'Late clock-out detected. Make sure to rest well.', color: '#7C3AED' });
    }

    return msgs;
  };

  const offlineBarVisible = useContext(OfflineBarContext);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
              <Text style={styles.greetingHeader}>{getGreeting()}</Text>
              <Text style={styles.userNameHeader} numberOfLines={1}>{user.employee_name || user.name}</Text>
              <View style={styles.locationBadge}>
                <MapPin color={COLORS.textLight} size={14} strokeWidth={2.5} />
                <Text style={[styles.locationText, { fontWeight: '700', color: '#6B7280' }]} numberOfLines={1}>{locationName || 'Fetching location...'}</Text>
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
                source={{ 
                  uri: user.profile_pic 
                    ? (user.profile_pic.startsWith('http') ? user.profile_pic : `${IMAGE_ROOT}/${user.profile_pic}`)
                    : `https://i.pravatar.cc/100?u=${user.user_id}` 
                }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* SWIPE / TIMER ACTION */}
        <View style={styles.swipeBoxContainer}>
          <View style={[styles.swipeBox, { width: '100%', height: 68, alignSelf: 'center' }]}>
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
          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('Attendance', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#E3F2FD' }]}>
              <Clock color="#2196F3" size={20} />
            </View>
            <Text style={styles.gridVal}>Attendance</Text>
            <Text style={styles.gridLabel}>View History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('Salary', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#FFF9C4' }]}>
              <DollarSign color="#F1C40F" size={20} />
            </View>
            <Text style={styles.gridVal}>Salary</Text>
            <Text style={styles.gridLabel}>Check Payroll</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('Leave', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#F3E5F5' }]}>
              <Briefcase color={COLORS.primaryDeep} size={20} />
            </View>
            <Text style={styles.gridVal}>Leave</Text>
            <Text style={styles.gridLabel}>Apply / View</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridCard} activeOpacity={0.7} onPress={() => navigation.navigate('Expense', { user })}>
            <View style={[styles.gridIcon, { backgroundColor: '#FFEBEE' }]}>
              <FileText color="#E91E63" size={20} />
            </View>
            <Text style={styles.gridVal}>Expense</Text>
            <Text style={styles.gridLabel}>Add / Track</Text>
          </TouchableOpacity>
        </View>

        {/* APPROVALS ROW */}
        {(roles.is_employee_hierarchy || roles.is_leave_hierarchy) && (
          <>
            <Text style={styles.sectionLabel}>Approvals</Text>
            <View style={styles.approvalRow}>
              {(roles.is_employee_hierarchy || roles.is_leave_hierarchy) && (
                <TouchableOpacity style={styles.approvalCard} activeOpacity={0.7} onPress={() => navigation.navigate('LeaveApproval', { user })}>
                  <View style={[styles.approvalIconBox, { backgroundColor: '#DCFCE7' }]}>
                    <CheckCircle color="#16A34A" size={22} />
                  </View>
                  <Text style={styles.approvalTitle}>Leave</Text>
                  <Text style={styles.approvalSub}>Approval</Text>
                </TouchableOpacity>
              )}

              {roles.is_employee_hierarchy && (
                <TouchableOpacity style={styles.approvalCard} activeOpacity={0.7} onPress={() => navigation.navigate('RegularisationApproval', { user })}>
                  <View style={[styles.approvalIconBox, { backgroundColor: '#FFF3E0' }]}>
                    <ClipboardList color="#F97316" size={22} />
                  </View>
                  <Text style={styles.approvalTitle}>Regularisation</Text>
                  <Text style={styles.approvalSub}>Approval</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* CLIENT VISIT */}
        <TouchableOpacity
          style={styles.visitButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Visits', { user })}
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
          onPress={() => navigation.navigate('AttendanceReg', { user, initialTab: 'LOG' })}
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
              <TouchableOpacity style={styles.cancelBtn} disabled={punching} onPress={() => {
                setShowConfirmOut(false);
                setCancelTrigger(prev => prev + 1);
              }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.logoutBtn, punching && { opacity: 0.6 }]} disabled={punching} onPress={() => processPunch('OUT')}>
                {punching ? <ActivityIndicator color="#FFF" /> : <Text style={styles.logoutBtnText}>Clock Out</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', overflow: 'hidden' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  scroll: { flexGrow: 1, padding: 20 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  logoAndGreeting: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerLogo: { width: 44, height: 44, marginRight: 16, marginLeft: 4 },
  greetingHeader: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '600' },
  userNameHeader: { fontSize: moderateScale(24), fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: moderateScale(11), color: COLORS.textLight, marginLeft: 4, fontWeight: '600', flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 10, ...SHADOWS.light },
  offlineDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.primary, borderWidth: 1.5, borderColor: '#FFF' },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#FFF', ...SHADOWS.light },
  avatar: { width: '100%', height: '100%' },

  swipeBoxContainer: { marginBottom: 20 },
  swipeBox: { height: 68, width: '100%', alignSelf: 'center' },
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
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: COLORS.primaryDeep,
    flexShrink: 1,
  },

  punchedInCard: { flexDirection: 'row', backgroundColor: '#FFEBEB', height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, ...SHADOWS.light },
  punchedInLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingLeft: 12 },
  punchedInTextStack: { marginLeft: 12, flex: 1, marginRight: 8 },
  punchedInTime: { fontSize: moderateScale(13), fontWeight: '800', color: COLORS.text, marginBottom: 1 },
  punchedInLoc: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '600' },
  clockOutBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFD1D1', justifyContent: 'center', alignItems: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  gridCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16, ...SHADOWS.light },
  gridIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  gridVal: { fontSize: moderateScale(16), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  gridLabel: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '500' },

  sectionLabel: { fontSize: moderateScale(13), fontWeight: '800', color: COLORS.textLight, letterSpacing: 0.5, marginBottom: 12, marginLeft: 4, textTransform: 'uppercase' },
  approvalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  approvalCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 24, padding: 20, ...SHADOWS.light },
  approvalIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  approvalTitle: { fontSize: moderateScale(15), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  approvalSub: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600' },

  // Visit Button
  visitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 24, ...SHADOWS.light
  },
  visitButtonLeft: { flexDirection: 'row', alignItems: 'center' },
  visitIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryDeep, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  visitBtnTitle: { fontSize: moderateScale(16), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  visitBtnSub: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '600' },

  // Events Dropdown
  eventsSection: { backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden', ...SHADOWS.light, marginBottom: 16 },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  eventsHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  eventsSectionTitle: { fontSize: moderateScale(16), fontWeight: '800', color: COLORS.text, marginLeft: 10 },
  eventsBody: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingHorizontal: 18, paddingBottom: 12, paddingTop: 4 },
  eventsLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  eventsLoadingText: { marginLeft: 10, color: COLORS.textLight, fontWeight: '600' },
  eventsEmpty: { color: COLORS.textLight, textAlign: 'center', paddingVertical: 20, fontWeight: '600' },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  eventName: { fontSize: moderateScale(14), fontWeight: '800', color: COLORS.text },
  eventMeta: { fontSize: moderateScale(11), color: COLORS.textLight, marginTop: 2, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: 32, padding: 24, alignItems: 'center' },
  modalPowerCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#FFE4E4' },
  modalTitle: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  modalSub: { fontSize: moderateScale(14), color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  modalBtns: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, paddingVertical: 16, marginRight: 12, borderRadius: 16, borderWidth: 1, borderColor: '#EEF2F7', alignItems: 'center', backgroundColor: '#F9FAFB' },
  cancelBtnText: { color: COLORS.textLight, fontWeight: '700' },
  logoutBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: COLORS.danger, alignItems: 'center' },
  logoutBtnText: { color: '#FFF', fontWeight: '800' },
});

export default HomeScreen;
