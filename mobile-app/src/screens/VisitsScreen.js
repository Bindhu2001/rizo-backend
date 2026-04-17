import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, Platform, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, CheckCircle, Plus, Phone } from 'lucide-react-native';
import * as Location from 'expo-location';
import { COLORS, SHADOWS } from '../components/Theme';
import { getTodayVisits, saveVisitLocal, updateVisitStatus, initDB } from '../services/LocalDB';
import SyncService from '../services/SyncService';
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

const getAddress = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { address: 'Location permission denied', lat: 0, lng: 0 };

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;

    let addressStr = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

    try {
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const g = geo?.[0] || {};
      const parts = [g.name, g.street, g.city, g.region, g.country].filter(Boolean);
      if (parts.length > 0) addressStr = parts.join(', ');
    } catch (_) { }

    return { address: addressStr, lat, lng };
  } catch (_) { return { address: 'Unable to fetch location', lat: 0, lng: 0 }; }
};

// ─── Timeline Step Row (For Completed Visits) ─────────────────────────
const TimelineStep = ({ time, location, label, labelColor, labelBg, done, isLast }) => (
  <View style={tl.row}>
    <View style={tl.left}>
      <View style={[tl.dot, done && tl.dotDone]}>
        {done && <CheckCircle color="#FFF" size={10} strokeWidth={3} />}
      </View>
      {!isLast && <View style={tl.line} />}
    </View>
    <View style={tl.content}>
      <View style={tl.topRow}>
        {time ? <Text style={tl.time}>{time}</Text> : <Text style={tl.timePlaceholder}>--:--:--</Text>}
        <View style={[tl.badge, { backgroundColor: labelBg }]}>
          <Text style={[tl.badgeText, { color: labelColor }]}>{label}</Text>
        </View>
      </View>
      <View style={tl.locRow}>
        <Text style={tl.loc} numberOfLines={2}>Location: {location}</Text>
      </View>
    </View>
  </View>
);

const tl = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 0 },
  left: { alignItems: 'center', width: 28, marginRight: 10 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#D1D5DB',
  },
  dotDone: { backgroundColor: '#22C55E', borderColor: '#16A34A' },
  line: { width: 2, flex: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  content: { flex: 1, paddingBottom: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  time: { fontSize: 13, fontWeight: '700', color: '#111827' },
  timePlaceholder: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  locRow: { flexDirection: 'row', alignItems: 'flex-start' },
  loc: { fontSize: 11, color: '#9CA3AF', flex: 1, lineHeight: 16 },
});

// ─── Visit Card ───────────────────────────────────────────────────────────────
const VisitCard = ({ visit, onStepIn, onStepOut }) => {
  const isLive = visit.status === 'REACHED' || visit.status === 'step_in';

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
      <View style={[cs.card, { borderColor: '#E5E7EB', borderWidth: 1 }]}>
        <View style={cs.cardHeader}>
          <Text style={cs.clientName}>{visit.client_name}</Text>
          <View style={cs.liveBadge}>
            <Animated.View style={[cs.liveDot, { transform: [{ scale: pulse }] }]} />
            <Text style={cs.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={cs.liveTimeText}>{fmtTime(visit.start_time)} {fmtDate(visit.start_time)}</Text>
        <Text style={cs.liveLocText}>Location: {visit.location}</Text>

        <TouchableOpacity
          style={cs.purpleBtnFull}
          onPress={() => visit.status === 'REACHED' ? onStepIn(visit) : onStepOut(visit)}
          activeOpacity={0.8}
        >
          <Text style={cs.purpleBtnText}>{visit.status === 'REACHED' ? 'STEP IN' : 'STEP OUT'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Completed Timeline View
  const hasStart = !!visit.start_time;
  const hasStepIn = !!visit.step_in_time;
  const hasStepOut = !!visit.end_time;

  const location = visit.location || '';
  const contactNo = visit.contact_number || '';
  const contactPerson = visit.contact_person || visit.client_name;
  const dateStr = visit.created_at ? fmtDate(visit.created_at) : '';

  return (
    <View style={cs.card}>
      <View style={cs.compHeader}>
        <Text style={cs.clientName}>{visit.client_name}</Text>
        <Text style={cs.date}>{dateStr}</Text>
        <Text style={cs.contactText}>{contactPerson}: {contactNo}</Text>
      </View>

      <View style={cs.timeline}>
        {hasStart && (
          <TimelineStep time={fmtTime(visit.start_time)} location={visit.location || location} label="START" labelBg="#EDE9FE" labelColor="#7C3AED" done={hasStart} isLast={!hasStepIn} />
        )}
        {hasStepIn && (
          <TimelineStep time={fmtTime(visit.step_in_time)} location={visit.step_in_address || location} label="STEP IN" labelBg="#DCFCE7" labelColor="#16A34A" done={hasStepIn} isLast={!hasStepOut} />
        )}
        {hasStepOut && (
          <TimelineStep time={fmtTime(visit.end_time)} location={visit.end_address || location} label="STEP OUT" labelBg="#FCE4EC" labelColor="#C2185B" done={hasStepOut} isLast={true} />
        )}
      </View>
    </View>
  );
};

const cs = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOWS.light },
  // Live Card Headers
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  clientName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#FCA5A5' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 4 },
  liveText: { fontSize: 10, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },
  liveTimeText: { fontSize: 13, color: '#4B5563', marginBottom: 4, fontWeight: '600' },
  liveLocText: { fontSize: 12, color: '#4B5563', marginBottom: 16, lineHeight: 18 },
  purpleBtnFull: { backgroundColor: '#62338B', paddingVertical: 14, borderRadius: 50, alignItems: 'center' },
  purpleBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  // Completed Headers
  compHeader: { marginBottom: 16 },
  date: { fontSize: 12, color: '#9CA3AF', marginBottom: 2, marginTop: 4 },
  contactText: { fontSize: 12, color: '#9CA3AF' },
  timeline: { marginLeft: 0 },
});

// ─── Prohibited / Ban-circle Icon ─────────────────────────────────────────────
const BanIcon = () => (
  <View style={cm.banOuter}>
    <View style={cm.banDiag} />
  </View>
);

const ConfirmModal = ({ visible, onConfirm, onCancel }) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={cm.overlay}>
      <View style={cm.box}>
        <View style={cm.iconWrap}><BanIcon /></View>
        <Text style={cm.title}>Are you sure you want to{"\n"}Confirm Step Out?</Text>
        <Text style={cm.desc}>You'll marked as stepped out from{"\n"}the customer you visited.</Text>
        <View style={cm.row}>
          <TouchableOpacity style={cm.cancelBtn} onPress={onCancel} activeOpacity={0.8}><Text style={cm.cancelText}>No, Go back</Text></TouchableOpacity>
          <TouchableOpacity style={cm.confirmBtn} onPress={onConfirm} activeOpacity={0.8}><Text style={cm.confirmText}>Yes, Confirm</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  box: { backgroundColor: '#FFF', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
  iconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  banOuter: { width: 44, height: 44, borderRadius: 22, borderWidth: 3.5, borderColor: '#62338B', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  banDiag: { position: 'absolute', width: 3.5, height: 52, backgroundColor: '#62338B', transform: [{ rotate: '45deg' }] },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  desc: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 15, borderRadius: 50, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '800', color: '#374151' },
  confirmBtn: { flex: 1, paddingVertical: 15, borderRadius: 50, backgroundColor: '#581C87', alignItems: 'center' },
  confirmText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
});


// ─── Input Components ────────────────────────────────────────────────────────
const FloatInput = ({ label, value, onChangeText, keyboardType, multiline }) => (
  <View style={fi.wrap}>
    <Text style={fi.label}>{label}</Text>
    <TextInput
      style={[fi.input, multiline && fi.multiline]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
    />
  </View>
);

const fi = StyleSheet.create({
  wrap: { marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 },
  label: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', marginBottom: 2 },
  input: { fontSize: 14, color: '#111827', fontWeight: '600', paddingVertical: 2 },
  multiline: { height: 72, textAlignVertical: 'top' },
});

// ─── Going to Meet (Fullscreen START Component) ───────────────────────────
const StartVisitScreen = ({ visible, onClose, onSave, processing }) => {
  const [company, setCompany] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [purpose, setPurpose] = useState('');
  const [locText, setLocText] = useState('');
  const [locCoords, setLocCoords] = useState({ lat: 0, lng: 0 });
  const [fetchingLoc, setFetchingLoc] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const fetch = async () => {
      setFetchingLoc(true);
      const result = await getAddress();
      if (!cancelled) {
        setLocText(result.address);
        setLocCoords({ lat: result.lat, lng: result.lng });
        setFetchingLoc(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [visible]);

  const reset = () => {
    setCompany(''); setContactNo(''); setContactPerson(''); setPurpose('');
  };

  const handleSave = () => {
    if (!company.trim()) { Alert.alert('Error', 'Please enter Company name'); return; }
    if (fetchingLoc) { Alert.alert('Please wait', 'Fetching location...'); return; }
    onSave({ company, contactNo, contactPerson, purpose, locText, ...locCoords });
    reset();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={sv.container}>
        <View style={sv.headerRow}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }} style={sv.backBtn}>
            <ChevronLeft color="#111827" size={26} />
          </TouchableOpacity>
          <Text style={sv.title}>Going to Meet</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={sv.scroll}>
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

          <View style={sv.formWrap}>
            <FloatInput label="Enter Company / Customer you visit" value={company} onChangeText={setCompany} />
            <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" />
            <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} />
            <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline />
          </View>
        </ScrollView>

        <View style={sv.footer}>
          <TouchableOpacity
            style={[sv.startBtn, (!company.trim() || processing) && { backgroundColor: '#F3F4F6' }]}
            onPress={handleSave}
            disabled={fetchingLoc || processing || !company.trim()}
          >
            {processing ? <ActivityIndicator color="#62338B" /> : <Text style={[sv.startBtnText, (!company.trim()) && { color: '#9CA3AF' }]}>START</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};
const sv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 56, backgroundColor: '#FFF' },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  scroll: { padding: 20 },
  locChipBox: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#EDE9FE' },
  locWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  locLabel: { fontSize: 12, fontWeight: '700', color: '#6D28D9', marginLeft: 6 },
  locText: { fontSize: 12, color: '#4C1D95', textAlign: 'center', lineHeight: 18 },
  formWrap: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, ...SHADOWS.light },
  footer: { padding: 20, backgroundColor: '#F9FAFB' },
  startBtn: { backgroundColor: '#62338B', paddingVertical: 18, borderRadius: 50, alignItems: 'center' },
  startBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
});

// ─── Enter Details (Bottom Sheet for STEP IN) ────────────────────────────────
const StepInModal = ({ visible, visit, onClose, onSave, processing }) => {
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
      <View style={sm.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={sm.sheet}>
          <View style={sm.dragHandle} />
          <Text style={sm.title}>Enter details</Text>

          <ScrollView contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <FloatInput label="Enter Company / Customer you visit" value={company} onChangeText={setCompany} />
            <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" />
            <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} />
            <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline />

            <TouchableOpacity
              style={[sm.saveBtn, processing && { opacity: 0.7 }]}
              onPress={() => onSave({ company, contactNo, contactPerson, purpose })}
              disabled={processing}
            >
              {processing ? <ActivityIndicator color="#FFF" /> : <Text style={sm.saveBtnText}>STEP IN</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 20, maxHeight: '80%' },
  dragHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 20, marginLeft: 4 },
  saveBtn: { backgroundColor: '#62338B', paddingVertical: 18, borderRadius: 50, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const VisitsScreen = ({ navigation, route }) => {
  const user = route?.params?.user;
  
  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  if (!user || !user.user_id) return null;
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);
  const [processing, setProcessing] = useState(false);

  const [showStartScreen, setShowStartScreen] = useState(false);
  const [showStepInModal, setShowStepInModal] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const [pendingVisit, setPendingVisit] = useState(null);


  useEffect(() => {
    initDB().then(() => fetchVisits());
  }, []);

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
      Alert.alert('Error', 'Failed to save visit record. Please try again.');
    } finally { setProcessing(false); }
  };

  const onStepInClick = (v) => {
    setPendingVisit(v);
    setShowStepInModal(true);
  };

  const handleConfirmStepIn = async (details) => {
    setProcessing(true);
    try {
      const { lat, lng, address } = await getAddress();
      await updateVisitStatus(pendingVisit.id, 'step_in', {
        stepInTime: new Date().toISOString(), lat, lng, address
      });
      await syncIfOnline();
      setShowStepInModal(false);
      setPendingVisit(null);
      fetchVisits();
    } catch (e) {
      Alert.alert('Error', 'Failed to step in');
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
      const { lat, lng, address } = await getAddress();
      await updateVisitStatus(pendingVisit.id, 'COMPLETED', { 
        endTime: new Date().toISOString(),
        lat, lng, address
      });
      await syncIfOnline();
      fetchVisits();
    } catch (_) { Alert.alert('Error', 'Failed to step-out'); }
    finally { setProcessing(false); setPendingVisit(null); }
  };

  const syncIfOnline = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) await SyncService.syncAll();
    } catch (_) { }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color="#111827" size={26} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Customer Visits</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {visits.map((v) => (
          <VisitCard
            key={v.id}
            visit={v}
            onStepIn={onStepInClick}
            onStepOut={onStepOutClick}
          />
        ))}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      <View style={s.fabWrap}>
        <TouchableOpacity style={s.fab} onPress={() => setShowStartScreen(true)}>
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
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 56, backgroundColor: '#FFF' },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  scroll: { padding: 16, paddingTop: 20 },

  fabWrap: { position: 'absolute', bottom: 30, right: 20, zIndex: 99 },
  fab: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#62338B', justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
});

export default VisitsScreen;
