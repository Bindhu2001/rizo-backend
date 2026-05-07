import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Switch, TextInput, ActivityIndicator, Modal, Platform, KeyboardAvoidingView
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, Shield, LogOut, Mail, Phone, Briefcase,
  Edit2, Check, ChevronLeft, ChevronRight, X,
  MapPin, CreditCard, FileText, AlertCircle, Heart, Lock, Camera
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { COLORS, SIZES, SHADOWS , moderateScale } from '../components/Theme';
import { clearUserSession, updateUserProfileLocal, getLocalUser } from '../services/LocalDB';
import { API_ENDPOINTS, IMAGE_ROOT } from '../constants/Config';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SelectionModal = ({ visible, options, selectedValue, onClose, onSelect, title, labelKey = 'country_name', valueKey = 'id' }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={sm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={sm.sheet}>
        <View style={sm.handle} />
        {title && <Text style={sm.title}>{title}</Text>}
        <ScrollView style={{ maxHeight: 300 }}>
          {options.map((opt, i) => {
            const val = opt[valueKey];
            const lab = opt[labelKey];
            return (
              <TouchableOpacity key={i} style={sm.item} onPress={() => { onSelect(opt); onClose(); }}>
                <Text style={[sm.itemText, val === selectedValue && sm.itemTextActive]}>{lab}</Text>
                {val === selectedValue && <Check color={COLORS.primaryDeep} size={20} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </TouchableOpacity>
  </Modal>
);
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: 16 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: moderateScale(15), color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

const FloatInput = ({ label, value, onChangeText, keyboardType = 'default', maxLength, editable = true }) => (
  <View style={s.inputWrap}>
    <Text style={s.floatLabel}>{label}</Text>
    <TextInput
      style={[s.input, !editable && { backgroundColor: '#F3F4F6', color: '#9CA3AF' }]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      maxLength={maxLength}
      editable={editable}
      placeholderTextColor="#9CA3AF"
    />
  </View>
);

const PickerRow = ({ label, value, onPress }) => (
  <View style={s.inputWrap}>
    <Text style={s.floatLabel}>{label}</Text>
    <TouchableOpacity activeOpacity={0.7} style={s.pickerRow} onPress={onPress}>
      <Text style={[s.pickerText, !value && { color: '#9CA3AF' }]}>{value || `Select ${label}`}</Text>
      <Image source={require('../../assets/signup/arrow-down-01.png')} style={{ width: 16, height: 16, tintColor: '#9CA3AF' }} resizeMode="contain" />
    </TouchableOpacity>
  </View>
);

const CheckRow = ({ label, value, onToggle }) => (
  <TouchableOpacity style={s.checkRow} onPress={onToggle} activeOpacity={0.75}>
    <View style={[s.checkBox, value && s.checkBoxActive]}>
      {value && <Check color="#FFF" size={13} strokeWidth={3} />}
    </View>
    <Text style={s.checkLabel}>{label}</Text>
  </TouchableOpacity>
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

// ─── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ title, onBack }) => (
  <View style={s.header}>
    <TouchableOpacity onPress={onBack} style={s.backBtn}>
      <ChevronLeft color={COLORS.text} size={28} />
    </TouchableOpacity>
    <Text style={s.headerTitle}>{title}</Text>
    <View style={{ width: 44 }} />
  </View>
);

// ─── SaveButton ────────────────────────────────────────────────────────────────
const SaveButton = ({ onPress, loading, label = 'Update Details' }) => (
  <TouchableOpacity style={s.saveBtn} onPress={onPress} disabled={loading} activeOpacity={0.85}>
    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>{label}</Text>}
  </TouchableOpacity>
);

// ─── ProfileScreen ─────────────────────────────────────────────────────────────
const ProfileScreen = ({ navigation, route }) => {
  const [user, setUser] = useState(route?.params?.user);
  const [section, setSection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [pendingBack, setPendingBack] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);
  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  // Countries
  const [countries, setCountries] = useState([]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // ── Personal Details
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pIntl, setPIntl] = useState(false);
  const [pIntlCountry, setPIntlCountry] = useState(null);
  const [showIntlCountryPicker, setShowIntlCountryPicker] = useState(false);
  const [pHandicap, setPHandicap] = useState(false);
  const [pLocomotive, setPLocomotive] = useState(false);
  const [pHearing, setPHearing] = useState(false);
  const [pVisual, setPVisual] = useState(false);
  const [pPic, setPPic] = useState('');
  const [pPicBase64, setPPicBase64] = useState('');
  const [pPicLocal, setPPicLocal] = useState('');
  const [tempPic, setTempPic] = useState(null);

  // ── Address Details
  const [aLine1, setALine1] = useState('');
  const [aLine2, setALine2] = useState('');
  const [aCity, setACity] = useState('');
  const [aState, setAState] = useState('');
  const [aPinCode, setAPinCode] = useState('');
  const [aCountry, setACountry] = useState(null);

  // ── Bank Details
  const [bBankName, setBBankName] = useState('');
  const [bAccountNo, setBAccountNo] = useState('');
  const [bIfsc, setBIfsc] = useState('');
  const [bAccountType, setBAccountType] = useState('');
  const [bBranch, setBBranch] = useState('');
  const [showAccountTypePicker, setShowAccountTypePicker] = useState(false);
  const accountTypes = [
    { id: 'savings', country_name: 'Savings Account' },
    { id: 'current', country_name: 'Current Account' },
    { id: 'salary', country_name: 'Salary Account' },
  ];

  // ── ID Details
  const [idPan, setIdPan] = useState('');
  const [idAadhaar, setIdAadhaar] = useState('');

  // ── Emergency Contact
  const [emgName, setEmgName] = useState('');
  const [emgRelation, setEmgRelation] = useState('');
  const [emgPhone, setEmgPhone] = useState('');

  // ── Family Details
  const [fMarital, setFMarital] = useState('');
  const [fSpouse, setFSpouse] = useState('');
  const [fChildren, setFChildren] = useState('');
  const [showMaritalPicker, setShowMaritalPicker] = useState(false);
  const maritalOptions = [
    { id: 'single', country_name: 'Single' },
    { id: 'married', country_name: 'Married' },
    { id: 'divorced', country_name: 'Divorced' },
    { id: 'widowed', country_name: 'Widowed' },
  ];

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  useEffect(() => {
    if (!user?.user_id) return;
    refreshUser();
    fetchCountries();
  }, []);

  useEffect(() => {
    if (countries.length > 0 && user?.country_id && !aCountry) {
      const found = countries.find(c => c.id == user.country_id);
      if (found) setACountry(found);
    }
  }, [countries]);

  if (!user?.user_id) return null;

  const refreshUser = async () => {
    try {
      const dbUser = await getLocalUser(user.user_id);
      if (dbUser) {
        setUser(dbUser);
        setPName(dbUser.employee_name || '');
        setPEmail(dbUser.email || '');
        setPPhone(dbUser.phone || '');
        setPPic(dbUser.profile_pic || '');
        setPIntl(dbUser.international_worker === 'Y');
        setPHandicap(dbUser.physical_handicap === 'Y');
        setACity(dbUser.city || '');
        setAState(dbUser.state || '');
        if (dbUser.country_id) {
          setACountry({ id: dbUser.country_id, country_name: dbUser.country_name || 'Selected' });
        }
      }
    } catch (e) {
      console.log('refreshUser error', e);
    }
  };

  const fetchCountries = async () => {
    try {
      const res = await axios.get(`${API_ENDPOINTS.GET_COUNTRIES}?user_id=${user.user_id}`);
      if (res.data?.success && res.data.data) setCountries(res.data.data);
    } catch (e) {
      console.log('fetchCountries error', e);
    }
  };

  const goBack = () => {
    setShowDiscard(true);
  };

  const confirmDiscard = () => {
    setShowDiscard(false);
    setSection(null);
    refreshUser();
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('error', 'Permission Denied', 'Gallery access is required to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        showAlert('warning', 'File Too Large', 'The selected image exceeds the 5MB limit. Please choose a smaller image.');
        return;
      }
      setTempPic({
        uri: asset.uri,
        base64: asset.base64
      });
    }
  };

  const confirmPhoto = () => {
    if (tempPic) {
      setPPic(tempPic.uri);
      setPPicLocal(tempPic.uri);
      setPPicBase64(tempPic.base64);
      setTempPic(null);
    }
  };

  const cancelPhoto = () => {
    setTempPic(null);
  };

  // ── Save Personal ──────────────────────────────────────────────────────────
  const savePersonal = async () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!pName.trim()) { showAlert('warning', 'Name Required', 'Your name cannot be empty. Please enter your full name.'); return; }
    if (pEmail.trim() && !emailRegex.test(pEmail.trim())) { showAlert('warning', 'Invalid Email', 'Please enter a valid email address (e.g. employee@gmail.com).'); return; }
    setLoading(true);
    try {
      const nameParts = pName.trim().split(/\s+/);
      const payload = {
        user_id: user.user_id,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' '),
        email: pEmail,
        mobile_no: pPhone,
        international_worker: pIntl ? 'Y' : 'N',
        country: pIntl && pIntlCountry ? pIntlCountry.id : null,
        physical_handicap: pHandicap ? 'Y' : 'N',
        locomotive: pHandicap && pLocomotive ? 'Y' : 'N',
        hearing: pHandicap && pHearing ? 'Y' : 'N',
        visual: pHandicap && pVisual ? 'Y' : 'N',
        profile_pic: pPicBase64 ? `data:image/jpeg;base64,${pPicBase64}` : (pPic || ''),
      };
      const res = await axios.post(`${API_ENDPOINTS.UPDATE_PROFILE}?user_id=${user.user_id}`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.data?.success) {
        await updateUserProfileLocal(user.user_id, {
          employee_name: pName, email: pEmail, phone: pPhone,
          international_worker: pIntl ? 'Y' : 'N',
          physical_handicap: pHandicap ? 'Y' : 'N',
          profile_pic: pPicLocal || pPic,
        });
        setPPicLocal('');
        setPPicBase64('');
        setSection(null);
        refreshUser();
      } else {
        showAlert('error', 'Update Failed', res.data?.message || 'Could not update your profile. Please try again.');
      }
    } catch (e) {
      showAlert('error', 'Update Failed', 'Something went wrong. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Address (stub — API to be connected) ─────────────────────────────
  const saveAddress = async () => {
    if (!aLine1.trim()) { showAlert('warning', 'Address Required', 'Please enter Address Line 1 to continue.'); return; }
    setLoading(true);
    try {
      // TODO: connect to Address API
      await new Promise(r => setTimeout(r, 600));
      showAlert('success', 'Address Updated', 'Your address details have been saved successfully.');
      setSection(null);
    } catch (e) {
      showAlert('error', 'Update Failed', 'Could not update your address. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Bank (stub) ───────────────────────────────────────────────────────
  const saveBank = async () => {
    if (!bAccountNo.trim()) { showAlert('warning', 'Account Number Required', 'Please enter your bank account number to continue.'); return; }
    setLoading(true);
    try {
      // TODO: connect to Bank API
      await new Promise(r => setTimeout(r, 600));
      showAlert('success', 'Bank Details Updated', 'Your bank and payment details have been saved successfully.');
      setSection(null);
    } catch (e) {
      showAlert('error', 'Update Failed', 'Could not update bank details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Save ID (stub) ─────────────────────────────────────────────────────────
  const saveID = async () => {
    setLoading(true);
    try {
      // TODO: connect to ID API
      await new Promise(r => setTimeout(r, 600));
      showAlert('success', 'ID Details Updated', 'Your identity documents have been saved successfully.');
      setSection(null);
    } catch (e) {
      showAlert('error', 'Update Failed', 'Could not save ID details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Emergency (stub) ──────────────────────────────────────────────────
  const saveEmergency = async () => {
    if (!emgName.trim()) { showAlert('warning', 'Name Required', 'Please enter the emergency contact name.'); return; }
    setLoading(true);
    try {
      // TODO: connect to Emergency Contact API
      await new Promise(r => setTimeout(r, 600));
      showAlert('success', 'Contact Updated', 'Your emergency contact details have been saved successfully.');
      setSection(null);
    } catch (e) {
      showAlert('error', 'Update Failed', 'Could not save emergency contact. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Save Family (stub) ─────────────────────────────────────────────────────
  const saveFamily = async () => {
    setLoading(true);
    try {
      // TODO: connect to Family Details API
      await new Promise(r => setTimeout(r, 600));
      showAlert('success', 'Family Details Updated', 'Your family information has been saved successfully.');
      setSection(null);
    } catch (e) {
      showAlert('error', 'Update Failed', 'Could not save family details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    showAlert('warning', 'Sign Out', 'Are you sure you want to sign out from your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await clearUserSession(); navigation.replace('Login'); } },
    ]);
  };

  const getAvatarUri = () => {
    if (tempPic) return tempPic.uri;
    const pic = pPic || user.profile_pic;
    if (!pic) return `https://i.pravatar.cc/150?u=${user.user_id}`;
    if (pic.startsWith('http') || pic.startsWith('data:') || pic.startsWith('file:')) return pic;
    return `${IMAGE_ROOT}/${pic}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: PERSONAL DETAILS FORM
  // ═══════════════════════════════════════════════════════════════════════════
  if (section === 'personal') {
    return (
      <SafeAreaView style={s.container}>
        <SectionHeader title="Personal Details" onBack={goBack} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Avatar picker */}
          <View style={s.avatarCenter}>
            <View style={s.avatarWrap}>
              <Image source={{ uri: getAvatarUri() }} style={s.avatarLg} />
              {!tempPic && (
                <TouchableOpacity style={s.camBtn} onPress={handlePickImage} activeOpacity={0.8}>
                  <Camera color="#FFF" size={14} />
                </TouchableOpacity>
              )}
            </View>
            {tempPic ? (
              <View style={s.tempActions}>
                <TouchableOpacity style={[s.tempBtn, s.tempCancel]} onPress={cancelPhoto}>
                  <Text style={s.tempBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.tempBtn, s.tempSave]} onPress={confirmPhoto}>
                  <Text style={[s.tempBtnText, s.tempSaveText]}>Save Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={s.avatarHint}>Tap to change photo</Text>
            )}
          </View>

          <FloatInput label="Full Name" value={pName} onChangeText={t => setPName(t.replace(/[^A-Za-z0-9.\s]/g, ''))} maxLength={40} />
          <FloatInput label="Email Address" value={pEmail} onChangeText={t => setPEmail(t.replace(/[^a-zA-Z0-9@._-]/g, ''))} keyboardType="email-address" maxLength={50} />
          <FloatInput label="Mobile Number" value={pPhone} onChangeText={t => setPPhone(t.replace(/[^0-9]/g, ''))} keyboardType="phone-pad" maxLength={18} />
          <FloatInput label="Employee ID" value={String(user.user_id || '')} editable={false} />
          <FloatInput label="Designation" value={user.designation || ''} editable={false} />
          <FloatInput label="Department" value={user.department || ''} editable={false} />

          <View style={s.switchCard}>
            {/* International Worker */}
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchTitle}>International Worker</Text>
                <Text style={s.switchSub}>Are you an international worker?</Text>
              </View>
              <Switch value={pIntl}
                onValueChange={v => { setPIntl(v); if (!v) setPIntlCountry(null); }}
                trackColor={{ false: '#E5E7EB', true: '#EDE9FE' }}
                thumbColor={pIntl ? COLORS.primaryDeep : '#FFF'} />
            </View>
            {pIntl && (
              <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}>
                <PickerRow
                  label="Country"
                  value={pIntlCountry?.country_name}
                  onPress={() => setShowIntlCountryPicker(true)}
                />
              </View>
            )}

            <View style={s.divider} />

            {/* Physically Handicapped */}
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchTitle}>Physically Handicapped</Text>
                <Text style={s.switchSub}>Do you have a physical disability?</Text>
              </View>
              <Switch value={pHandicap}
                onValueChange={v => { setPHandicap(v); if (!v) { setPLocomotive(false); setPHearing(false); setPVisual(false); } }}
                trackColor={{ false: '#E5E7EB', true: '#EDE9FE' }}
                thumbColor={pHandicap ? COLORS.primaryDeep : '#FFF'} />
            </View>
            {pHandicap && (
              <View style={s.checkGroup}>
                <Text style={s.checkGroupLabel}>Types of Disability</Text>
                <View style={s.checkGroupRow}>
                  <CheckRow label="Locomotive" value={pLocomotive} onToggle={() => setPLocomotive(v => !v)} />
                  <CheckRow label="Hearing"    value={pHearing}    onToggle={() => setPHearing(v => !v)} />
                  <CheckRow label="Visual"     value={pVisual}     onToggle={() => setPVisual(v => !v)} />
                </View>
              </View>
            )}
          </View>

          <SaveButton onPress={savePersonal} loading={loading} />
          <View style={{ height: 32 }} />
        </ScrollView>
        </KeyboardAvoidingView>

        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <DiscardModal visible={showDiscard} onCancel={() => setShowDiscard(false)} onConfirm={confirmDiscard} />

        {/* Intl Worker Country Picker */}
        <SelectionModal
          visible={showIntlCountryPicker}
          title="Select Country"
          options={countries}
          selectedValue={pIntlCountry?.id}
          onClose={() => setShowIntlCountryPicker(false)}
          onSelect={c => { setPIntlCountry(c); setShowIntlCountryPicker(false); }}
        />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: ADDRESS DETAILS FORM
  // ═══════════════════════════════════════════════════════════════════════════
  if (section === 'address') {
    return (
      <SafeAreaView style={s.container}>
        <SectionHeader title="Address Details" onBack={goBack} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.formSubheading}>Add Your Address Details</Text>
          <Text style={s.formSubtitle}>This information will be used for official records.</Text>

          <FloatInput label="Address Line 1" value={aLine1} onChangeText={setALine1} maxLength={60} />
          <FloatInput label="Address Line 2 (Optional)" value={aLine2} onChangeText={setALine2} maxLength={60} />
          <FloatInput label="City" value={aCity} onChangeText={t => setACity(t.replace(/[^A-Za-z\s]/g, ''))} maxLength={30} />
          <FloatInput label="State" value={aState} onChangeText={t => setAState(t.replace(/[^A-Za-z\s]/g, ''))} maxLength={30} />
          <FloatInput label="Pin Code / Zip Code" value={aPinCode} onChangeText={t => setAPinCode(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" maxLength={10} />

          <PickerRow label="Country" value={aCountry?.country_name} onPress={() => setShowCountryPicker(true)} />

          <SaveButton onPress={saveAddress} loading={loading} />
          <View style={{ height: 32 }} />
        </ScrollView>
        </KeyboardAvoidingView>

        <SelectionModal visible={showCountryPicker} title="Select Country" options={countries}
          selectedValue={aCountry?.id} onClose={() => setShowCountryPicker(false)} onSelect={setACountry} />
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <DiscardModal visible={showDiscard} onCancel={() => setShowDiscard(false)} onConfirm={confirmDiscard} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: BANK & PAYMENT FORM
  // ═══════════════════════════════════════════════════════════════════════════
  if (section === 'bank') {
    return (
      <SafeAreaView style={s.container}>
        <SectionHeader title="Bank & Payment Details" onBack={goBack} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.formSubheading}>Bank & Payment Details</Text>
          <Text style={s.formSubtitle}>Your salary will be credited to this account.</Text>

          <FloatInput label="Bank Name" value={bBankName} onChangeText={setBBankName} maxLength={50} />
          <FloatInput label="Account Number" value={bAccountNo} onChangeText={t => setBAccountNo(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" maxLength={20} />
          <FloatInput label="IFSC Code" value={bIfsc} onChangeText={t => setBIfsc(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={11} />
          <PickerRow label="Account Type" value={accountTypes.find(a => a.id === bAccountType)?.country_name} onPress={() => setShowAccountTypePicker(true)} />
          <FloatInput label="Branch Name" value={bBranch} onChangeText={setBBranch} maxLength={50} />

          <SaveButton onPress={saveBank} loading={loading} />
          <View style={{ height: 32 }} />
        </ScrollView>
        </KeyboardAvoidingView>

        <SelectionModal visible={showAccountTypePicker} title="Select Account Type" options={accountTypes}
          selectedValue={bAccountType} onClose={() => setShowAccountTypePicker(false)}
          onSelect={opt => { setBAccountType(opt.id); setShowAccountTypePicker(false); }} />
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <DiscardModal visible={showDiscard} onCancel={() => setShowDiscard(false)} onConfirm={confirmDiscard} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: ID DOCUMENTS FORM
  // ═══════════════════════════════════════════════════════════════════════════
  if (section === 'id') {
    return (
      <SafeAreaView style={s.container}>
        <SectionHeader title="Details of your ID" onBack={goBack} />
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.formSubheading}>Details of your ID</Text>
          <Text style={s.formSubtitle}>Upload your government-issued identity documents.</Text>

          <FloatInput label="PAN Card Number" value={idPan} onChangeText={t => setIdPan(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={10} />
          <TouchableOpacity style={s.uploadBtn} activeOpacity={0.7}>
            <FileText color={COLORS.primaryDeep} size={20} />
            <Text style={s.uploadBtnText}>Upload PAN Card</Text>
          </TouchableOpacity>

          <FloatInput label="Aadhaar Number" value={idAadhaar} onChangeText={t => setIdAadhaar(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" maxLength={12} />
          <TouchableOpacity style={s.uploadBtn} activeOpacity={0.7}>
            <FileText color={COLORS.primaryDeep} size={20} />
            <Text style={s.uploadBtnText}>Upload Aadhaar Card</Text>
          </TouchableOpacity>

          <SaveButton onPress={saveID} loading={loading} />
          <View style={{ height: 32 }} />
        </ScrollView>

        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <DiscardModal visible={showDiscard} onCancel={() => setShowDiscard(false)} onConfirm={confirmDiscard} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: EMERGENCY CONTACT FORM
  // ═══════════════════════════════════════════════════════════════════════════
  if (section === 'emergency') {
    return (
      <SafeAreaView style={s.container}>
        <SectionHeader title="Emergency Contact" onBack={goBack} />
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.formSubheading}>Emergency Contact Details</Text>
          <Text style={s.formSubtitle}>This person will be contacted in case of emergency.</Text>

          <FloatInput label="Contact Name" value={emgName} onChangeText={t => setEmgName(t.replace(/[^A-Za-z\s]/g, ''))} maxLength={40} />
          <FloatInput label="Relationship" value={emgRelation} onChangeText={t => setEmgRelation(t.replace(/[^A-Za-z\s]/g, ''))} maxLength={30} />
          <FloatInput label="Phone Number" value={emgPhone} onChangeText={t => setEmgPhone(t.replace(/[^0-9]/g, ''))} keyboardType="phone-pad" maxLength={10} />

          <SaveButton onPress={saveEmergency} loading={loading} />
          <View style={{ height: 32 }} />
        </ScrollView>

        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <DiscardModal visible={showDiscard} onCancel={() => setShowDiscard(false)} onConfirm={confirmDiscard} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: FAMILY DETAILS FORM
  // ═══════════════════════════════════════════════════════════════════════════
  if (section === 'family') {
    return (
      <SafeAreaView style={s.container}>
        <SectionHeader title="Family Details" onBack={goBack} />
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.formSubheading}>Family Details</Text>
          <Text style={s.formSubtitle}>Provide your family information for HR records.</Text>

          <PickerRow label="Marital Status" value={maritalOptions.find(m => m.id === fMarital)?.country_name} onPress={() => setShowMaritalPicker(true)} />
          {fMarital === 'married' && (
            <FloatInput label="Spouse Name" value={fSpouse} onChangeText={t => setFSpouse(t.replace(/[^A-Za-z\s]/g, ''))} maxLength={40} />
          )}
          <FloatInput label="Number of Children" value={fChildren} onChangeText={t => setFChildren(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" maxLength={2} />

          <SaveButton onPress={saveFamily} loading={loading} />
          <View style={{ height: 32 }} />
        </ScrollView>

        <SelectionModal visible={showMaritalPicker} title="Marital Status" options={maritalOptions}
          selectedValue={fMarital} onClose={() => setShowMaritalPicker(false)}
          onSelect={opt => { setFMarital(opt.id); setShowMaritalPicker(false); }} />
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <DiscardModal visible={showDiscard} onCancel={() => setShowDiscard(false)} onConfirm={confirmDiscard} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER: MAIN PROFILE VIEW
  // ═══════════════════════════════════════════════════════════════════════════
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

        {/* ── Profile Header Card ── */}
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            <Image source={{ uri: getAvatarUri() }} style={s.avatarLg} />
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

        {/* ── Profile Sections ── */}
        <Text style={s.cardGroupTitle}>Profile Information</Text>
        <View style={s.menuCard}>
          <SectionItem
            iconBg="#EEF2FF" icon={<User color="#4F46E5" size={20} />}
            title="Personal Details"
            subtitle="Name, email & contact info"
            onPress={() => setSection('personal')}
          />
          <SectionItem
            iconBg="#ECFDF5" icon={<MapPin color="#059669" size={20} />}
            title="Address Details"
            subtitle="Your residential address"
            onPress={() => setSection('address')}
          />
          <SectionItem
            iconBg="#FFF7ED" icon={<CreditCard color="#EA580C" size={20} />}
            title="Bank & Payment Details"
            subtitle="Salary account information"
            onPress={() => setSection('bank')}
          />
          <SectionItem
            iconBg="#FAF5FF" icon={<FileText color="#7C3AED" size={20} />}
            title="Details of your ID"
            subtitle="PAN, Aadhaar & documents"
            onPress={() => setSection('id')}
          />
          <SectionItem
            iconBg="#FFF1F2" icon={<AlertCircle color="#E11D48" size={20} />}
            title="Emergency Contact"
            subtitle="Contact in case of emergency"
            onPress={() => setSection('emergency')}
          />
          <SectionItem
            iconBg="#FDF2F8" icon={<Heart color="#DB2777" size={20} />}
            title="Family Details"
            subtitle="Spouse & children info"
            onPress={() => setSection('family')}
            last
          />
        </View>

        {/* ── Account Settings ── */}
        <Text style={s.cardGroupTitle}>Account Settings</Text>
        <View style={s.menuCard}>
          <SectionItem
            iconBg="#F0FDF4" icon={<Lock color="#16A34A" size={20} />}
            title="Privacy & Security"
            subtitle="Password & biometric lock"
            onPress={() => { }}
            last
          />
        </View>

        {/* ── Logout ── */}
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

// ─── Discard Modal ─────────────────────────────────────────────────────────────
const DiscardModal = ({ visible, onCancel, onConfirm }) => (
  <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
    <View style={s.modalOverlay}>
      <View style={s.modalCard}>
        <View style={s.modalIconOuter}>
          <View style={s.modalIconInner}>
            <X color="#DC2626" size={28} strokeWidth={2.5} />
          </View>
        </View>
        <Text style={s.modalTitle}>Discard changes?</Text>
        <Text style={s.modalSub}>Your unsaved changes will be lost if you go back.</Text>
        <View style={s.modalRow}>
          <TouchableOpacity style={s.modalBtnNo} onPress={onCancel}>
            <Text style={s.modalBtnNoText}>No, Stay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.modalBtnYes} onPress={onConfirm}>
            <Text style={s.modalBtnYesText}>Yes, Discard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Styles ────────────────────────────────────────────────────────────────────
const PURPLE = '#4A148C';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800', color: COLORS.text },

  // Scroll
  scroll: { padding: 20, paddingTop: 12 },
  formScroll: { padding: 20, paddingTop: 8 },

  // Profile Card
  profileCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center',
    marginBottom: 24, ...SHADOWS.medium,
  },
  avatarWrap: { position: 'relative', marginBottom: 16 },
  avatarLg: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#FFF', ...SHADOWS.medium },
  camBtn: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: PURPLE, width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  avatarCenter: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  avatarHint: { fontSize: moderateScale(12), color: COLORS.textMuted, marginTop: 8, fontWeight: '500' },
  profileName: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  profileRole: { fontSize: moderateScale(14), color: COLORS.textLight, fontWeight: '600', marginBottom: 12 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFDF5', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, marginBottom: 16,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 6 },
  activeText: { fontSize: moderateScale(11), fontWeight: '800', color: '#059669', letterSpacing: 0.5 },
  idRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  idLabel: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '500' },
  idVal: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.text },

  // Card group
  cardGroupTitle: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.textLight, letterSpacing: 0.4, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase' },

  // Menu Card
  menuCard: { backgroundColor: '#FFF', borderRadius: 20, marginBottom: 24, ...SHADOWS.light, overflow: 'hidden' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  sectionIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  sectionText: { flex: 1 },
  sectionTitle: { fontSize: moderateScale(15), fontWeight: '700', color: COLORS.text },
  sectionSub: { fontSize: moderateScale(12), color: COLORS.textLight, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', paddingVertical: 18, borderRadius: 20,
    borderWidth: 1, borderColor: '#FEE2E2', ...SHADOWS.light,
  },
  logoutText: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.danger, marginLeft: 10 },

  // Form fields
  inputWrap: { marginBottom: 18, position: 'relative' },
  floatLabel: {
    position: 'absolute', top: -8, left: 14, zIndex: 2,
    backgroundColor: '#F8F9FA', paddingHorizontal: 4,
    fontSize: moderateScale(11), color: '#9CA3AF', fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 16, height: 54,
    fontSize: moderateScale(14), fontWeight: '600', color: COLORS.text,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 12, paddingHorizontal: 16, height: 54,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  pickerText: { flex: 1, fontSize: moderateScale(14), fontWeight: '600', color: COLORS.text },

  // Switch card
  switchCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 4, marginBottom: 20, ...SHADOWS.light },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  switchTitle: { fontSize: moderateScale(14), fontWeight: '700', color: COLORS.text },
  switchSub: { fontSize: moderateScale(12), color: COLORS.textLight, marginTop: 2 },

  // Disability checkboxes
  checkGroup: { paddingHorizontal: 12, paddingBottom: 12 },
  checkGroupLabel: { fontSize: moderateScale(11), fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  checkGroupRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  checkBoxActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  checkLabel: { fontSize: moderateScale(14), fontWeight: '600', color: '#374151' },

  // Form subheading
  formSubheading: { fontSize: moderateScale(20), fontWeight: '900', color: COLORS.text, marginBottom: 6, marginTop: 4 },
  formSubtitle: { fontSize: moderateScale(13), color: COLORS.textLight, marginBottom: 24, lineHeight: 20 },

  // Upload button
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: PURPLE, borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 16, marginBottom: 20, backgroundColor: '#FAF5FF',
  },
  uploadBtnText: { fontSize: moderateScale(14), fontWeight: '700', color: PURPLE, marginLeft: 8 },

  // Save button
  saveBtn: {
    backgroundColor: PURPLE, borderRadius: 30, height: 56,
    justifyContent: 'center', alignItems: 'center', marginTop: 8, ...SHADOWS.medium,
  },
  saveBtnText: { color: '#FFF', fontSize: moderateScale(16), fontWeight: '800', letterSpacing: 0.3 },

  // Discard Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 28, alignItems: 'center', ...SHADOWS.medium },
  modalIconOuter: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalIconInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#DC2626', justifyContent: 'center', alignItems: 'center', ...SHADOWS.light },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  modalSub: { fontSize: moderateScale(13), color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  modalRow: { flexDirection: 'row', width: '100%' },
  modalBtnNo: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  modalBtnNoText: { color: '#4B5563', fontWeight: '700', fontSize: moderateScale(14) },
  modalBtnYes: { flex: 1, height: 48, borderRadius: 24, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  modalBtnYesText: { color: '#FFF', fontWeight: '700', fontSize: moderateScale(14) },
});

export default ProfileScreen;

