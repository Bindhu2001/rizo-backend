import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal, Platform, Animated, RefreshControl
} from 'react-native';
import { Text, TextInput } from '../components/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomAlert from '../components/CustomAlert';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, MapPin, CheckCircle, Plus, CalendarDays, History, RefreshCw } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import { API_ENDPOINTS } from '../constants/Config';
import * as Location from 'expo-location';
import { COLORS, SHADOWS , moderateScale, KEYBOARD_AVOID_BEHAVIOR } from '../components/Theme';
import KeyboardSafeView from '../components/KeyboardSafeView';
import ScrollView from '../components/KeyboardAwareScrollView'; // scrolls the focused field above the keyboard
import KeyboardDoneBar, { doneBarId, useKeyboardVisible, useFooterPadding } from '../components/KeyboardDoneBar';
import { useTheme } from '../components/ThemeContext';
import { getTodayVisits, getVisitsByDate, getLiveVisits, visitStartDate, saveVisitLocal, updateVisitStatus, initDB } from '../services/LocalDB';
import SyncService from '../services/SyncService';
import { createAddressResolver } from '../services/AddressResolver';
import { recordAudit } from '../services/AuditTrail';
import { verifyDeviceClock } from '../services/TimeCheck';
import { getRecentFix, rememberFix } from '../services/PunchPrefetch';
import * as Network from 'expo-network';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch (_) { return ''; }
};
const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // dd-mm-yyyy
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  } catch (_) { return ''; }
};

const todayStr = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const fmtDateStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[m - 1]} ${y}`;
};

// My Customer Visits: an open visit (Step In / Step Out still to do) stays at the top whenever it started, then the
// latest visit first (last in, first shown): by the visit's start time (else its first step / creation time), visits
// with no usable time last, ties by id (newest id first) so the order never jumps between refreshes.
const visitTimeMs = (v) => {
  const t = new Date(v.start_time || v.step_in_time || v.created_at || '').getTime();
  return isNaN(t) ? -Infinity : t;
};
const isOpenVisit = (v) => v.status === 'REACHED' || v.status === 'step_in';
const sortVisitsNewestFirst = (list) => [...list].sort((a, b) => {
  const open = Number(isOpenVisit(b)) - Number(isOpenVisit(a));
  if (open !== 0) return open;
  const d = visitTimeMs(b) - visitTimeMs(a);
  if (d !== 0 && !isNaN(d)) return d;
  return String(b.id).localeCompare(String(a.id));
});

// While a visit is "Pending sync" and the screen is open, try again this often (ms)
const AUTO_SYNC_RETRY_MS = 30000;

const normalizeVisit = (v) => {
  // API response: visit grouped with punches array
  if (v.punches && Array.isArray(v.punches)) {
    const startPunch = v.punches.find(p => p.stepinout === 'Start From');
    const inPunch   = v.punches.find(p => p.stepinout === 'in');
    const outPunch  = v.punches.find(p => p.stepinout === 'out');
    let status = 'COMPLETED';
    if (!inPunch && !outPunch) status = 'REACHED';
    else if (inPunch && !outPunch) status = 'step_in';
    return {
      id: startPunch?.mob_user_locations_pkey || (String(v.customer_name) + String(v.visit_date)),
      client_name: v.customer_name || '',
      contact_number: v.contact_number || '',
      contact_person: v.contact_person || '',
      purpose: v.purpose || '',
      location: startPunch?.location || '',
      start_time: startPunch?.created_time || '',
      step_in_time: inPunch?.created_time || '',
      end_time: outPunch?.created_time || '',
      step_in_address: inPunch?.location || '',
      end_address: outPunch?.location || '',
      status,
      sync_status: 'SYNCED', // it came from the server
      created_at: v.visit_date || startPunch?.created_time || '',
    };
  }
  // Local DB format (flat fields)
  return {
    id: v.id || v.visit_id || String(v.customer_name) + String(v.created_time),
    client_name: v.client_name || v.customer_name || '',
    contact_number: v.contact_number || '',
    contact_person: v.contact_person || '',
    purpose: v.purpose || '',
    location: v.location || v.start_location || '',
    start_time: v.start_time || v.start_from_time || '',
    step_in_time: v.step_in_time || v.in_time || '',
    end_time: v.end_time || v.out_time || '',
    step_in_address: v.step_in_address || v.in_location || '',
    end_address: v.end_address || v.out_location || '',
    status: v.status || 'COMPLETED',
    created_at: v.created_at || v.created_time || '',
    start_offline: v.start_offline, step_in_offline: v.step_in_offline, end_offline: v.end_offline,
    sync_status: v.sync_status,
  };
};

// Detect if a location string is raw lat/lng (offline format) and resolve it
const LAT_LNG_REGEX = /Lat:\s*(-?\d+\.\d+),\s*Lng:\s*(-?\d+\.\d+)/i;
// reverseGeocodeAsync has no built-in timeout and can hang far longer than a visit action should wait
const reverseGeocodeWithTimeout = (coords) => Promise.race([
  Location.reverseGeocodeAsync(coords),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
]);

// One lookup per place for the whole screen (cached, one at a time, pauses 60 s after
// repeated failures so it never burns iOS's ~50 lookups a minute across many cards)
const screenResolver = createAddressResolver(reverseGeocodeWithTimeout, { cooldownMs: 60000 });
const TAG_REGEX = /^\s*\((Online|Offline)\)\s*/i;

// No internet right now? (a stuck check counts as offline)
const isOfflineNow = async () => {
  try {
    const net = await Promise.race([
      Network.getNetworkStateAsync(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);
    return !net || !net.isConnected;
  } catch (_) { return true; }
};

// "(Offline) <text>" for a step made offline, "(Online) <text>" for one made online. Text that
// already carries the tag (rows from the server) is left as is; flag unknown (older rows) = as is.
const withTag = (text, offlineFlag) => {
  if (!text || TAG_REGEX.test(text)) return text;
  if (offlineFlag === null || offlineFlag === undefined || offlineFlag === '') return text;
  return `${parseInt(offlineFlag, 10) === 1 ? '(Offline)' : '(Online)'} ${text}`;
};

const resolveAddress = async (locationStr) => {
  if (!locationStr) return locationStr;
  const prefix = (locationStr.match(TAG_REGEX) || [''])[0]; // keep "(Offline) " when the address replaces Lat/Lng
  const match = locationStr.match(LAT_LNG_REGEX);
  if (!match) return locationStr; // Already a readable address
  try {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) return locationStr;
    const address = await screenResolver.resolve(parseFloat(match[1]), parseFloat(match[2]));
    if (address) return `${prefix}${address}`;
  } catch (_) { }
  return locationStr;
};

// The place + whether the step was made offline (stored with the visit for the Online/Offline tag)
const getAddress = async () => {
  const [place, offline] = await Promise.all([getAddressInner(), isOfflineNow()]);
  return { ...place, offline };
};

const getAddressInner = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { address: 'Location permission denied', lat: 0, lng: 0 };

    // A fix from the last 60 s (Splash warm-up / OS cache) skips the GPS wait
    let loc = await getRecentFix();
    if (!loc) {
      try {
        // Primary attempt: high accuracy with timeout
        loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
        ]);
        rememberFix(loc);
      } catch (e) {
        console.log('[Visits] High accuracy timeout/error, trying last known...');
        loc = await Location.getLastKnownPositionAsync();
      }
    }

    if (!loc) return { address: 'Location unavailable', lat: 0, lng: 0 };

    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    let addressStr = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

    try {
      // Reverse geocode only if online
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        const geo = await reverseGeocodeWithTimeout({ latitude: lat, longitude: lng });
        if (geo && geo.length > 0) {
          const g = geo[0];
          const parts = [g.name || g.street, g.district || g.subregion || g.city, g.region].filter(Boolean);
          if (parts.length > 0) addressStr = [...new Set(parts)].join(', ');
        }
      }
    } catch (_) { }

    return { address: addressStr, lat, lng };
  } catch (e) {
    console.log('[Visits] getAddress Error:', e);
    return { address: 'Location check failed', lat: 0, lng: 0 };
  }
};

// ─── Timeline Step Row (For Completed Visits) ─────────────────────────
// date: the step's own date — a visit can start on one day and step in / out on another
const TimelineStep = ({ time, date, location, label, labelColor, labelBg, done, isLast }) => {
  const theme = useTheme();
  return (
  <View style={tl.row}>
    <View style={tl.left}>
      <View style={[tl.dot, { backgroundColor: theme.border, borderColor: theme.border }, done && tl.dotDone]}>
        {done && <CheckCircle color="#FFF" size={10} strokeWidth={3} />}
      </View>
      {!isLast && <View style={[tl.line, { backgroundColor: theme.border }]} />}
    </View>
    <View style={tl.content}>
      <View style={tl.topRow}>
        {time
          ? (
            <Text style={[tl.time, { color: theme.text }]} numberOfLines={1}>
              {date ? <Text style={[tl.date, { color: theme.textMuted }]}>{date}  </Text> : null}{time}
            </Text>
          )
          : <Text style={[tl.timePlaceholder, { color: theme.textMuted }]}>--:--:--</Text>}
        <View style={[tl.badge, { backgroundColor: labelBg }]}>
          <Text style={[tl.badgeText, { color: labelColor }]}>{label}</Text>
        </View>
      </View>
      <View style={tl.locRow}>
        <Text style={[tl.loc, { color: theme.textMuted }]} numberOfLines={2}>Location: {location}</Text>
      </View>
    </View>
  </View>
  );
};

const tl = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 0 },
  left: { alignItems: 'center', width: moderateScale(28), marginRight: moderateScale(10) },
  dot: {
    width: moderateScale(20), height: moderateScale(20), borderRadius: moderateScale(10),
    backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#D1D5DB',
  },
  dotDone: { backgroundColor: '#22C55E', borderColor: '#16A34A' },
  line: { width: 2, flex: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  content: { flex: 1, paddingBottom: moderateScale(14) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  time: { fontSize: moderateScale(13), fontWeight: '700', color: '#111827', flexShrink: 1, marginRight: moderateScale(8) },
  date: { fontSize: moderateScale(11), fontWeight: '600', color: '#9CA3AF' },
  timePlaceholder: { fontSize: moderateScale(13), fontWeight: '700', color: '#9CA3AF' },
  badge: { paddingHorizontal: moderateScale(10), paddingVertical: 3, borderRadius: moderateScale(6) },
  badgeText: { fontSize: moderateScale(9), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  locRow: { flexDirection: 'row', alignItems: 'flex-start' },
  loc: { fontSize: moderateScale(11), color: '#9CA3AF', flex: 1, lineHeight: 16 },
});

// ─── Visit Card ───────────────────────────────────────────────────────────────
// readOnly (Visit History): always the timeline card, never the STEP IN / STEP OUT buttons
// Whether the visit has reached the server: "Pending sync" until then, "Synced" after
const isVisitPending = (v) => String(v?.sync_status || '').toUpperCase() === 'PENDING';

const SyncChip = ({ pending }) => (
  <View style={[sc.chip, pending ? sc.chipPending : sc.chipSynced]} accessibilityLabel={pending ? 'Pending sync' : 'Synced'}>
    {pending ? <RefreshCw color="#C2410C" size={11} strokeWidth={3} /> : <CheckCircle color="#15803D" size={11} strokeWidth={3} />}
    <Text style={[sc.text, { color: pending ? '#C2410C' : '#15803D' }]}>{pending ? 'Pending sync' : 'Synced'}</Text>
  </View>
);
const sc = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(8), paddingVertical: 3, borderRadius: moderateScale(10), borderWidth: 1 },
  chipPending: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  chipSynced: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  text: { fontSize: moderateScale(10), fontWeight: '800', marginLeft: 4 },
});

const VisitCard = ({ visit, onStepIn, onStepOut, processing, readOnly = false }) => {
  const theme = useTheme();
  const isLive = !readOnly && (visit.status === 'REACHED' || visit.status === 'step_in');

  // Resolve any stored lat/lng addresses to human-readable format
  const [resolvedLocation, setResolvedLocation] = useState(visit.location || '');
  const [resolvedStepIn, setResolvedStepIn] = useState(visit.step_in_address || '');
  const [resolvedEnd, setResolvedEnd] = useState(visit.end_address || '');

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const [loc, stepIn, end] = await Promise.all([
        resolveAddress(visit.location || ''),
        resolveAddress(visit.step_in_address || ''),
        resolveAddress(visit.end_address || ''),
      ]);
      if (!cancelled) {
        setResolvedLocation(loc);
        setResolvedStepIn(stepIn);
        setResolvedEnd(end);
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [visit.location, visit.step_in_address, visit.end_address]);

  // Own pulse animation for the live dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLive) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isLive]);

  if (isLive) {
    return (
      <View style={[cs.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={cs.cardHeader}>
          <Text style={[cs.clientName, { color: theme.text, flex: 1, marginRight: moderateScale(8) }]} numberOfLines={2}>{visit.client_name}</Text>
          <View style={cs.liveBadge}>
            <Animated.View style={[cs.liveDot, { transform: [{ scale: pulse }] }]} />
            <Text style={cs.liveText}>LIVE</Text>
          </View>
        </View>
        <View style={cs.liveTimeRow}>
          <Text style={[cs.liveTimeText, { color: theme.textLight, marginBottom: 0 }]}>{fmtTime(visit.start_time)} {fmtDate(visit.start_time)}</Text>
          {!readOnly && <SyncChip pending={isVisitPending(visit)} />}
        </View>
        <Text style={[cs.liveLocText, { color: theme.textLight }]}>Location: {withTag(resolvedLocation, visit.start_offline)}</Text>

        <TouchableOpacity
          style={[cs.purpleBtnFull, processing && { opacity: 0.6 }]}
          onPress={() => visit.status === 'REACHED' ? onStepIn(visit) : onStepOut(visit)}
          activeOpacity={0.8}
          disabled={processing}
        >
          {processing
            ? <ActivityIndicator color="#FFF" />
            : <Text style={cs.purpleBtnText}>{visit.status === 'REACHED' ? 'STEP IN' : 'STEP OUT'}</Text>
          }
        </TouchableOpacity>
      </View>
    );
  }

  // Completed Timeline View
  const hasStart = !!visit.start_time;
  const hasStepIn = !!visit.step_in_time;
  const hasStepOut = !!visit.end_time;

  const location = resolvedLocation || '';
  const contactNo = visit.contact_number || '';
  const contactPerson = visit.contact_person || visit.client_name;
  const dateStr = visit.created_at ? fmtDate(visit.created_at) : '';

  return (
    <View style={[cs.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={cs.compHeader}>
        <View style={cs.nameRow}>
          <Text style={[cs.clientName, { color: theme.text, flex: 1, marginRight: moderateScale(8) }]}>{visit.client_name}</Text>
          {!readOnly && <SyncChip pending={isVisitPending(visit)} />}
        </View>
        <Text style={[cs.date, { color: theme.textMuted }]}>{dateStr}</Text>
        <Text style={[cs.contactText, { color: theme.textMuted }]}>{contactPerson}: {contactNo}</Text>
      </View>

      <View style={cs.timeline}>
        {hasStart && (
          <TimelineStep time={fmtTime(visit.start_time)} date={fmtDate(visit.start_time)} location={withTag(location || visit.location, visit.start_offline)} label="START" labelBg="#EDE9FE" labelColor="#7C3AED" done={hasStart} isLast={!hasStepIn} />
        )}
        {hasStepIn && (
          <TimelineStep time={fmtTime(visit.step_in_time)} date={fmtDate(visit.step_in_time)} location={withTag(resolvedStepIn || location, visit.step_in_offline)} label="STEP IN" labelBg="#DCFCE7" labelColor="#16A34A" done={hasStepIn} isLast={!hasStepOut} />
        )}
        {hasStepOut && (
          <TimelineStep time={fmtTime(visit.end_time)} date={fmtDate(visit.end_time)} location={withTag(resolvedEnd || location, visit.end_offline)} label="STEP OUT" labelBg="#FCE4EC" labelColor="#C2185B" done={hasStepOut} isLast={true} />
        )}
      </View>
    </View>
  );
};

const cs = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: moderateScale(16), padding: moderateScale(16), marginBottom: moderateScale(16), borderWidth: 1 },
  // Live Card Headers
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: moderateScale(6) },
  clientName: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', paddingHorizontal: moderateScale(8), paddingVertical: 4, borderRadius: moderateScale(6), borderWidth: 1, borderColor: '#FCA5A5' },
  liveDot: { width: moderateScale(6), height: moderateScale(6), borderRadius: 3, backgroundColor: '#EF4444', marginRight: 4 },
  liveText: { fontSize: moderateScale(10), fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },
  liveTimeText: { fontSize: moderateScale(13), color: '#4B5563', marginBottom: 4, fontWeight: '600' },
  liveTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveLocText: { fontSize: moderateScale(12), color: '#4B5563', marginBottom: moderateScale(16), lineHeight: 18 },
  purpleBtnFull: { backgroundColor: COLORS.primaryDeep, paddingVertical: moderateScale(14), borderRadius: moderateScale(50), alignItems: 'center' },
  purpleBtnText: { color: '#FFF', fontSize: moderateScale(13), fontWeight: '800', letterSpacing: 1 },

  // Completed Headers
  compHeader: { marginBottom: moderateScale(16) },
  date: { fontSize: moderateScale(12), color: '#9CA3AF', marginBottom: 2, marginTop: 4 },
  contactText: { fontSize: moderateScale(12), color: '#9CA3AF' },
  timeline: { marginLeft: 0 },
});

// ─── Prohibited / Ban-circle Icon ─────────────────────────────────────────────
const BanIcon = () => (
  <View style={cm.banOuter}>
    <View style={cm.banDiag} />
  </View>
);

// ─── Current location shown in the Step In sheet and the Step Out dialog ─────
// Fetched when the dialog opens. Offline: just "Lat: …, Lng: …". Online: the street address — if the
// lookup only gave coordinates, the address is retried (2 x, 1.5 s apart) before falling back to them.
// The same result is what gets saved for the step (see handleConfirmStepIn / doStepOut), so the person
// saves exactly what they saw. null while loading.
const useCurrentLocation = (active) => {
  const [loc, setLoc] = useState(null);
  useEffect(() => {
    if (!active) { setLoc(null); return undefined; }
    let cancelled = false;
    (async () => {
      let res = await getAddress();
      if (!res.offline && /^Lat:/.test(res.address || '') && (res.lat || res.lng)) {
        for (let i = 0; i < 2 && !cancelled; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const found = await screenResolver.resolve(res.lat, res.lng);
          if (found) { res = { ...res, address: found }; break; }
        }
      }
      if (!cancelled) setLoc(res);
    })();
    return () => { cancelled = true; };
  }, [active]);
  return loc;
};

// "Your Current Location" card colours in dark mode (light mode keeps the lavender card): a purple tint of the page
// instead of the bright #F5F3FF, lavender title, address in the normal text colour
const LOC_DARK = { card: { backgroundColor: '#7C3AED26', borderColor: '#7C3AED66' }, label: '#C4B5FD', pin: '#A78BFA' };

const CurrentLocationBox = ({ loc }) => {
  const theme = useTheme();
  const dark = theme.isDark;
  return (
    <View style={[lb.box, dark && LOC_DARK.card]}>
      <View style={lb.head}>
        <MapPin color={dark ? LOC_DARK.pin : '#7C3AED'} size={14} />
        <Text style={[lb.label, dark && { color: LOC_DARK.label }]}>Your Current Location</Text>
      </View>
      {loc
        ? <Text style={[lb.text, dark && { color: theme.text }]} numberOfLines={3}>{loc.address}</Text>
        : <ActivityIndicator size="small" color={dark ? LOC_DARK.pin : '#7C3AED'} />}
    </View>
  );
};

const lb = StyleSheet.create({
  box: { backgroundColor: '#F5F3FF', borderRadius: moderateScale(12), padding: moderateScale(12), alignItems: 'center', marginBottom: moderateScale(16), borderWidth: 1, borderColor: '#EDE9FE', minHeight: moderateScale(64), justifyContent: 'center', width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  label: { fontSize: moderateScale(12), fontWeight: '700', color: '#6D28D9', marginLeft: moderateScale(6) },
  text: { fontSize: moderateScale(12), color: COLORS.primaryDeep, textAlign: 'center', lineHeight: 18, width: '100%' },
});

const ConfirmModal = ({ visible, onConfirm, onCancel, processing }) => {
  const theme = useTheme();
  const loc = useCurrentLocation(visible);
  return (
  <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onCancel}>
    <View style={[cm.overlay, { backgroundColor: theme.modalOverlay }]}>
      <View style={[cm.box, { backgroundColor: theme.card }]}>
        <View style={[cm.iconWrap, { backgroundColor: theme.isDark ? '#3B1E5C' : '#F3E8FF' }]}><BanIcon /></View>
        <Text style={[cm.title, { color: theme.text }]}>Are you sure you want to{"\n"}Confirm Step Out?</Text>
        <Text style={[cm.desc, { color: theme.textMuted }]}>You'll be marked as stepped out from{"\n"}the client you visited.</Text>
        <CurrentLocationBox loc={loc} />
        <View style={cm.row}>
          <TouchableOpacity style={[cm.cancelBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onCancel} activeOpacity={0.8} disabled={processing}>
            <Text style={[cm.cancelText, { color: theme.text }]}>No, Go back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[cm.confirmBtn, processing && { opacity: 0.6 }]} onPress={() => onConfirm(loc)} activeOpacity={0.8} disabled={processing}>
            {processing ? <ActivityIndicator color="#FFF" /> : <Text style={cm.confirmText}>Yes, Confirm</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
  );
};

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: moderateScale(28) },
  box: { backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(28), width: '100%', alignItems: 'center' },
  iconWrap: { width: moderateScale(88), height: moderateScale(88), borderRadius: moderateScale(44), backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(20) },
  banOuter: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(22), borderWidth: 3.5, borderColor: '#62338B', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  banDiag: { position: 'absolute', width: 3.5, height: moderateScale(52), backgroundColor: '#62338B', transform: [{ rotate: '45deg' }] },
  title: { fontSize: moderateScale(18), fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: moderateScale(8) },
  desc: { fontSize: moderateScale(13), color: '#9CA3AF', textAlign: 'center', marginBottom: moderateScale(16), lineHeight: 20 },
  row: { flexDirection: 'row', gap: moderateScale(12), width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: moderateScale(15), borderRadius: moderateScale(50), backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText: { fontSize: moderateScale(14), fontWeight: '800', color: '#374151' },
  confirmBtn: { flex: 1, paddingVertical: moderateScale(15), borderRadius: moderateScale(50), backgroundColor: COLORS.primaryDeep, alignItems: 'center' },
  confirmText: { fontSize: moderateScale(14), fontWeight: '800', color: '#FFF' },
});


// ─── Input Components ────────────────────────────────────────────────────────
// editable={false}: shown dimmed and can't be changed (e.g. the visit place once the visit has started).
const FloatInput = ({ label, value, onChangeText, keyboardType, multiline, maxLength, autoCapitalize, editable = true }) => {
  const theme = useTheme();
  const inputRef = useRef(null);
  return (
  <TouchableOpacity
    activeOpacity={1}
    onPress={() => { if (editable) inputRef.current?.focus(); }}
    style={[fi.wrap, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }, !editable && fi.locked]}
  >
    <Text style={[fi.label, { color: theme.textMuted }]}>{label}</Text>
    <TextInput
      ref={inputRef}
      editable={editable}
      style={[fi.input, { color: editable ? theme.text : theme.textMuted }, multiline && fi.multiline]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      maxLength={maxLength}
      returnKeyType={multiline ? 'default' : 'done'}
      autoCapitalize={autoCapitalize || (multiline ? 'sentences' : keyboardType === 'phone-pad' ? 'none' : 'words')}
      inputAccessoryViewID={doneBarId(keyboardType)}
      placeholderTextColor={theme.textMuted}
    />
  </TouchableOpacity>
  );
};

const fi = StyleSheet.create({
  wrap: { marginBottom: moderateScale(14), borderWidth: 1, borderColor: '#E5E7EB', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingTop: moderateScale(6), paddingBottom: 4 },
  label: { fontSize: moderateScale(10), fontWeight: '600', color: '#9CA3AF', marginBottom: 2 },
  input: { fontSize: moderateScale(14), color: '#111827', fontWeight: '600', paddingVertical: 2 },
  multiline: { height: moderateScale(72), textAlignVertical: 'top' },
  locked: { opacity: 0.55 },
});

// ─── Going to Meet (Fullscreen START Component) ───────────────────────────
const DISCLOSURE_KEY = 'location_disclosure_accepted_v1';

const StartVisitScreen = ({ visible, onClose, onSave, processing }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const footerPad = useFooterPadding();
  const [company, setCompany] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [purpose, setPurpose] = useState('');
  const [locText, setLocText] = useState('');
  const [locCoords, setLocCoords] = useState({ lat: 0, lng: 0 });
  const [fetchingLoc, setFetchingLoc] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  const doFetchAddress = async (cancelled) => {
    setFetchingLoc(true);
    const result = await getAddress();
    if (!cancelled) {
      setLocText(result.address);
      setLocCoords({ lat: result.lat, lng: result.lng });
      setFetchingLoc(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const init = async () => {
      try {
        const accepted = await AsyncStorage.getItem(DISCLOSURE_KEY);
        if (accepted === 'true') {
          doFetchAddress(cancelled);
        } else {
          setShowDisclosure(true);
        }
      } catch (_) {
        setShowDisclosure(true);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [visible]);

  const reset = () => {
    setCompany(''); setContactNo(''); setContactPerson(''); setPurpose('');
  };

  const handleSave = () => {
    if (!company.trim()) { showAlert('warning', 'Company Required', 'Please enter the Company / Client name.'); return; }
    if (!contactPerson.trim()) { showAlert('warning', 'Name Required', 'Please enter the Contact Person name.'); return; }
    if (fetchingLoc) { showAlert('info', 'Please Wait', 'We are still fetching your current location.'); return; }
    onSave({ company, contactNo, contactPerson, purpose, locText, ...locCoords });
    reset();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* iOS: inside a sliding Modal the SafeAreaView measures itself off-screen and reads a 0 top inset,
          so the header sat on the clock/signal row. Take the top from the app-level insets instead. */}
      <SafeAreaView
        edges={Platform.OS === 'ios' ? ['left', 'right', 'bottom'] : undefined}
        style={[sv.container, { backgroundColor: theme.bg }, Platform.OS === 'ios' && { paddingTop: insets.top }]}
      >
        <View style={[sv.headerRow, { backgroundColor: theme.bg }]}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }} style={sv.backBtn}>
            <ChevronLeft color={theme.text} size={28} />
          </TouchableOpacity>
          <Text style={[sv.title, { color: theme.text }]}>Going to Meet</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardSafeView
          behavior={KEYBOARD_AVOID_BEHAVIOR}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={sv.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" style={{ flex: 1 }}>
            <View style={[sv.locChipBox, theme.isDark && LOC_DARK.card]}>
              <View style={sv.locWrap}>
                <MapPin color={theme.isDark ? LOC_DARK.pin : '#7C3AED'} size={14} />
                <Text style={[sv.locLabel, theme.isDark && { color: LOC_DARK.label }]}>Your Current Location</Text>
              </View>
              <View style={sv.locTextWrap}>
                {fetchingLoc ? (
                  <ActivityIndicator size="small" color={theme.isDark ? LOC_DARK.pin : '#7C3AED'} />
                ) : (
                  <Text style={[sv.locText, theme.isDark && { color: theme.text }]} numberOfLines={2}>{locText}</Text>
                )}
              </View>
            </View>

            <View style={[sv.formWrap, { backgroundColor: theme.card }]}>
              <FloatInput label="Enter Company / Client you visit" value={company} onChangeText={setCompany} maxLength={30} />
              <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} maxLength={30} />
              <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" maxLength={30} />
              <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={100} />
            </View>
          </ScrollView>

          <View style={[sv.footer, { backgroundColor: theme.bg, paddingBottom: footerPad }]}>
            <TouchableOpacity
              // edited by Bindhu 28-11-2026: not ready yet — dark mode: its own purple at half strength, like Connect to
              // HR's "Send to HR" (was a bright lavender block on the dark page); light mode unchanged // end
              style={[
                sv.startBtn,
                (!company.trim() || !contactPerson.trim() || processing) && (theme.isDark ? sv.startBtnDisabledDark : sv.startBtnDisabled),
              ]}
              onPress={handleSave}
              disabled={fetchingLoc || processing || !company.trim() || !contactPerson.trim()}
              activeOpacity={0.85}
            >
              {processing
                ? <ActivityIndicator color={theme.isDark ? '#FFF' : '#62338B'} />
                : <Text style={[sv.startBtnText, (!company.trim() || !contactPerson.trim()) && !theme.isDark && sv.startBtnTextDisabled]}>START</Text>}
            </TouchableOpacity>
          </View>
        <KeyboardDoneBar />
        </KeyboardSafeView>
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <LocationDisclosureModal
          visible={showDisclosure}
          onAccept={async () => {
            setShowDisclosure(false);
            try { await AsyncStorage.setItem(DISCLOSURE_KEY, 'true'); } catch (_) {}
            doFetchAddress(false);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
};
const sv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56), backgroundColor: '#FFF' },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: moderateScale(17), fontWeight: '700', color: '#111827' },
  scroll: { padding: moderateScale(20) },
  locChipBox: { backgroundColor: '#F5F3FF', borderRadius: moderateScale(12), padding: moderateScale(16), alignItems: 'center', marginBottom: moderateScale(24), borderWidth: 1, borderColor: '#EDE9FE', minHeight: moderateScale(80) },
  locWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4, alignSelf: 'center' },
  locLabel: { fontSize: moderateScale(12), fontWeight: '700', color: '#6D28D9', marginLeft: moderateScale(6), textAlign: 'center' },
  locTextWrap: { minHeight: moderateScale(36), justifyContent: 'center', alignItems: 'center', width: '100%' },
  locText: { fontSize: moderateScale(12), color: COLORS.primaryDeep, textAlign: 'center', lineHeight: 18, width: '100%' },
  formWrap: { backgroundColor: '#FFF', padding: moderateScale(16), borderRadius: moderateScale(16), ...SHADOWS.light },
  footer: { padding: moderateScale(20), backgroundColor: '#F9FAFB' },
  startBtn: { backgroundColor: COLORS.primaryDeep, paddingVertical: moderateScale(18), borderRadius: moderateScale(50), alignItems: 'center' },
  startBtnDisabled: { backgroundColor: '#D1C4E9' },
  // Dark mode: the button's own colour at half strength, as Connect to HR's "Send to HR" (edited by Bindhu 28-11-2026)
  startBtnDisabledDark: { opacity: 0.5 },
  startBtnText: { color: '#FFF', fontSize: moderateScale(15), fontWeight: '800', letterSpacing: 1 },
  startBtnTextDisabled: { color: '#9E9E9E' },
});

// ─── Enter Details (Bottom Sheet for STEP IN) ────────────────────────────────
const StepInModal = ({ visible, visit, onClose, onSave, processing }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const footerPad = useFooterPadding();
  const [company, setCompany] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [purpose, setPurpose] = useState('');
  const loc = useCurrentLocation(visible);

  // Pre-fill
  useEffect(() => {
    if (visible && visit) {
      setCompany(visit.client_name || '');
      setContactNo(visit.contact_number || '');
      setContactPerson(visit.contact_person || '');
      setPurpose(visit.purpose || '');
    }
  }, [visible, visit]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeView
        behavior={KEYBOARD_AVOID_BEHAVIOR}
        style={[sm.overlay, { backgroundColor: theme.modalOverlay }]}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={[sm.sheet, { backgroundColor: theme.card }]}>
          <View style={[sm.dragHandle, { backgroundColor: theme.border }]} />
          <Text style={[sm.title, { color: theme.text }]}>Enter details</Text>

          <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
            <CurrentLocationBox loc={loc} />
            {/* The visit place is fixed once the visit has started (set on the Going to Meet screen). */}
            <FloatInput label="Company / Client you visit" value={company} onChangeText={setCompany} maxLength={30} editable={false} />
            <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} maxLength={30} />
            <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" maxLength={30} />
            <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={100} />
          </ScrollView>

          <View style={[sm.footer, { paddingBottom: footerPad }]}>
            <TouchableOpacity
              style={[sm.saveBtn, processing && { opacity: 0.7 }]}
              onPress={() => onSave({ company, contactNo, contactPerson, purpose, loc })}
              disabled={processing}
            >
              {processing ? <ActivityIndicator color="#FFF" /> : <Text style={sm.saveBtnText}>STEP IN</Text>}
            </TouchableOpacity>
          </View>
        </View>
      <KeyboardDoneBar />
        </KeyboardSafeView>
    </Modal>
  );
};
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), paddingHorizontal: moderateScale(20), paddingTop: moderateScale(12), maxHeight: '80%' },
  dragHandle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  title: { fontSize: moderateScale(18), fontWeight: '800', color: '#111827', marginBottom: moderateScale(20), marginLeft: 4 },
  footer: { paddingTop: moderateScale(8), paddingBottom: moderateScale(24) },
  saveBtn: { backgroundColor: COLORS.primaryDeep, paddingVertical: moderateScale(18), borderRadius: moderateScale(50), alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: moderateScale(15), fontWeight: '800', letterSpacing: 1 },
});

// ─── Visit History (one whole month, newest first) ────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const currentMonthKey = () => todayStr().slice(0, 7); // YYYY-MM
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const fmtMonthKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

const MonthPickerModal = ({ visible, value, onSelect, onClose }) => {
  const theme = useTheme();
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  useEffect(() => { if (visible) setYear(Number(value.slice(0, 4))); }, [visible, value]);
  if (!visible) return null;

  const [maxY, maxM] = currentMonthKey().split('-').map(Number);
  const accent = theme.isDark ? '#C4B5FD' : '#62338B';

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[mp.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
        {/* Claims taps so only the dimmed area outside the box closes it */}
        <View style={[mp.box, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
          <View style={mp.yearRow}>
            <TouchableOpacity onPress={() => setYear(year - 1)} style={s.dateArrow}>
              <ChevronLeft color={theme.textMuted} size={20} />
            </TouchableOpacity>
            <Text style={[mp.yearText, { color: theme.text }]}>{year}</Text>
            <TouchableOpacity onPress={() => setYear(year + 1)} style={[s.dateArrow, year >= maxY && { opacity: 0.25 }]} disabled={year >= maxY}>
              <ChevronRight color={theme.textMuted} size={20} />
            </TouchableOpacity>
          </View>
          <View style={mp.grid}>
            {MONTHS.map((name, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              const future = year > maxY || (year === maxY && i + 1 > maxM);
              const selected = key === value;
              return (
                <TouchableOpacity
                  key={key}
                  disabled={future}
                  onPress={() => onSelect(key)}
                  style={[
                    mp.cell,
                    { borderColor: theme.border },
                    selected && { backgroundColor: COLORS.primaryDeep, borderColor: COLORS.primaryDeep },
                    future && { opacity: 0.3 },
                  ]}
                >
                  <Text style={[mp.cellText, { color: selected ? '#FFF' : accent }]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const mp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(28) },
  box: { borderRadius: moderateScale(20), padding: moderateScale(16), width: '100%' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: moderateScale(12) },
  yearText: { fontSize: moderateScale(17), fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '31%', paddingVertical: moderateScale(12), borderRadius: moderateScale(12), borderWidth: 1, alignItems: 'center', marginBottom: moderateScale(10) },
  cellText: { fontSize: moderateScale(14), fontWeight: '700' },
});

const VisitHistoryScreen = ({ visible, user, onClose }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonthKey());
  const [allVisits, setAllVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // 'offline' | 'failed' | null
  const [showPicker, setShowPicker] = useState(false);

  // The API returns every visit of the user when no date is sent, so one fetch covers all months;
  // changing the month only re-filters. Pull-to-refresh fetches again.
  const load = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) { setError('offline'); return; }
      const res = await axios.post(API_ENDPOINTS.CUSTOMER_VISIT_HISTORY,
        { user_id: user.user_id, selected_date: '' },
        { timeout: 20000 },
      );
      const raw = res.data?.data || [];
      setAllVisits(Array.isArray(raw) ? raw.map(normalizeVisit) : []);
      setError(null);
    } catch (e) {
      console.log('Visit history error', e);
      setError('failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !user?.user_id) return;
    setMonth(currentMonthKey());
    setLoading(true);
    load();
  }, [visible]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Visits of the chosen month grouped by the date the visit started, newest date first;
  // inside a date the latest visit comes first
  const groups = [];
  allVisits
    .filter(v => (v.created_at || '').slice(0, 7) === month)
    .sort((a, b) => String(b.start_time || b.created_at).localeCompare(String(a.start_time || a.created_at)))
    .forEach((v) => {
      const date = (v.created_at || '').slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.date === date) last.items.push(v);
      else groups.push({ date, items: [v] });
    });

  if (!visible) return null;

  const isCurrentMonth = month === currentMonthKey();
  const accent = theme.isDark ? '#C4B5FD' : '#62338B';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Same iOS top-inset fix as the Going to Meet screen */}
      <SafeAreaView
        edges={Platform.OS === 'ios' ? ['left', 'right', 'bottom'] : undefined}
        style={[s.container, { backgroundColor: theme.bg }, Platform.OS === 'ios' && { paddingTop: insets.top }]}
      >
        <View style={[s.header, { backgroundColor: theme.bg }]}>
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <ChevronLeft color={theme.text} size={28} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]}>My Client Visits</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={[s.dateRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={s.dateArrow}>
            <ChevronLeft color={theme.textMuted} size={20} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPicker(true)} style={[s.dateChip, { backgroundColor: theme.isDark ? '#2D1B69' : '#F3E8FF' }]}>
            <CalendarDays color={accent} size={14} />
            <Text style={[s.dateChipText, { color: accent }]}>{fmtMonthKey(month)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMonth(shiftMonth(month, 1))}
            style={[s.dateArrow, isCurrentMonth && { opacity: 0.25 }]}
            disabled={isCurrentMonth}
          >
            <ChevronRight color={theme.textMuted} size={20} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color="#62338B" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: moderateScale(32) }, groups.length === 0 && { flexGrow: 1 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}
          >
            {groups.length === 0 ? (
              <View style={s.emptyWrap}>
                <CalendarDays color={theme.textMuted} size={48} strokeWidth={1.5} />
                <Text style={[s.emptyText, { color: theme.textMuted, textAlign: 'center' }]}>
                  {error === 'offline' ? 'Connect to the internet to see visit history'
                    : error === 'failed' ? 'Could not load visit history.\nPull down to try again.'
                    : 'No visits in this month'}
                </Text>
              </View>
            ) : groups.map(g => (
              <View key={g.date}>
                <Text style={[hs.dayHeader, { color: theme.text }]}>
                  {fmtDateStr(g.date)}
                  <Text style={{ color: theme.textMuted, fontWeight: '600' }}>  ·  {g.items.length} {g.items.length === 1 ? 'visit' : 'visits'}</Text>
                </Text>
                {g.items.map(v => <VisitCard key={v.id} visit={v} readOnly />)}
              </View>
            ))}
          </ScrollView>
        )}

        <MonthPickerModal
          visible={showPicker}
          value={month}
          onSelect={(key) => { setMonth(key); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      </SafeAreaView>
    </Modal>
  );
};

const hs = StyleSheet.create({
  dayHeader: { fontSize: moderateScale(14), fontWeight: '800', marginBottom: moderateScale(10), marginLeft: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const VisitsScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route?.params?.user;
  // The + sits straight on the SafeAreaView, and an absolute child ignores its bottom padding — so the phone's
  // navigation bar height is added, putting it where Expense's + is (above the navigation bar)
  const insets = useSafeAreaInsets();

  // All hooks must be declared before any conditional return
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visits, setVisits] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(false);
  const [showStepInModal, setShowStepInModal] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingVisit, setPendingVisit] = useState(null);
  const [alertCfg, setAlertCfg] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Latest values for the auto-sync timer below (it lives across renders)
  const visitsRef = useRef(visits);
  visitsRef.current = visits;
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const fetchVisitsRef = useRef(null);
  const autoBusy = useRef(false);
  const fetchSeq = useRef(0); // number of the newest fetchVisits call

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  useEffect(() => {
    if (!user || !user.user_id) return;
    setLoading(true);
    initDB().then(() => fetchVisits(selectedDate));
  }, [selectedDate]);

  // Auto-sync while this screen is open and a visit is still "Pending sync": the moment the connection comes
  // back — and then every 30 s (the address lookup may have been throttled) — sync and refresh the list quietly,
  // so Lat/Lng turns into the street address and the chip flips to "Synced" without pulling to refresh.
  useEffect(() => {
    if (!user || !user.user_id) return undefined;
    let wasOnline = null;
    let lastTry = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped || autoBusy.current) return;
      if (!visitsRef.current.some(isVisitPending)) { wasOnline = null; return; }
      let online = false;
      try { online = !!(await Network.getNetworkStateAsync()).isConnected; } catch (_) {}
      const cameOnline = online && wasOnline === false;
      wasOnline = online;
      if (!online) return;
      if (cameOnline || Date.now() - lastTry >= AUTO_SYNC_RETRY_MS) {
        lastTry = Date.now();
        autoBusy.current = true;
        try { await fetchVisitsRef.current(selectedDateRef.current, { silent: true }); } catch (_) {} finally { autoBusy.current = false; }
      }
    };
    const timer = setInterval(tick, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [user && user.user_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVisits(selectedDate);
    setRefreshing(false);
  };

  // silent: a background refresh (see the auto-sync effect) — no early "local list" flash, the list changes once,
  // when the sync + server answer are in
  const fetchVisits = async (dateStr, opts = {}) => {
    const date = dateStr ?? selectedDate;
    const isToday = date === todayStr();
    // Only the newest fetch may change the list: a background refresh that started before a tap (or before the date
    // was changed) must not put the old list back
    const requestId = ++fetchSeq.current;
    const showVisits = (list) => { if (requestId === fetchSeq.current) setVisits(list); };
    try {
      // A visit that's still open (stepped in but not stepped out) must stay
      // visible and completable regardless of which date is being viewed —
      // it may have been started on an earlier day and carried over past
      // midnight. Sourced from local DB (not the API) so its ID matches what
      // updateVisitStatus queries in SQLite — API IDs (mob_user_locations_pkey)
      // don't exist there, which would make step-in/out silently fail.
      const liveVisits = await getLiveVisits(user.user_id);
      // A visit is listed under the date it STARTED, also when it was stepped out on a later day
      const isOnDate = (v) => visitStartDate(v) === date;

      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        // Offline: local DB for today; for past dates the open visits and the ones still waiting to sync
        if (isToday) {
          const data = await getVisitsByDate(user.user_id, date);
          const liveIds = new Set(liveVisits.map(v => v.id));
          showVisits([...liveVisits, ...(data || []).filter(v => !liveIds.has(v.id))]);
        } else {
          // Plus visits completed but not on the server yet: started on this date, stepped out today while offline,
          // they would otherwise be on no list at all until they sync
          const notSent = (await getVisitsByDate(user.user_id, date).catch(() => [])).filter(v => v.sync_status === 'PENDING' && v.status === 'COMPLETED');
          showVisits([...liveVisits.filter(isOnDate), ...notSent]);
        }
      } else {
        // Online: show the local list straight away (today only), sync pending
        // visits — waiting only for the visits step, not leaves/regularization —
        // then replace it with the API list
        if (isToday) {
          if (!opts.silent) {
            try {
              const data = await getVisitsByDate(user.user_id, date);
              const liveIds = new Set(liveVisits.map(v => v.id));
              showVisits([...liveVisits, ...(data || []).filter(v => !liveIds.has(v.id))]);
              setLoading(false);
            } catch (_) {}
          }
          await new Promise((resolve) => {
            SyncService.syncAll({ onVisitsSynced: resolve }).catch(resolve);
          });
        }
        const res = await axios.post(API_ENDPOINTS.CUSTOMER_VISIT_HISTORY,
          { user_id: user.user_id, selected_date: date },
          { timeout: 10000 },
        );
        const raw = res.data?.data || res.data || [];
        const normalized = Array.isArray(raw) ? raw.map(normalizeVisit) : [];
        // Completed visits come from the API; open ones always come from local DB.
        const apiCompleted = normalized.filter(v => v.status !== 'REACHED' && v.status !== 'step_in');

        // A completed visit still PENDING (held back for an address retry) isn't on the server yet:
        // keep showing the phone's copy instead of letting it vanish until it syncs
        let heldLocal = [];
        try {
          const local = await getVisitsByDate(user.user_id, date);
          heldLocal = (local || []).filter(v => v.sync_status === 'PENDING' && v.status === 'COMPLETED');
        } catch (_) {}
        // Open visits are read again here: the copy from before the sync still says "Pending sync" and Lat/Lng
        const liveNow = await getLiveVisits(user.user_id);
        showVisits([...(isToday ? liveNow : liveNow.filter(isOnDate)), ...heldLocal, ...apiCompleted]);
      }
    } catch (e) {
      console.log('Fetch visits error', e);
      // Fallback to local DB on API error (today only)
      if (isToday) {
        try {
          const data = await getVisitsByDate(user.user_id, date);
          showVisits(data || []);
        } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  fetchVisitsRef.current = fetchVisits;

  const changeDate = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const today = new Date(); today.setHours(0,0,0,0);
    if (d > today) return;
    const pad = n => String(n).padStart(2, '0');
    setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
  };

  const handleSaveNewVisit = async (details) => {
    setProcessing(true);
    try {
      const clock = await verifyDeviceClock();
      if (!clock.ok) {
        setProcessing(false);
        showAlert('warning', 'Clock Not Synced', clock.message);
        return;
      }
      // Ensure DB ready
      await initDB();

      const id = await saveVisitLocal({
        userId: user.user_id,
        clientName: details.company,
        contactNumber: details.contactNo,
        contactPerson: details.contactPerson,
        purpose: details.purpose,
        location: details.locText || '',
        lat: details.lat || 0,
        lng: details.lng || 0,
      });
      // Immediately set REACHED
      await updateVisitStatus(id, 'REACHED', {
        startTime: new Date().toISOString(), lat: details.lat || 0, lng: details.lng || 0,
        startOffline: await isOfflineNow(),
      });
      recordAudit(`started client visit:${details.company}`, {
        'Contact person': details.contactPerson, 'Contact number': details.contactNo, Purpose: details.purpose,
        Location: details.locText, Latitude: details.lat ? Number(details.lat).toFixed(5) : '', Longitude: details.lng ? Number(details.lng).toFixed(5) : '',
      });
      setShowStartScreen(false);
      setSelectedDate(todayStr());
      fetchVisits(todayStr());
    } catch (e) {
      console.error('Visit Save Error:', e);
      showAlert('error', 'Error', 'Failed to save visit record. Please try again.');
    } finally { setProcessing(false); }
  };

  const onStepInClick = (v) => {
    setPendingVisit(v);
    setShowStepInModal(true);
  };

  const handleConfirmStepIn = async (details) => {
    setProcessing(true);
    try {
      // Clock check and GPS/address run side by side instead of one after the other
      // The location shown in the sheet is what is saved; not loaded yet -> fetch it now
      const [clock, { lat, lng, address, offline }] = await Promise.all([verifyDeviceClock(), details.loc || getAddress()]);
      if (!clock.ok) {
        setProcessing(false);
        showAlert('warning', 'Clock Not Synced', clock.message);
        return;
      }
      await updateVisitStatus(pendingVisit.id, 'step_in', {
        stepInTime: new Date().toISOString(), lat, lng, address, offline,
        clientName: details.company,
        contactNumber: details.contactNo,
        contactPerson: details.contactPerson,
        purpose: details.purpose,
      });
      recordAudit(`stepped in at client:${details.company}`, {
        Location: address, Latitude: lat ? Number(lat).toFixed(5) : '', Longitude: lng ? Number(lng).toFixed(5) : '',
        'Contact person': details.contactPerson, 'Contact number': details.contactNo, Purpose: details.purpose,
      });
      // fetchVisits() syncs when viewing today; otherwise sync here (fire-and-forget)
      if (selectedDate !== todayStr()) syncIfOnline();
      setShowStepInModal(false);
      setPendingVisit(null);
      fetchVisits();
    } catch (e) {
      showAlert('error', 'Error', 'Failed to step in. Please try again.');
    } finally { setProcessing(false); }
  };

  const onStepOutClick = (v) => {
    setPendingVisit(v);
    setConfirmVisible(true);
  };

  const doStepOut = async (shownLoc) => {
    setConfirmVisible(false);
    setProcessing(true);
    try {
      // The location shown in the dialog is what is saved; not loaded yet -> fetch it now
      const [clock, { lat, lng, address, offline }] = await Promise.all([verifyDeviceClock(), shownLoc || getAddress()]);
      if (!clock.ok) {
        setProcessing(false);
        setPendingVisit(null);
        showAlert('warning', 'Clock Not Synced', clock.message);
        return;
      }
      await updateVisitStatus(pendingVisit.id, 'COMPLETED', {
        endTime: new Date().toISOString(),
        lat, lng, address, offline
      });
      recordAudit(`stepped out from client:${pendingVisit.client_name || ''}`, {
        Location: address, Latitude: lat ? Number(lat).toFixed(5) : '', Longitude: lng ? Number(lng).toFixed(5) : '',
      });
      // fetchVisits() syncs when viewing today; otherwise sync here (fire-and-forget)
      if (selectedDate !== todayStr()) syncIfOnline();
      fetchVisits();
      showAlert('success', 'Visit Completed', 'Client visit has been closed.');
    } catch (_) { showAlert('error', 'Error', 'Failed to step-out.'); }
    finally { setProcessing(false); setPendingVisit(null); }
  };

  const syncIfOnline = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) SyncService.syncAll();
    } catch (_) { }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Client Visits</Text>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={s.backBtn}>
          <History color={theme.text} size={22} />
        </TouchableOpacity>
      </View>

      {/* Date selector row */}
      <View style={[s.dateRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={s.dateArrow}>
          <ChevronLeft color={theme.textMuted} size={20} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[s.dateChip, { backgroundColor: theme.isDark ? '#2D1B69' : '#F3E8FF' }]}>
          <CalendarDays color={theme.isDark ? '#C4B5FD' : '#62338B'} size={14} />
          <Text style={[s.dateChipText, { color: theme.isDark ? '#C4B5FD' : '#62338B' }]}>
            {selectedDate === todayStr() ? 'Today' : fmtDateStr(selectedDate)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => changeDate(1)}
          style={[s.dateArrow, selectedDate === todayStr() && { opacity: 0.25 }]}
          disabled={selectedDate === todayStr()}
        >
          <ChevronRight color={theme.textMuted} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#62338B" />
        </View>
      ) : visits.length === 0 ? (
        <View style={s.emptyWrap}>
          <CalendarDays color={theme.textMuted} size={48} strokeWidth={1.5} />
          <Text style={[s.emptyText, { color: theme.textMuted }]}>No visits on this date</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: moderateScale(100) + insets.bottom }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}>
          {sortVisitsNewestFirst(visits).map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              onStepIn={onStepInClick}
              onStepOut={onStepOutClick}
              processing={processing}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB — only for today */}
      {selectedDate === todayStr() && (
        <View style={[s.fabWrap, { bottom: 24 + insets.bottom }]}>
          <TouchableOpacity
            style={s.fab}
            activeOpacity={0.8}
            onPress={() => {
              const hasActive = visits.some(v => v.status === 'REACHED' || v.status === 'step_in');
              if (hasActive) {
                showAlert('warning', 'Visit In Progress', 'Please complete the current visit before starting a new one.');
                return;
              }
              setShowStartScreen(true);
            }}
          >
            <Plus color="#FFF" size={28} />
          </TouchableOpacity>
        </View>
      )}

      {showDatePicker && (
        Platform.OS === 'ios' ? (
          <Modal transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
            <TouchableOpacity style={[s.dateModalOverlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
              {/* Claims taps so only the dimmed area outside the sheet closes it */}
              <View style={[s.dateModalSheet, { backgroundColor: theme.card, paddingBottom: Math.max(moderateScale(36), insets.bottom + moderateScale(16)) }]} onStartShouldSetResponder={() => true}>
                <View style={[s.dateModalHandle, { backgroundColor: theme.border }]} />
                <DateTimePicker
                  value={new Date(selectedDate + 'T00:00:00')}
                  mode="date"
                  display="spinner"
                  themeVariant={theme.isDark ? 'dark' : 'light'}
                  textColor={theme.text}
                  maximumDate={new Date()}
                  onChange={(event, date) => {
                    if (date) {
                      const pad = n => String(n).padStart(2, '0');
                      setSelectedDate(`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`);
                    }
                  }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity style={[s.dateModalDoneBtn, { borderColor: theme.border }]} onPress={() => setShowDatePicker(false)}>
                  <Text style={[s.dateModalDoneText, { color: theme.text }]}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        ) : (
          <DateTimePicker
            value={new Date(selectedDate + 'T00:00:00')}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) {
                const pad = n => String(n).padStart(2, '0');
                setSelectedDate(`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`);
              }
            }}
          />
        )
      )}

      <StartVisitScreen
        visible={showStartScreen}
        onClose={() => setShowStartScreen(false)}
        onSave={handleSaveNewVisit}
        processing={processing}
      />
      <StepInModal
        visible={showStepInModal}
        visit={pendingVisit}
        onClose={() => setShowStepInModal(false)}
        onSave={handleConfirmStepIn}
        processing={processing}
      />
      <ConfirmModal
        visible={confirmVisible}
        onConfirm={(loc) => doStepOut(loc)}
        onCancel={() => setConfirmVisible(false)}
        processing={processing}
      />
      <VisitHistoryScreen
        visible={showHistory}
        user={user}
        onClose={() => setShowHistory(false)}
      />
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56), backgroundColor: '#FFF' },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', color: '#111827' },
  scroll: { padding: moderateScale(16), paddingTop: moderateScale(20), paddingBottom: moderateScale(100) }, // room for the + button

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Same corner, size and look as Expense's + (bottom gets the navigation bar height in the render)
  fabWrap: { position: 'absolute', bottom: 24, right: 24, zIndex: 99 },
  fab: { width: moderateScale(60), height: moderateScale(60), borderRadius: moderateScale(30), backgroundColor: COLORS.primaryDeep, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(10), borderBottomWidth: 1 },
  dateArrow: { width: moderateScale(36), height: moderateScale(36), justifyContent: 'center', alignItems: 'center' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(6), paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8), borderRadius: moderateScale(20), backgroundColor: '#F3E8FF' },
  dateChipText: { fontSize: moderateScale(14), fontWeight: '700' },

  dateModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  dateModalSheet: { borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(20), paddingBottom: moderateScale(36), alignItems: 'center' },
  dateModalHandle: { width: moderateScale(40), height: 4, borderRadius: 2, marginBottom: moderateScale(16) },
  dateModalDoneBtn: { width: '100%', marginTop: moderateScale(12), paddingVertical: moderateScale(14), borderRadius: moderateScale(12), alignItems: 'center', borderWidth: 1 },
  dateModalDoneText: { fontSize: moderateScale(15), fontWeight: '700' },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: moderateScale(12) },
  emptyText: { fontSize: moderateScale(15), fontWeight: '600' },
});

export default VisitsScreen;

