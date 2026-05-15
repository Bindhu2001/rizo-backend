import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, BackHandler,
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, LogOut, ChevronLeft, ChevronRight,
  MapPin, CreditCard, FileText, ClipboardList,
} from 'lucide-react-native';
import axios from 'axios';
import { COLORS, SHADOWS, moderateScale } from '../components/Theme';
import { clearUserSession, getLocalUser } from '../services/LocalDB';
import { syncEmployeeDetails } from '../services/EmployeeSync';
import { API_ENDPOINTS, IMAGE_ROOT } from '../constants/Config';

const PLACEHOLDER_AVATAR = require('../../assets/signup/placeholdermen.jpeg');

const PURPLE = '#4A148C';

// ─── Small read-only field row ────────────────────────────────────────────────
const yesNo = (v) => (String(v).toUpperCase() === 'Y' || v === true ? 'Yes' : 'No');
const dash = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '—');

const Field = ({ label, value }) => (
  <View style={s.fieldRow}>
    <Text style={s.fieldLabel}>{label}</Text>
    <Text style={s.fieldValue}>{value}</Text>
  </View>
);

const SectionItem = ({ iconBg, icon, title, subtitle, onPress, last }) => (
  <>
    <TouchableOpacity style={s.sectionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.sectionIconBox, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={s.sectionText}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionSub}>{subtitle}</Text>
      </View>
      <ChevronRight color="#9CA3AF" size={20} />
    </TouchableOpacity>
    {!last && <View style={s.divider} />}
  </>
);

const SectionHeader = ({ title, onBack }) => (
  <View style={s.header}>
    <TouchableOpacity onPress={onBack} style={s.backBtn}>
      <ChevronLeft color={COLORS.text} size={28} />
    </TouchableOpacity>
    <Text style={s.headerTitle}>{title}</Text>
    <View style={{ width: 44 }} />
  </View>
);

// ─── ProfileScreen ────────────────────────────────────────────────────────────
const ProfileScreen = ({ navigation, route }) => {
  const [user, setUser] = useState(route?.params?.user);
  const [section, setSection] = useState(null);
  const [alertCfg, setAlertCfg] = useState(null);
  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  // Fetched section data
  const [personal, setPersonal] = useState(null);
  const [address, setAddress] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [bank, setBank] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
      return;
    }
    (async () => {
      try {
        const dbUser = await getLocalUser(user.user_id);
        if (dbUser) setUser(dbUser);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;
    const refresh = () => {
      syncEmployeeDetails(user, navigation).then((updated) => { if (updated) setUser(updated); });
    };
    refresh();
    const unsub = navigation.addListener?.('focus', refresh);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [navigation, user?.user_id]);

  // Android hardware back: if a section is open, return to the menu;
  // otherwise close the Profile screen.
  useEffect(() => {
    const onBack = () => {
      if (section) { setSection(null); return true; }
      navigation.goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [section, navigation]);

  if (!user?.user_id) return null;

  const fetchSection = async (endpoint, setter, current) => {
    if (current) return;
    setBusy(true);
    try {
      const res = await axios.post(endpoint, { user_id: user.user_id });
      const ok = res.data?.success === 1 || res.data?.success === true || res.data?.success === '1';
      if (ok) {
        setter(res.data.data || {});
      } else {
        // No data on server yet — show empty fields rather than an error.
        setter({});
      }
    } catch (e) {
      console.log('Profile section fetch error', e?.response?.status, e?.message);
      setter({});
      showAlert('error', 'Could Not Load', 'Failed to load these details. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const openSection = (key) => {
    setSection(key);
    if (key === 'personal') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_PERSONAL, setPersonal, personal);
    if (key === 'address') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_ADDRESS, setAddress, address);
    if (key === 'kyc') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_DOCUMENTS, setDocuments, documents);
    if (key === 'other') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_BANK, setBank, bank);
  };

  const handleLogout = () => {
    showAlert('warning', 'Sign Out', 'Are you sure you want to sign out from your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await clearUserSession(); navigation.replace('Login'); } },
    ]);
  };

  const getAvatarSource = (customPic) => {
    const pic = customPic || user.profile_pic;
    if (!pic) return PLACEHOLDER_AVATAR;
    if (pic.startsWith('http') || pic.startsWith('data:') || pic.startsWith('file:')) return { uri: pic };
    return { uri: `${IMAGE_ROOT}/${pic}` };
  };

  // ── Section view wrapper ────────────────────────────────────────────────────
  const renderSectionView = (title, children) => (
    <SafeAreaView style={s.container}>
      <SectionHeader title={title} onBack={() => setSection(null)} />
      {busy ? (
        <View style={s.loaderWrap}><ActivityIndicator size="large" color={PURPLE} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false}>
          <View style={s.fieldCard}>{children}</View>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );

  // ── PERSONAL DETAILS ────────────────────────────────────────────────────────
  if (section === 'personal') {
    const d = personal || {};
    return renderSectionView('Personal Details', (
      <>
        <View style={{ alignItems: 'center', marginBottom: 20, marginTop: 10 }}>
          <View style={s.avatarWrap}>
            <Image source={getAvatarSource(d.profile_pic)} style={s.avatarLg} />
          </View>
        </View>
        <Field label="First Name" value={dash(d.name)} />
        <Field label="Email Address" value={dash(d.email)} />
        <Field label="Mobile Number" value={dash(d.mobile_number)} />
        <Field label="Date of Birth" value={dash(d.date_of_birth)} />
        <Field label="Gender" value={dash(d.gender)} />
        <Field label="Marital Status" value={dash(d.maritual_status)} />
        <Field label="Blood Group" value={dash(d.blood)} />
        <Field label="Employee ID" value={dash(d.employee_id || user.user_id)} />
        <Field label="Designation" value={dash(d.designation || user.designation)} />
        <Field label="Department" value={dash(d.department || user.department)} />
      </>
    ));
  }

  // ── ADDRESS DETAILS ─────────────────────────────────────────────────────────
  if (section === 'address') {
    const d = address || {};
    return renderSectionView('Address Details', (
      <>
        <Field label="House / Flat Name" value={dash(d.address)} />
        <Field label="Address Line 2" value={dash(d.address_line2 || d.line2)} />
        <Field label="City" value={dash(d.city)} />
        <Field label="District" value={dash(d.district)} />
        <Field label="State" value={dash(d.state)} />
        <Field label="Pin Code" value={dash(d.pin)} />
        <Field label="Country" value={dash(d.country)} />
      </>
    ));
  }

  // ── KYC DETAILS ─────────────────────────────────────────────────────────────
  if (section === 'kyc') {
    const d = documents || {};
    return renderSectionView('KYC Details', (
      <>
        <Field label="Aadhaar Number" value={dash(d.aadhar)} />
        <Field label="PAN Number" value={dash(d.pan)} />
      </>
    ));
  }


  // ── OTHER DETAILS ───────────────────────────────────────────────────────────
  if (section === 'other') {
    const d = bank || {};
    return renderSectionView('Other Details', (
      <>
        <Field label="Guardian Name" value={dash(d.guradian || d.guardian)} />
        <Field label="Relation" value={dash(d.relation_guardian)} />
        <Field label="Bank Name" value={dash(d.bank_name)} />
        <Field label="Branch" value={dash(d.bank_branch)} />
        <Field label="IFSC Code" value={dash(d.ifsc_code)} />
        <Field label="Account Number" value={dash(d.account_number)} />
        <Field label="ESI Number" value={dash(d.esi)} />
        <Field label="ESI Dispensary" value={dash(d.esi_dispensary)} />
        <Field label="PF Number" value={dash(d.pf)} />
        <Field label="UAN Number" value={dash(d.uan)} />
        <Field label="EPS Eligibility" value={yesNo(d.eps)} />
        <Field label="International Worker" value={yesNo(d.international_worker)} />
        <Field label="Physically Handicapped" value={yesNo(d.physically_handicapped)} />
        <Field label="Locomotive" value={yesNo(d.locomotive)} />
        <Field label="Hearing" value={yesNo(d.hearing)} />
        <Field label="Visual" value={yesNo(d.visual)} />
      </>
    ));
  }

  // ── MAIN PROFILE VIEW ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            <Image source={getAvatarSource()} style={s.avatarLg} />
          </View>
          <Text style={s.profileName}>{user.employee_name}</Text>
          <Text style={s.profileRole}>{user.designation}</Text>
          <View style={s.activeBadge}>
            <View style={s.activeDot} />
            <Text style={s.activeText}>ACTIVE</Text>
          </View>
          <View style={s.idRow}>
            <Text style={s.idLabel}>Employee ID  </Text>
            <Text style={s.idVal}>{user.user_id}</Text>
          </View>
          {user.joining_date ? (
            <View style={s.idRow}>
              <Text style={s.idLabel}>Joined  </Text>
              <Text style={s.idVal}>{user.joining_date}</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.cardGroupTitle}>Profile Information</Text>
        <View style={s.menuCard}>
          <SectionItem
            iconBg="#EEF2FF" icon={<User color="#4F46E5" size={20} />}
            title="Personal Details" subtitle="Name, contact & basic info"
            onPress={() => openSection('personal')}
          />
          <SectionItem
            iconBg="#ECFDF5" icon={<MapPin color="#059669" size={20} />}
            title="Address Details" subtitle="Your residential address"
            onPress={() => openSection('address')}
          />
          <SectionItem
            iconBg="#FAF5FF" icon={<FileText color="#7C3AED" size={20} />}
            title="KYC Details" subtitle="Aadhaar & PAN"
            onPress={() => openSection('kyc')}
          />
          <SectionItem
            iconBg="#F0FDF4" icon={<ClipboardList color="#16A34A" size={20} />}
            title="Other Details" subtitle="Statutory & worker info"
            onPress={() => openSection('other')}
            last
          />
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut color={COLORS.danger} size={20} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16), height: moderateScale(60) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800', color: COLORS.text },

  scroll: { padding: moderateScale(20), paddingTop: moderateScale(12), paddingBottom: moderateScale(110) },
  formScroll: { padding: moderateScale(20), paddingTop: moderateScale(12), paddingBottom: moderateScale(110) },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  profileCard: {
    backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(24), alignItems: 'center',
    marginBottom: moderateScale(24), ...SHADOWS.medium,
  },
  avatarWrap: { position: 'relative', marginBottom: moderateScale(16) },
  avatarLg: { width: moderateScale(100), height: moderateScale(100), borderRadius: moderateScale(50), borderWidth: 3, borderColor: '#FFF', ...SHADOWS.medium },
  profileName: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  profileRole: { fontSize: moderateScale(14), color: COLORS.textLight, fontWeight: '600', marginBottom: moderateScale(12) },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFDF5', paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(6), borderRadius: moderateScale(20), marginBottom: moderateScale(16),
  },
  activeDot: { width: moderateScale(8), height: moderateScale(8), borderRadius: 4, backgroundColor: '#10B981', marginRight: moderateScale(6) },
  activeText: { fontSize: moderateScale(11), fontWeight: '800', color: '#059669', letterSpacing: 0.5 },
  idRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  idLabel: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '500' },
  idVal: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.text },

  cardGroupTitle: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.textLight, letterSpacing: 0.4, marginBottom: moderateScale(10), marginLeft: 4, textTransform: 'uppercase' },

  menuCard: { backgroundColor: '#FFF', borderRadius: moderateScale(20), marginBottom: moderateScale(24), ...SHADOWS.light, overflow: 'hidden' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', padding: moderateScale(16) },
  sectionIconBox: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(14) },
  sectionText: { flex: 1 },
  sectionTitle: { fontSize: moderateScale(15), fontWeight: '700', color: COLORS.text },
  sectionSub: { fontSize: moderateScale(12), color: COLORS.textLight, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: moderateScale(16) },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', paddingVertical: moderateScale(18), borderRadius: moderateScale(20),
    borderWidth: 1, borderColor: '#FEE2E2', ...SHADOWS.light,
  },
  logoutText: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.danger, marginLeft: moderateScale(10) },

  // Read-only field card
  fieldCard: { backgroundColor: '#FFF', borderRadius: moderateScale(20), paddingHorizontal: moderateScale(18), paddingVertical: moderateScale(6), ...SHADOWS.light },
  fieldRow: { paddingVertical: moderateScale(14), borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  fieldLabel: { fontSize: moderateScale(12), color: '#9CA3AF', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  fieldValue: { fontSize: moderateScale(15), color: COLORS.text, fontWeight: '600' },
});

export default ProfileScreen;
