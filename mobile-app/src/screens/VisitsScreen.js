import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Modal, Platform, Animated, KeyboardAvoidingView, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CustomAlert from '../components/CustomAlert';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, CheckCircle, Plus, Phone } from 'lucide-react-native';
import * as Location from 'expo-location';
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { getTodayVisits, saveVisitLocal, updateVisitStatus, initDB } from '../services/LocalDB';
import SyncService from '../services/SyncService';
import { verifyDeviceClock } from '../services/TimeCheck';
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
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return ''; }
};

// Detect if a location string is raw lat/lng (offline format) and resolve it
const LAT_LNG_REGEX = /Lat:\s*(-?\d+\.\d+),\s*Lng:\s*(-?\d+\.\d+)/i;
const resolveAddress = async (locationStr) => {
  if (!locationStr) return locationStr;
  const match = locationStr.match(LAT_LNG_REGEX);
  if (!match) return locationStr; // Already a readable address
  try {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) return locationStr;
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (geo && geo.length > 0) {
      const g = geo[0];
      const parts = [g.name || g.street, g.district || g.subregion || g.city, g.region].filter(Boolean);
      if (parts.length > 0) return [...new Set(parts)].join(', ');
    }
  } catch (_) { }
  return locationStr;
};

const getAddress = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { address: 'Location permission denied', lat: 0, lng: 0 };

    let loc = null;
    try {
      // Primary attempt: high accuracy with timeout
      loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
      ]);
    } catch (e) {
      console.log('[Visits] High accuracy timeout/error, trying last known...');
      loc = await Location.getLastKnownPositionAsync();
    }

    if (!loc) return { address: 'Location unavailable', lat: 0, lng: 0 };

    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    let addressStr = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

    try {
      // Reverse geocode only if online
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
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
const TimelineStep = ({ time, location, label, labelColor, labelBg, done, isLast }) => {
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
        {time ? <Text style={[tl.time, { color: theme.text }]}>{time}</Text> : <Text style={[tl.timePlaceholder, { color: theme.textMuted }]}>--:--:--</Text>}
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
  time: { fontSize: moderateScale(13), fontWeight: '700', color: '#111827' },
  timePlaceholder: { fontSize: moderateScale(13), fontWeight: '700', color: '#9CA3AF' },
  badge: { paddingHorizontal: moderateScale(10), paddingVertical: 3, borderRadius: moderateScale(6) },
  badgeText: { fontSize: moderateScale(9), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  locRow: { flexDirection: 'row', alignItems: 'flex-start' },
  loc: { fontSize: moderateScale(11), color: '#9CA3AF', flex: 1, lineHeight: 16 },
});

// ─── Visit Card ───────────────────────────────────────────────────────────────
const VisitCard = ({ visit, onStepIn, onStepOut, processing }) => {
  const theme = useTheme();
  const isLive = visit.status === 'REACHED' || visit.status === 'step_in';

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
          <Text style={[cs.clientName, { color: theme.text }]}>{visit.client_name}</Text>
          <View style={cs.liveBadge}>
            <Animated.View style={[cs.liveDot, { transform: [{ scale: pulse }] }]} />
            <Text style={cs.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={[cs.liveTimeText, { color: theme.textLight }]}>{fmtTime(visit.start_time)} {fmtDate(visit.start_time)}</Text>
        <Text style={[cs.liveLocText, { color: theme.textLight }]}>Location: {resolvedLocation}</Text>

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
        <Text style={[cs.clientName, { color: theme.text }]}>{visit.client_name}</Text>
        <Text style={[cs.date, { color: theme.textMuted }]}>{dateStr}</Text>
        <Text style={[cs.contactText, { color: theme.textMuted }]}>{contactPerson}: {contactNo}</Text>
      </View>

      <View style={cs.timeline}>
        {hasStart && (
          <TimelineStep time={fmtTime(visit.start_time)} location={visit.location || location} label="START" labelBg="#EDE9FE" labelColor="#7C3AED" done={hasStart} isLast={!hasStepIn} />
        )}
        {hasStepIn && (
          <TimelineStep time={fmtTime(visit.step_in_time)} location={resolvedStepIn || location} label="STEP IN" labelBg="#DCFCE7" labelColor="#16A34A" done={hasStepIn} isLast={!hasStepOut} />
        )}
        {hasStepOut && (
          <TimelineStep time={fmtTime(visit.end_time)} location={resolvedEnd || location} label="STEP OUT" labelBg="#FCE4EC" labelColor="#C2185B" done={hasStepOut} isLast={true} />
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
  liveLocText: { fontSize: moderateScale(12), color: '#4B5563', marginBottom: moderateScale(16), lineHeight: 18 },
  purpleBtnFull: { backgroundColor: '#62338B', paddingVertical: moderateScale(14), borderRadius: moderateScale(50), alignItems: 'center' },
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

const ConfirmModal = ({ visible, onConfirm, onCancel, processing }) => {
  const theme = useTheme();
  return (
  <Modal visible={visible} transparent animationType="fade">
    <View style={[cm.overlay, { backgroundColor: theme.modalOverlay }]}>
      <View style={[cm.box, { backgroundColor: theme.card }]}>
        <View style={[cm.iconWrap, { backgroundColor: theme.isDark ? '#3B1E5C' : '#F3E8FF' }]}><BanIcon /></View>
        <Text style={[cm.title, { color: theme.text }]}>Are you sure you want to{"\n"}Confirm Step Out?</Text>
        <Text style={[cm.desc, { color: theme.textMuted }]}>You'll marked as stepped out from{"\n"}the customer you visited.</Text>
        <View style={cm.row}>
          <TouchableOpacity style={[cm.cancelBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onCancel} activeOpacity={0.8} disabled={processing}>
            <Text style={[cm.cancelText, { color: theme.text }]}>No, Go back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[cm.confirmBtn, processing && { opacity: 0.6 }]} onPress={onConfirm} activeOpacity={0.8} disabled={processing}>
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
  desc: { fontSize: moderateScale(13), color: '#9CA3AF', textAlign: 'center', marginBottom: moderateScale(28), lineHeight: 20 },
  row: { flexDirection: 'row', gap: moderateScale(12), width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: moderateScale(15), borderRadius: moderateScale(50), backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText: { fontSize: moderateScale(14), fontWeight: '800', color: '#374151' },
  confirmBtn: { flex: 1, paddingVertical: moderateScale(15), borderRadius: moderateScale(50), backgroundColor: '#581C87', alignItems: 'center' },
  confirmText: { fontSize: moderateScale(14), fontWeight: '800', color: '#FFF' },
});


// ─── Input Components ────────────────────────────────────────────────────────
const FloatInput = ({ label, value, onChangeText, keyboardType, multiline, maxLength }) => {
  const theme = useTheme();
  return (
  <View style={[fi.wrap, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}>
    <Text style={[fi.label, { color: theme.textMuted }]}>{label}</Text>
    <TextInput
      style={[fi.input, { color: theme.text }, multiline && fi.multiline]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      maxLength={maxLength}
      placeholderTextColor={theme.textMuted}
    />
  </View>
  );
};

const fi = StyleSheet.create({
  wrap: { marginBottom: moderateScale(14), borderWidth: 1, borderColor: '#E5E7EB', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingTop: moderateScale(6), paddingBottom: 4 },
  label: { fontSize: moderateScale(10), fontWeight: '600', color: '#9CA3AF', marginBottom: 2 },
  input: { fontSize: moderateScale(14), color: '#111827', fontWeight: '600', paddingVertical: 2 },
  multiline: { height: moderateScale(72), textAlignVertical: 'top' },
});

// ─── Going to Meet (Fullscreen START Component) ───────────────────────────
const DISCLOSURE_KEY = 'location_disclosure_accepted_v1';

const StartVisitScreen = ({ visible, onClose, onSave, processing }) => {
  const theme = useTheme();
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
    if (!company.trim()) { showAlert('warning', 'Company Required', 'Please enter the Company / Customer name.'); return; }
    if (!contactPerson.trim()) { showAlert('warning', 'Name Required', 'Please enter the Contact Person name.'); return; }
    if (fetchingLoc) { showAlert('info', 'Please Wait', 'We are still fetching your current location.'); return; }
    onSave({ company, contactNo, contactPerson, purpose, locText, ...locCoords });
    reset();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[sv.container, { backgroundColor: theme.bg }]}>
        <View style={[sv.headerRow, { backgroundColor: theme.bg }]}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }} style={sv.backBtn}>
            <ChevronLeft color={theme.text} size={28} />
          </TouchableOpacity>
          <Text style={[sv.title, { color: theme.text }]}>Going to Meet</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={sv.scroll} keyboardShouldPersistTaps="handled">
            <View style={sv.locChipBox}>
              <View style={sv.locWrap}>
                <MapPin color="#7C3AED" size={14} />
                <Text style={sv.locLabel}>Your Current Location</Text>
              </View>
              {fetchingLoc ? (
                <ActivityIndicator size="small" color="#7C3AED" style={{ marginTop: 4 }} />
              ) : (
                <Text style={sv.locText} numberOfLines={2}>{locText}</Text>
              )}
            </View>

            <View style={[sv.formWrap, { backgroundColor: theme.card }]}>
              <FloatInput label="Enter Company / Customer you visit" value={company} onChangeText={setCompany} maxLength={30} />
              <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} maxLength={30} />
              <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" maxLength={30} />
              <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={100} />
            </View>
          </ScrollView>

          <View style={[sv.footer, { backgroundColor: theme.bg }]}>
            <TouchableOpacity
              style={[sv.startBtn, (!company.trim() || !contactPerson.trim() || processing) && { backgroundColor: theme.cardSoft }]}
              onPress={handleSave}
              disabled={fetchingLoc || processing || !company.trim() || !contactPerson.trim()}
            >
              {processing ? <ActivityIndicator color="#62338B" /> : <Text style={[sv.startBtnText, (!company.trim() || !contactPerson.trim()) && { color: theme.textMuted }]}>START</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <LocationDisclosureModal
          visible={showDisclosure}
          onAccept={async () => {
            setShowDisclosure(false);
            try { await AsyncStorage.setItem(DISCLOSURE_KEY, 'true'); } catch (_) {}
            doFetchAddress(false);
          }}
          onDecline={() => {
            setShowDisclosure(false);
            setLocText('Location access denied');
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
  locChipBox: { backgroundColor: '#F5F3FF', borderRadius: moderateScale(12), padding: moderateScale(16), alignItems: 'center', marginBottom: moderateScale(24), borderWidth: 1, borderColor: '#EDE9FE' },
  locWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4, alignSelf: 'center' },
  locLabel: { fontSize: moderateScale(12), fontWeight: '700', color: '#6D28D9', marginLeft: moderateScale(6), textAlign: 'center' },
  locText: { fontSize: moderateScale(12), color: '#4C1D95', textAlign: 'center', lineHeight: 18, width: '100%' },
  formWrap: { backgroundColor: '#FFF', padding: moderateScale(16), borderRadius: moderateScale(16), ...SHADOWS.light },
  footer: { padding: moderateScale(20), backgroundColor: '#F9FAFB' },
  startBtn: { backgroundColor: '#62338B', paddingVertical: moderateScale(18), borderRadius: moderateScale(50), alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: moderateScale(15), fontWeight: '800', letterSpacing: 1 },
});

// ─── Enter Details (Bottom Sheet for STEP IN) ────────────────────────────────
const StepInModal = ({ visible, visit, onClose, onSave, processing }) => {
  const theme = useTheme();
  const [company, setCompany] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [purpose, setPurpose] = useState('');

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={[sm.overlay, { backgroundColor: theme.modalOverlay }]}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={[sm.sheet, { backgroundColor: theme.card }]}>
          <View style={[sm.dragHandle, { backgroundColor: theme.border }]} />
          <Text style={[sm.title, { color: theme.text }]}>Enter details</Text>

          <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <FloatInput label="Enter Company / Customer you visit" value={company} onChangeText={setCompany} maxLength={30} />
            <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" maxLength={30} />
            <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} maxLength={30} />
            <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={100} />
          </ScrollView>

          <View style={sm.footer}>
            <TouchableOpacity
              style={[sm.saveBtn, processing && { opacity: 0.7 }]}
              onPress={() => onSave({ company, contactNo, contactPerson, purpose })}
              disabled={processing}
            >
              {processing ? <ActivityIndicator color="#FFF" /> : <Text style={sm.saveBtnText}>STEP IN</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), paddingHorizontal: moderateScale(20), paddingTop: moderateScale(12), maxHeight: '80%' },
  dragHandle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  title: { fontSize: moderateScale(18), fontWeight: '800', color: '#111827', marginBottom: moderateScale(20), marginLeft: 4 },
  footer: { paddingTop: moderateScale(8), paddingBottom: Platform.OS === 'ios' ? moderateScale(28) : moderateScale(16) },
  saveBtn: { backgroundColor: '#62338B', paddingVertical: moderateScale(18), borderRadius: moderateScale(50), alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: moderateScale(15), fontWeight: '800', letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const VisitsScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route?.params?.user;

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

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  useEffect(() => {
    if (!user || !user.user_id) return;
    initDB().then(() => fetchVisits());
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVisits();
    setRefreshing(false);
  };

  const fetchVisits = async () => {
    try {
      const data = await getTodayVisits(user.user_id);
      setVisits(data || []);
    } catch (e) {
      console.log('Fetch error', e);
    } finally {
      setLoading(false);
    }
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
      });
      syncIfOnline(); // Fire and forget sync
      setShowStartScreen(false);
      fetchVisits();
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
      const clock = await verifyDeviceClock();
      if (!clock.ok) {
        setProcessing(false);
        showAlert('warning', 'Clock Not Synced', clock.message);
        return;
      }
      const { lat, lng, address } = await getAddress();
      await updateVisitStatus(pendingVisit.id, 'step_in', {
        stepInTime: new Date().toISOString(), lat, lng, address,
        clientName: details.company,
        contactNumber: details.contactNo,
        contactPerson: details.contactPerson,
        purpose: details.purpose,
      });
      syncIfOnline(); // fire-and-forget — UI updates instantly
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

  const doStepOut = async () => {
    setConfirmVisible(false);
    setProcessing(true);
    try {
      const clock = await verifyDeviceClock();
      if (!clock.ok) {
        setProcessing(false);
        setPendingVisit(null);
        showAlert('warning', 'Clock Not Synced', clock.message);
        return;
      }
      const { lat, lng, address } = await getAddress();
      await updateVisitStatus(pendingVisit.id, 'COMPLETED', {
        endTime: new Date().toISOString(),
        lat, lng, address
      });
      syncIfOnline(); // fire-and-forget — UI updates instantly
      fetchVisits();
      showAlert('success', 'Visit Completed', 'Customer visit has been closed.');
    } catch (_) { showAlert('error', 'Error', 'Failed to step-out.'); }
    finally { setProcessing(false); setPendingVisit(null); }
  };

  const syncIfOnline = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) await SyncService.syncAll();
    } catch (_) { }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>My Customer Visits</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#62338B" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}>
          {visits.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              onStepIn={onStepInClick}
              onStepOut={onStepOutClick}
              processing={processing}
            />
          ))}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* FAB */}
      <View style={s.fabWrap}>
        <TouchableOpacity
          style={s.fab}
          onPress={() => {
            const hasActive = visits.some(v => v.status === 'REACHED' || v.status === 'step_in');
            if (hasActive) {
              showAlert('warning', 'Visit In Progress', 'Please complete the current visit before starting a new one.');
              return;
            }
            setShowStartScreen(true);
          }}
        >
          <Plus color="#FFF" size={28} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

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
        onConfirm={doStepOut}
        onCancel={() => setConfirmVisible(false)}
        processing={processing}
      />
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56), backgroundColor: '#FFF' },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800', color: '#111827' },
  scroll: { padding: moderateScale(16), paddingTop: moderateScale(20), paddingBottom: moderateScale(110) },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fabWrap: { position: 'absolute', bottom: 100, right: 20, zIndex: 99 },
  fab: { width: moderateScale(64), height: moderateScale(64), borderRadius: moderateScale(32), backgroundColor: '#62338B', justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
});

export default VisitsScreen;

