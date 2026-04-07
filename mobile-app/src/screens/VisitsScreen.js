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

const getAddress = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { address: 'Location permission denied', lat: 0, lng: 0 };
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const geo = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    const g = geo?.[0] || {};
    const parts = [g.name, g.street, g.city, g.region, g.country].filter(Boolean);
    return { address: parts.join(', ') || 'Unknown Location', lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch (_) { return { address: 'Unable to fetch location', lat: 0, lng: 0 }; }
};

// ─── Timeline Step Row ────────────────────────────────────────────────────────
const TimelineStep = ({ time, location, label, labelColor, labelBg, done, isLast }) => (
  <View style={tl.row}>
    {/* Left: dot + connector */}
    <View style={tl.left}>
      <View style={[tl.dot, done && tl.dotDone]}>
        {done && <CheckCircle color="#FFF" size={10} strokeWidth={3} />}
      </View>
      {!isLast && <View style={tl.line} />}
    </View>
    {/* Right: content */}
    <View style={tl.content}>
      <View style={tl.topRow}>
        <Text style={tl.time}>{time}</Text>
        <View style={[tl.badge, { backgroundColor: labelBg }]}>
          <Text style={[tl.badgeText, { color: labelColor }]}>{label}</Text>
        </View>
      </View>
      <View style={tl.locRow}>
        <MapPin color="#9CA3AF" size={11} />
        <Text style={tl.loc} numberOfLines={1}>{location}</Text>
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
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  locRow: { flexDirection: 'row', alignItems: 'center' },
  loc: { fontSize: 11, color: '#9CA3AF', marginLeft: 4, flex: 1 },
});

// ─── Visit Card ───────────────────────────────────────────────────────────────
const VisitCard = ({ visit, onAction }) => {
  const hasStart = !!visit.start_time;
  const hasStepIn = visit.status === 'REACHED' || visit.status === 'step_in' || visit.status === 'COMPLETED';
  const hasStepOut = visit.status === 'COMPLETED';

  const location = visit.location || 'XCGP+GP Mekkadambu, Kerala, India.';
  const contactNo = visit.contact_number || '+91 9847118137';
  const contactPerson = visit.contact_person || visit.client_name;
  const date = visit.created_at ? new Date(visit.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Dec 23, 2025';

  // LIVE badge shown when scheduled / active
  const isLive = visit.status === 'SCHEDULED';

  // Determine which button to show
  let actionLabel = null;
  let actionStyle = null;
  if (visit.status === 'SCHEDULED') {
    actionLabel = 'START';
    actionStyle = { bg: '#EDE9FE', text: '#7C3AED' };
  } else if (visit.status === 'REACHED') {
    actionLabel = 'STEP IN';
    actionStyle = { bg: '#DCFCE7', text: '#16A34A' };
  } else if (visit.status === 'step_in') {
    actionLabel = 'STEP OUT';
    actionStyle = { bg: '#FCE4EC', text: '#C2185B' };
  }

  return (
    <View style={cs.card}>
      {/* Top: name + date + contact + LIVE */}
      <View style={cs.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={cs.clientName}>{visit.client_name}</Text>
          <Text style={cs.date}>{date}</Text>
          <View style={cs.contactRow}>
            <Phone color="#9CA3AF" size={11} />
            <Text style={cs.contactText}>{contactPerson} : {contactNo}</Text>
          </View>
        </View>
        {isLive && (
          <View style={cs.liveBadge}>
            <View style={cs.liveDot} />
            <Text style={cs.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Timeline */}
      <View style={cs.timeline}>
        {/* Step 1 – START */}
        {hasStart && (
          <TimelineStep
            time={fmtTime(visit.start_time)}
            location={location}
            label="START"
            labelBg="#EDE9FE"
            labelColor="#7C3AED"
            done={hasStart}
            isLast={!hasStepIn}
          />
        )}
        {/* Step 2 – STEP IN */}
        {hasStepIn && (
          <TimelineStep
            time={fmtTime(visit.step_in_time || visit.start_time)}
            location={location}
            label="STEP IN"
            labelBg="#DCFCE7"
            labelColor="#16A34A"
            done={hasStepIn}
            isLast={!hasStepOut}
          />
        )}
        {/* Step 3 – STEP OUT */}
        {hasStepOut && (
          <TimelineStep
            time={fmtTime(visit.end_time)}
            location={location}
            label="STEP OUT"
            labelBg="#FCE4EC"
            labelColor="#C2185B"
            done={hasStepOut}
            isLast={true}
          />
        )}
      </View>

      {/* Action button if applicable */}
      {actionLabel && (
        <TouchableOpacity
          style={[cs.actionBtn, { backgroundColor: actionStyle.bg }]}
          onPress={() => onAction(visit)}
          activeOpacity={0.8}
        >
          <Text style={[cs.actionBtnText, { color: actionStyle.text }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const cs = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.medium,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  clientName: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
  date: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  contactRow: { flexDirection: 'row', alignItems: 'center' },
  contactText: { fontSize: 11, color: '#9CA3AF', marginLeft: 4 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF5F5', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#FCA5A5'
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444', marginRight: 4 },
  liveText: { fontSize: 10, fontWeight: '800', color: '#EF4444' },
  timeline: { marginLeft: 0, marginBottom: 4 },
  actionBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 8, marginTop: 4,
  },
  actionBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});

// Prohibited / ban-circle icon drawn with pure Views
const BanIcon = () => (
  <View style={cm.banOuter}>
    <View style={cm.banDiag} />
  </View>
);

const ConfirmModal = ({ visible, onConfirm, onCancel }) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={cm.overlay}>
      <View style={cm.box}>
        <View style={cm.iconWrap}>
          <BanIcon />
        </View>
        <Text style={cm.title}>Are you sure you want to{"\n"}Confirm Step Out?</Text>
        <Text style={cm.desc}>You'll marked as stepped out from{"\n"}the customer you visited.</Text>
        <View style={cm.row}>
          <TouchableOpacity style={cm.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Text style={cm.cancelText}>No, Go back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cm.confirmBtn} onPress={onConfirm} activeOpacity={0.8}>
            <Text style={cm.confirmText}>Yes, Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  box: { backgroundColor: '#FFF', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center', marginBottom: 20
  },
  // Ban/prohibit circle
  banOuter: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3.5, borderColor: '#62338B',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  banDiag: {
    position: 'absolute',
    width: 3.5, height: 52,
    backgroundColor: '#62338B',
    transform: [{ rotate: '45deg' }]
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  desc: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 50,
    backgroundColor: '#F3F4F6', alignItems: 'center'
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 50,
    backgroundColor: '#62338B', alignItems: 'center'
  },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});


// ─── Add Visit Modal (matches 'Going to Meet' Figma screen) ───────────────────────────
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
      placeholderTextColor="#D1D5DB"
    />
  </View>
);

const fi = StyleSheet.create({
  wrap: { marginBottom: 14, position: 'relative', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  label: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 2 },
  input: { fontSize: 15, color: '#111827', fontWeight: '500', paddingVertical: 4 },
  multiline: { height: 72, textAlignVertical: 'top' },
});

const AddVisitModal = ({ visible, onClose, onSave, processing }) => {
  const [company, setCompany] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [purpose, setPurpose] = useState('');
  // Auto-fetched location state
  const [locText, setLocText] = useState('');
  const [locCoords, setLocCoords] = useState({ lat: 0, lng: 0 });
  const [fetchingLoc, setFetchingLoc] = useState(false);

  // Auto-fetch location every time the modal opens
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const fetch = async () => {
      setFetchingLoc(true);
      setLocText('');
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
    setLocText(''); setLocCoords({ lat: 0, lng: 0 });
  };

  const handleSave = () => {
    if (!company.trim()) { Alert.alert('Error', 'Please enter a company/customer name'); return; }
    if (fetchingLoc) { Alert.alert('Please wait', 'Fetching your current location...'); return; }
    onSave({ company, contactNo, contactPerson, purpose, locText, ...locCoords });
    reset();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={am.overlay}>
        <View style={am.sheet}>
          {/* Header */}
          <View style={am.headerRow}>
            <TouchableOpacity onPress={handleClose} style={am.backBtn} activeOpacity={0.7}>
              <ChevronLeft color="#111827" size={24} />
            </TouchableOpacity>
            <Text style={am.title}>Going to Meet</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Location chip at top — auto-detected */}
          <View style={am.locChip}>
            <MapPin color="#62338B" size={13} />
            {fetchingLoc ? (
              <>
                <Text style={am.locChipText}>Detecting location…</Text>
                <ActivityIndicator size="small" color="#62338B" style={{ marginLeft: 6 }} />
              </>
            ) : (
              <Text style={am.locChipText} numberOfLines={1}>{locText || 'Your Current Location'}</Text>
            )}
          </View>

          {/* Floating-label inputs */}
          <FloatInput label="Enter Company / Customer you visit" value={company} onChangeText={setCompany} />
          <FloatInput label="Contact Number" value={contactNo} onChangeText={setContactNo} keyboardType="phone-pad" />
          <FloatInput label="Contact Person" value={contactPerson} onChangeText={setContactPerson} />
          <FloatInput label="Purpose" value={purpose} onChangeText={setPurpose} multiline />

          {/* STEP IN button */}
          <TouchableOpacity
            style={[am.saveBtn, (processing || fetchingLoc) && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={processing || fetchingLoc}
            activeOpacity={0.85}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={am.saveBtnText}>STEP IN</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const am = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#FFF' },
  sheet: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingHorizontal: 20, paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingVertical: 10 },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  // Location chip at top
  locChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3E8FF', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 20, alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  locChipText: { fontSize: 12, fontWeight: '600', color: '#62338B', marginLeft: 5, flexShrink: 1 },
  saveBtn: {
    backgroundColor: '#62338B', paddingVertical: 17,
    borderRadius: 50, alignItems: 'center', marginTop: 'auto', marginBottom: 16
  },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const VisitsScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100056' };
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Step-out confirm
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingVisit, setPendingVisit] = useState(null);

  // FAB pulse animation
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    initDB().then(() => fetchVisits());
  }, []);

  const fetchVisits = async () => {
    try {
      const data = await getTodayVisits(user.user_id);
      setVisits(data || []);
    } catch (e) {
      console.log('Fetch visits error', e);
    } finally {
      setLoading(false);
    }
  };


  // Handle card action press
  const handleAction = (visit) => {
    if (visit.status === 'SCHEDULED') {
      // START → go to form to fill details, then start
      setPendingVisit(visit);
      setShowAddModal(true);
    } else if (visit.status === 'REACHED') {
      // STEP IN
      doStepIn(visit.id);
    } else if (visit.status === 'step_in') {
      // Show confirm before STEP OUT
      setPendingVisit(visit);
      setConfirmVisible(true);
    }
  };

  const doStepIn = async (visitId) => {
    setProcessing(true);
    try {
      const { lat, lng, address } = await getAddress();
      await updateVisitStatus(visitId, 'step_in', {
        stepInTime: new Date().toISOString(), lat, lng
      });
      await syncIfOnline();
      fetchVisits();
    } catch (e) { 
      console.error(e);
      Alert.alert('Error', 'Failed to step-in\n\n' + e.message); 
    } finally { setProcessing(false); }
  };

  const doStepOut = async () => {
    if (!pendingVisit) return;
    setConfirmVisible(false);
    setProcessing(true);
    try {
      await updateVisitStatus(pendingVisit.id, 'COMPLETED', { endTime: new Date().toISOString() });
      await syncIfOnline();
      fetchVisits();
    } catch (_) { Alert.alert('Error', 'Failed to step-out'); }
    finally { setProcessing(false); setPendingVisit(null); }
  };

  const handleSaveNewVisit = async ({ company, contactNo, contactPerson, purpose, locText, lat, lng }) => {
    setProcessing(true);
    try {
      const id = await saveVisitLocal({
        userId: user.user_id,
        clientName: company,
        contactNumber: contactNo,
        contactPerson,
        purpose,
        location: locText || '',
        lat: lat || 0,
        lng: lng || 0,
      });
      // Immediately mark as REACHED (started)
      await updateVisitStatus(id, 'REACHED', {
        startTime: new Date().toISOString(), lat: lat || 0, lng: lng || 0,
      });
      await syncIfOnline();
      setShowAddModal(false);
      setPendingVisit(null);
      await fetchVisits();
    } catch (e) { 
      console.error(e);
      Alert.alert('Error', 'Failed to save visit\n\n' + e.message); 
    } finally { setProcessing(false); }
  };

  const syncIfOnline = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) await SyncService.syncAll();
    } catch (_) {}
  };

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color="#62338B" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <ChevronLeft color="#111827" size={26} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Customer Visits</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ── List ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {visits.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIconBox}>
              <MapPin color="#62338B" size={36} />
            </View>
            <Text style={s.emptyTitle}>No Visits Today</Text>
            <Text style={s.emptySubtitle}>Tap the + button to add a customer visit</Text>
          </View>
        ) : (
          visits.map((v) => (
            <VisitCard key={v.id} visit={v} onAction={handleAction} />
          ))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <Animated.View style={[s.fabWrap, { transform: [{ scale: pulse }] }]}>
        <TouchableOpacity
          style={s.fab}
          onPress={() => { setPendingVisit(null); setShowAddModal(true); }}
          activeOpacity={0.85}
        >
          <Plus color="#FFF" size={28} strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Add Visit Modal ── */}
      <AddVisitModal
        visible={showAddModal}
        onClose={() => { setShowAddModal(false); setPendingVisit(null); }}
        onSave={handleSaveNewVisit}
        processing={processing}
      />

      {/* ── Step-Out Confirm Modal ── */}
      <ConfirmModal
        visible={confirmVisible}
        onConfirm={doStepOut}
        onCancel={() => { setConfirmVisible(false); setPendingVisit(null); }}
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, height: 56, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  // List
  scroll: { padding: 16, paddingTop: 20 },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F3E8FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  // FAB
  fabWrap: { position: 'absolute', bottom: 32, right: 28 },
  fab: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#62338B',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#62338B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 12, elevation: 10,
  },
});

export default VisitsScreen;
