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
import TeamTile from '../components/TeamTile';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import { API_ENDPOINTS, IMAGE_ROOT } from '../constants/Config';
import {
  savePunchLocal, getPunchesBetween, updatePunchLocation,
  getPendingCount, getPendingSyncCount, initDB
} from '../services/LocalDB';
import { loadPunchConfig, getRecentFix, rememberFix } from '../services/PunchPrefetch';
import SyncService from '../services/SyncService';
import NotificationManager from '../services/NotificationManager';
import { refreshShiftReminders, getCachedShiftSchedule } from '../services/ShiftReminders';
import { nextPunch, SHIFT_DATE_LOOKBACK_MS } from '../services/ShiftDate';
import { syncEmployeeDetails } from '../services/EmployeeSync';
import { loadMenuAccess, useMenuAccess, menuStatus, BLURRED_MESSAGE } from '../services/MenuAccess';
import { fetchServerDay, getCachedServerDay, getCachedServerPunches, mergePunches } from '../services/AllPunches';
import { useTheme } from '../components/ThemeContext';

const PLACEHOLDER_AVATAR = require('../../assets/signup/placeholdermen.jpeg');

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_URL = API_ENDPOINTS.ATTENDANCE;
// Retry interval while punches or customer visits are waiting to sync
const PUNCH_SYNC_RETRY_MS = 30000;
// Office-check GPS fix reused for the punch if the user confirms within this
const VERIFIED_LOC_MAX_AGE_MS = 2 * 60 * 1000;
const SWIPE_TRACK_HEIGHT = moderateScale(68);

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
  const [punchingType, setPunchingType] = useState(null); // 'IN' | 'OUT' — action actually in flight
  const [checkingPunch, setCheckingPunch] = useState(false); // swipe done, punch-allowed check running
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [status, setStatus] = useState({ lastType: 'NONE', todayHistory: [] });
  const [locationName, setLocationName] = useState('Fetching location...');
  const [showConfirmOut, setShowConfirmOut] = useState(false);
  const [showShiftConfirm, setShowShiftConfirm] = useState(false);
  const [shiftConfirmType, setShiftConfirmType] = useState('IN');
  const [offlineCount, setOfflineCount] = useState(0);
  const lastActionTime = useRef(0);
  const lastLocationFetch = useRef(0);
  // GPS fix from the 100 m office check, reused for the punch itself
  const verifiedPunchLoc = useRef(null);
  const fetchStatusRequestId = useRef(0);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [cancelTrigger, setCancelTrigger] = useState(0);
  const [punchMessage, setPunchMessage] = useState('');
  const [msgIndex, setMsgIndex] = useState(0);
  const msgFade = useRef(new Animated.Value(1)).current;
  const [punchInTime, setPunchInTime] = useState(null);
  const [punchInAddress, setPunchInAddress] = useState('');
  // Worked time of the button's shift date: finished IN→OUT sessions from its punches, and the day's duration as the
  // Attendance screen shows it (attendance_punches; null = not known for this shift date)
  const [closedMins, setClosedMins] = useState(0);
  const [serverDurationMins, setServerDurationMins] = useState(null);
  const [, setClockTick] = useState(0);
  // Check In / Check Out not known yet: the saved server punches are old and the server is being asked
  const [statusPending, setStatusPending] = useState(false);
  const [roles, setRoles] = useState({
    is_employee_hierarchy: user?.is_hierarchy == 1 || user?.is_hierarchy === true || user?.is_hierarchy === '1' || user?.is_hierarchy === 'true',
    is_leave_hierarchy: user?.is_hierarchy == 1 || user?.is_hierarchy === true || user?.is_hierarchy === '1' || user?.is_hierarchy === 'true'
  });
  const menuAccess = useMenuAccess(user?.user_id);
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
      // Re-check the button once the schedule is fresh (night shifts need it for the shift date)
      refreshShiftReminders(userRef.current.user_id).then(() => fetchStatus());
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Punch status (local-only) + notification check — runs on app open/close
  // (foreground/background transitions), not on every screen focus.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchStatus();
        NotificationManager.forceCheck();
        if (userRef.current) refreshShiftReminders(userRef.current.user_id);
      }
    });
    return () => sub.remove();
  }, []);

  // Focus listener — always uses userRef.current so it never captures stale data
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchRoles();
      fetchMenus();
      checkOfflinePunches();
      syncEmployeeDetails(userRef.current, navigation).then((updated) => { if (updated) setUser(updated); });
      if (Date.now() - lastLocationFetch.current > 120000) {
        initLocationWithDisclosure();
      }
    });
    // Retry only while punches or customer visits are waiting to sync
    const syncTimer = setInterval(async () => {
      const pending = await getPendingSyncCount().catch(() => 0);
      if (pending === 0) return;
      SyncService.syncAll({ onAttendanceSynced: afterPunchSync });
    }, PUNCH_SYNC_RETRY_MS);
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

  // Same menus as the Requests / Approvals tabs (services/MenuAccess.js)
  const fetchMenus = () => loadMenuAccess(user.user_id);

  // Client Visit (mobile menu 'customer-visits'): opens Visits, or — blurred — says why it can't
  const visitStatus = menuStatus(menuAccess, { key: 'customer-visits', route: 'Visits' });
  const visitMenu = {
    blurred: visitStatus !== 'on',
    onPress: () => (visitStatus === 'on'
      ? navigation.navigate('Visits', { user })
      : showAlert('info', BLURRED_MESSAGE[visitStatus].title, BLURRED_MESSAGE[visitStatus].message)),
  };

  // ── Status ────────────────────────────────────────────────────────────────
  // A punch counts wherever it was made — biometric device, web or this phone (services/AllPunches.js). The
  // button opens on the phone's punches + the last known server punches. When that server copy is older than
  // SERVER_FRESH_MS it may miss a biometric / web punch made since, so the button shows "Checking status..."
  // until the server answers instead of a state that could then flip.
  const SERVER_FRESH_MS = 60 * 1000;
  // The phone's own punch within this is the newest punch anyway — no need to wait on the server
  const OWN_PUNCH_RECENT_MS = 2 * 60 * 1000;

  // Button, check-in time and finished sessions from the shift date's punches (all sources)
  const applyPunchState = (next) => {
    const last = next.onShift[next.onShift.length - 1] || null;
    setIsPunchedIn(next.direction === 'OUT');
    setStatus(prev => ({ ...prev, lastType: last ? String(last.type).toUpperCase() : 'NONE' }));
    if (next.direction === 'OUT' && last) {
      setPunchInTime(new Date(last.punch_time));
      setPunchInAddress(last.address || '');
    } else {
      setPunchInTime(null);
      setPunchInAddress('');
    }
    let closed = 0;
    let openIn = null;
    for (const p of next.onShift) {
      const ms = new Date(p.punch_time).getTime();
      if (String(p.type).toUpperCase() === 'IN') {
        if (openIn === null) openIn = ms;
      } else if (openIn !== null) {
        closed += ms - openIn;
        openIn = null;
      }
    }
    setClosedMins(Math.floor(closed / 60000));
  };

  const fetchStatus = async () => {
    // Multiple triggers (mount, AppState, focus, post-sync callbacks) can call
    // this concurrently; only the result of the most recently started call
    // should ever be applied, otherwise a slower/stale call resolving last can
    // clobber the button state with outdated data.
    const requestId = ++fetchStatusRequestId.current;
    // 1. Instantly, from the phone's punches + the last known server punches. The next punch is decided like the
    //    server's punch trigger (services/ShiftDate.js): its shift date — a night shift keeps
    //    early-morning punches on the previous day — then IN if that shift date has no punch yet,
    //    else the opposite of its last punch. So a missed check-out yesterday shows Check In today.
    let shiftDate = null;
    let schedule = [];
    let localPunches = [];
    try {
      const now = new Date();
      const [sched, punches, cachedServer, lastStored] = await Promise.all([
        getCachedShiftSchedule(user.user_id),
        getPunchesBetween(user.user_id, new Date(now.getTime() - SHIFT_DATE_LOOKBACK_MS).toISOString(), new Date(now.getTime() + 60000).toISOString()).catch(() => []),
        getCachedServerPunches(user.user_id),
        AsyncStorage.getItem(`LAST_ACTION_${user.user_id}`).catch(() => null),
      ]);
      schedule = sched;
      localPunches = punches;
      if (lastStored) lastActionTime.current = parseInt(lastStored, 10);
      const next = nextPunch(now, mergePunches(punches, cachedServer), schedule);
      shiftDate = next.shiftDate;
      const cachedDay = await getCachedServerDay(user.user_id, shiftDate);

      if (requestId !== fetchStatusRequestId.current) return; // superseded by a newer call

      applyPunchState(next);
      // A new shift date (button back to Check In) has no worked time yet
      setServerDurationMins(cachedDay ? cachedDay.durationMins : null);
      const serverCopyStale = !cachedDay?.fetchedAt || Date.now() - cachedDay.fetchedAt > SERVER_FRESH_MS;
      const ownPunchRecent = Date.now() - lastActionTime.current < OWN_PUNCH_RECENT_MS;
      setStatusPending(serverCopyStale && !ownPunchRecent);
    } catch (e) {
      console.log('[Home] Local status fetch error:', e);
    } finally {
      if (requestId === fetchStatusRequestId.current) setLoading(false);
    }

    // 2. The server's punches of the shift date — biometric and web punches the phone can't know about. Applied
    //    the same way, so the button only changes when there really is a new punch. Offline or no answer
    //    (fetchServerDay gives up after 8 s): the button stays on the saved copy.
    try {
      if (!shiftDate) return;
      const server = await fetchServerDay(user.user_id, shiftDate);
      if (requestId !== fetchStatusRequestId.current || !server) return; // superseded, or offline
      const serverPunches = await getCachedServerPunches(user.user_id); // now holding this answer
      if (requestId !== fetchStatusRequestId.current) return;
      applyPunchState(nextPunch(new Date(), mergePunches(localPunches, serverPunches), schedule));
      setServerDurationMins(server.durationMins);
    } finally {
      if (requestId === fetchStatusRequestId.current) setStatusPending(false);
    }
  };

  // Punches reached the server: refresh the badge and button now, then re-fetch the shift
  // schedule (shift changes, approved leave) and re-check the button and reminders with it
  const afterPunchSync = () => {
    checkOfflinePunches();
    fetchStatus();
    const userId = userRef.current?.user_id;
    if (userId) refreshShiftReminders(userId, { forceFetch: true }).then(() => fetchStatus());
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
    verifiedPunchLoc.current = null;

    // 1. Punch type — LocalDB copy if under 30 min old (no wait), otherwise
    //    re-fetched when online. Usually already refreshed by Splash.
    const { data, serverTimeMs } = await loadPunchConfig(user.user_id);

    // Clock drift check (server Date header vs device clock, allow 2 min jitter)
    if (serverTimeMs !== null) {
      const driftSec = Math.round(Math.abs(Date.now() - serverTimeMs) / 1000);
      console.log(`[Punch] clock drift ${driftSec}s`);
      if (driftSec > 120) {
        return { allowed: false, message: 'Please enable "Automatic date & time" in your phone Settings and try again.' };
      }
    }

    // 2. No config at all → allow (first install, never online)
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
    // A fix from the last 60 s (Splash warm-up / OS cache) skips the GPS wait
    let loc = await getRecentFix();
    if (!loc) {
      try {
        loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000)),
        ]);
        rememberFix(loc);
      } catch (_) {
        try { loc = await Location.getLastKnownPositionAsync(); } catch (__) {}
      }
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
    verifiedPunchLoc.current = { loc, at: Date.now() };
    return { allowed: true };
  };

  const handleSwipeComplete = async () => {
    // Spinner on the knob while the punch type / 100 m office check runs
    setCheckingPunch(true);
    let verdict;
    try {
      verdict = await checkPunchAllowed();
    } catch (e) {
      console.log('[Punch] check failed', e?.message);
      verdict = { allowed: false, message: 'Could not verify punch. Please try again.' };
    } finally {
      setCheckingPunch(false);
    }
    if (!verdict.allowed) {
      setCancelTrigger((t) => t + 1);
      showAlert('warning', 'Punch Not Allowed', verdict.message || "You're not in an accurate location.");
      return;
    }
    const type = isPunchedIn ? 'OUT' : 'IN';
    setShiftConfirmType(type);
    setShowShiftConfirm(true);
  };

  // Runs after the punch row is saved and the button released: attach the
  // punch-time location/address to that row, then sync it.
  const completePunchInBackground = async (savedId, isNowIn, isConnected, officeLoc, startedAt) => {
    try {
      // Office punches reuse the fix from the 100 m check; others take a fix
      // from the last 60 s, else a fresh one (5 s cap), else any last-known
      let loc = officeLoc || await getRecentFix();
      if (!loc) {
        try {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
          rememberFix(loc);
        } catch (_) {
          try { loc = await Location.getLastKnownPositionAsync(); } catch (__) {}
        }
      }
      const latitude = loc?.coords?.latitude || 0;
      const longitude = loc?.coords?.longitude || 0;

      // Reverse geocode the actual punch-time coords (5s timeout — this call
      // has no built-in timeout and can hang far longer, especially offline).
      // Do NOT use locationName state — it may be stale ("Location unavailable")
      let punchAddress = `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`;
      if (Math.abs(latitude) > 0.0001) {
        try {
          const geo = await Promise.race([
            Location.reverseGeocodeAsync({ latitude, longitude }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
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
        await updatePunchLocation(savedId, { latitude, longitude, address: punchAddress });
        if (isNowIn) setPunchInAddress(punchAddress);
      }
      console.log(`[Punch] Address: ${punchAddress} (${Date.now() - startedAt}ms)`);
    } catch (e) {
      console.log('[Punch] background location failed', e?.message);
    }

    checkOfflinePunches();
    if (isConnected) {
      // Refresh the button as soon as punches are synced — visits/leaves etc.
      // continue syncing after that
      SyncService.syncAll({
        onAttendanceSynced: () => {
          console.log(`[Punch] synced (${Date.now() - startedAt}ms)`);
          afterPunchSync();
        },
      });
    } else {
      fetchStatus();
    }
  };

  const processPunch = async (type) => {
    if (punching) return;
    setPunching(true);
    setPunchingType(type);
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

      // 2. Save the punch immediately — before any location/geocode work — so
      //    its insertion order (which local-status lookups rely on) always
      //    matches the actual tap order. Location/address resolve slowly and
      //    unpredictably (especially offline), and if we waited for them
      //    before inserting, a later, faster-resolving punch (e.g. an OUT
      //    made online) could land in the table before an earlier, slower one
      //    (e.g. an IN made offline) — inverting the true sequence no matter
      //    what column we sort by afterward.
      const savedId = await savePunchLocal({
        userId: user.user_id,
        type,
        punchTime,
        latitude: 0,
        longitude: 0,
        address: 'Resolving location…',
        isOffline,
      });

      if (!savedId) {
        console.log(`[Punch] ${type} blocked (Duplicate sequence detected)`);
        setPunching(false);
        await fetchStatus();
        return;
      }

      console.log(`[Punch] ${type} saved locally: ${savedId} (${Date.now() - now}ms)`);

      // 3. Update UI state immediately — the punch is saved, so the button is
      //    released now; location, address and sync finish in the background
      const isNowIn = type === 'IN';
      setIsPunchedIn(isNowIn);
      if (isNowIn) {
        setPunchInTime(new Date(punchTime));
      } else {
        // The session this check-out ends counts as worked right away
        if (punchInTime) setClosedMins((m) => m + Math.max(0, Math.floor((new Date(punchTime).getTime() - new Date(punchInTime).getTime()) / 60000)));
        setPunchInTime(null);
        setPunchInAddress('');
      }

      const verified = verifiedPunchLoc.current;
      verifiedPunchLoc.current = null;
      const officeLoc = verified && Date.now() - verified.at <= VERIFIED_LOC_MAX_AGE_MS ? verified.loc : null;
      completePunchInBackground(savedId, isNowIn, net.isConnected, officeLoc, now);
      // Cancels the reminders this punch answers, plans the next ones / short-hours alert
      refreshShiftReminders(user.user_id);
    } catch (e) {
      console.error('[Punch] Error:', e);
      showAlert('error', 'Error', 'Failed to process punch. Please try again.');
    } finally {
      setPunching(false);
      setPunchingType(null);
      setPunchMessage('');
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Morning,';
    if (h < 17) return 'Afternoon,';
    return 'Evening,';
  };

  // Worked time of the button's shift date, from punches of every source.
  //   Checked in:  finished sessions + the running one since the last check-in
  //   Checked out: the day's duration as the Attendance screen shows it — the finished sessions while the server
  //                hasn't processed the last punch yet (its duration is then still the older, smaller one)
  // A new shift date (button back to Check In, no punch yet) has none, so the message goes away.
  const getWorkDuration = () => {
    let mins;
    if (isPunchedIn && punchInTime) {
      mins = closedMins + Math.max(0, Math.floor((Date.now() - new Date(punchInTime).getTime()) / 60000));
    } else {
      mins = Math.max(serverDurationMins || 0, closedMins);
    }
    if (!mins) return null;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return { hours, minutes, totalHours: mins / 60 };
  };

  // Keep the running worked time current while checked in
  useEffect(() => {
    if (!isPunchedIn) return;
    const timer = setInterval(() => setClockTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, [isPunchedIn]);

  const getSystemMessages = () => {
    const dur = getWorkDuration();
    const msgs = [];

    if (!dur || statusPending) return msgs;

    const { hours, minutes } = dur;
    msgs.push({
      icon: '⏱️',
      text: isPunchedIn ? `You have worked ${hours}h ${minutes}m today.` : `You worked ${hours}h ${minutes}m today.`,
      color: '#0369A1',
    });

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
            {isPunchedIn && !!punchInTime && !statusPending && (
              <View style={styles.punchStatusRow}>
                <View style={[styles.punchDot, { backgroundColor: '#39B54A' }]} />
                <Text style={[styles.punchStatusText, { color: '#2E7D32' }]}>
                  {`Checked in at ${format(punchInTime, 'hh:mm a')}`}
                </Text>
              </View>
            )}

            {/* Action title */}
            <Text style={[styles.punchActionTitle, { color: punching || statusPending ? theme.textMuted : (isPunchedIn ? '#E91E63' : '#39B54A') }]}>
              {punching
                ? (punchingType === 'OUT' ? 'Checking Out…' : 'Checking In…')
                : statusPending ? 'Checking…' : (isPunchedIn ? 'Check Out' : 'Check In')}
            </Text>

            {/* Swipe */}
            <View style={{ width: '100%', height: SWIPE_TRACK_HEIGHT, marginTop: moderateScale(12) }}>
              <SwipeToPunch
                isPunchedIn={isPunchedIn}
                loading={punching || checkingPunch}
                loadingType={punchingType || (isPunchedIn ? 'OUT' : 'IN')}
                onSwipeComplete={handleSwipeComplete}
                resetTrigger={cancelTrigger}
                trackHeight={SWIPE_TRACK_HEIGHT}
                locationName={isPunchedIn ? punchInAddress : ''}
                punchTime={isPunchedIn && punchInTime ? format(punchInTime, 'hh:mm a') : null}
                statusPending={statusPending}
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

        </View>

        {/* Leave, Expense, Regularization and the approvals live in the Requests / Approvals tabs */}

        {/* CLIENT VISIT */}
        <TouchableOpacity
          style={[styles.visitButton, { backgroundColor: theme.card }, visitMenu.blurred && styles.blurred]}
          activeOpacity={0.8}
          onPress={visitMenu.onPress}
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

        {/* MY TEAM — only for someone with a team they authorise / approve leave for */}
        <TeamTile user={user} />

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
  blurred: { opacity: 0.45 },
  gridCard: { width: '48%', backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(20), marginBottom: moderateScale(16), ...SHADOWS.light },
  gridIcon: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(12) },
  gridVal: { fontSize: moderateScale(16), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  gridLabel: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '500' },


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
