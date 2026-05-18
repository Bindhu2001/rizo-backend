import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
  FlatList, Modal, StatusBar, Image, ActivityIndicator, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2, ChevronRight, Camera, Check, ChevronDown } from 'lucide-react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { SHADOWS, moderateScale, wp } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { API_ENDPOINTS } from '../constants/Config';

const MAX_DOB = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d; })();

const { width } = Dimensions.get('window');
const PURPLE = '#4A148C';
const PURPLE_BG = '#F5F0FF';

// ─── Floating Label Input ──────────────────────────────────────────────────────
const FloatInput = ({ label, value, onChangeText, keyboardType = 'default', secureTextEntry = false, maxLength, placeholder = '', validation }) => {
  const theme = useTheme();
  return (
  <View style={st.inputWrap}>
    <Text style={[st.floatLabel, { backgroundColor: theme.card, color: theme.textMuted }]}>{label}</Text>
    <TextInput
      style={[st.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.inputBorder }, validation?.status === 'exists' && { borderColor: '#DC2626' }, validation?.status === 'valid' && { borderColor: '#16A34A' }]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      maxLength={maxLength}
    />
    {validation?.status && validation.status !== 'idle' && (
      <View style={st.vRow}>
        {validation.status === 'checking'
          ? <ActivityIndicator size="small" color={theme.textMuted} style={{ marginRight: 5 }} />
          : <Text style={validation.status === 'valid' ? st.vDotGreen : st.vDotRed}>●</Text>}
        <Text style={[st.vText, { color: theme.textLight }, validation.status === 'valid' && { color: '#16A34A' }, (validation.status === 'exists' || validation.status === 'error') && { color: '#DC2626' }, validation.status === 'checking' && { color: theme.textMuted }]}>
          {validation.status === 'checking' ? 'Checking...' : validation.message}
        </Text>
      </View>
    )}
  </View>
  );
};

// ─── Picker Row (dropdown trigger) ────────────────────────────────────────────
const PickerRow = ({ label, value, onPress }) => {
  const theme = useTheme();
  return (
  <View style={st.inputWrap}>
    <Text style={[st.floatLabel, { backgroundColor: theme.card, color: theme.textMuted }]}>{label}</Text>
    <TouchableOpacity style={[st.pickerRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[st.pickerText, { color: theme.text }, !value && { color: theme.textMuted }]}>{value || `Select ${label}`}</Text>
      <ChevronDown color={theme.textMuted} size={18} />
    </TouchableOpacity>
  </View>
  );
};

// ─── Checkbox Row ──────────────────────────────────────────────────────────────
const CheckRow = ({ label, value, onToggle }) => {
  const theme = useTheme();
  return (
  <TouchableOpacity style={st.checkRow} onPress={onToggle} activeOpacity={0.75}>
    <View style={[st.checkBox, { backgroundColor: theme.card, borderColor: theme.border }, value && st.checkBoxActive]}>
      {value && <Check color="#FFF" size={13} strokeWidth={3} />}
    </View>
    <Text style={[st.checkLabel, { color: theme.text }]}>{label}</Text>
  </TouchableOpacity>
  );
};

// ─── Step Progress Bar ─────────────────────────────────────────────────────────
const StepBar = ({ current, total }) => {
  const theme = useTheme();
  return (
  <View style={st.stepBarRow}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={[st.stepBarItem, { backgroundColor: theme.border }, i < current && st.stepBarActive, { marginRight: i < total - 1 ? 6 : 0 }]}
      />
    ))}
  </View>
  );
};

// ─── Simple Option Picker Modal ────────────────────────────────────────────────
const SimplePickerModal = ({ visible, title, options, selected, onClose, onSelect }) => {
  const theme = useTheme();
  return (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={[st.modalOverlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
      <View style={[st.modalSheet, { backgroundColor: theme.card }]}>
        <View style={[st.modalHandle, { backgroundColor: theme.border }]} />
        <Text style={[st.modalTitle, { color: theme.textMuted }]}>{title}</Text>
        <ScrollView style={{ maxHeight: 320 }}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[st.countryItem, { borderBottomColor: theme.divider }]}
              onPress={() => { onSelect(opt); onClose(); }}
            >
              <Text style={[st.countryItemText, { color: theme.textLight }, selected === opt && st.countryItemActive]}>{opt}</Text>
              {selected === opt && <Check color={PURPLE} size={18} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={[st.modalCloseBtn, { borderColor: theme.border }]} onPress={onClose}>
          <Text style={[st.modalCloseText, { color: theme.text }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
  );
};

// ─── Country Picker Modal ──────────────────────────────────────────────────────
const CountryPickerModal = ({ visible, countries, selected, onClose, onSelect }) => {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? countries.filter(c => c.country_name.toLowerCase().includes(query.toLowerCase()))
    : countries;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={[st.modalOverlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={onClose}>
        <View style={[st.modalSheet, { backgroundColor: theme.card, maxHeight: '80%' }]}>
          <View style={[st.modalHandle, { backgroundColor: theme.border }]} />
          <Text style={[st.modalTitle, { color: theme.textMuted }]}>Select Country</Text>
          <TextInput
            style={[st.countrySearch, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.inputBorder }]}
            placeholder="Search country..."
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={c => c.id}
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: c }) => (
              <TouchableOpacity
                style={[st.countryItem, { borderBottomColor: theme.divider }]}
                onPress={() => { setQuery(''); onSelect(c); onClose(); }}
              >
                <Text style={[st.countryItemText, { color: theme.textLight }, selected?.id === c.id && st.countryItemActive]}>
                  {c.country_name}
                </Text>
                {selected?.id === c.id && <Check color={PURPLE} size={18} />}
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={[st.modalCloseBtn, { borderColor: theme.border }]} onPress={() => { setQuery(''); onClose(); }}>
            <Text style={[st.modalCloseText, { color: theme.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── Welcome Slides ────────────────────────────────────────────────────────────
const SLIDES = [
  { id: '1', title: 'Transform your career', subtitle: 'Transform your career with a portable HR profile that travels with you! Streamline your info sharing securely', img: require('../../assets/signup/group.png') },
  { id: '2', title: 'Seamless Connections', subtitle: 'Enjoy seamless connections with instant profile sharing! Streamline your work life and elevate your experience!', img: require('../../assets/signup/group-1.png') },
  { id: '3', title: 'Document Management', subtitle: 'Streamline document management! Easily store and share important papers in one app.', img: require('../../assets/signup/illustration-3.png') },
];

// ─── SignupScreen ──────────────────────────────────────────────────────────────
const SignupScreen = ({ navigation }) => {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) =>
    setAlertCfg({ type, title, message, buttons });

  // Step 1
  const [email, setEmail] = useState('');
  const [companyCode, setCompanyCode] = useState('');

  // Step 3 – Personal
  const [name, setName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [dob, setDob] = useState('');
  const [dobDate, setDobDate] = useState(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [gender, setGender] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showMaritalPicker, setShowMaritalPicker] = useState(false);
  const [showBloodPicker, setShowBloodPicker] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState('');
  const [showPicModal, setShowPicModal] = useState(false);

  // Step 4 – Address
  const [address, setAddress] = useState({ house: '', line2: '', city: '', pincode: '', state: '', district: '' });
  const [addrCountry, setAddrCountry] = useState(null);
  const [showAddrCountryPicker, setShowAddrCountryPicker] = useState(false);

  // Step 5 – KYC
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');

  // Inline field validation
  const IDLE = { status: 'idle', message: '' };
  const [aadharV, setAadharV] = useState(IDLE);
  const [panV, setPanV] = useState(IDLE);
  const [uanV, setUanV] = useState(IDLE);
  const [pfV, setPfV] = useState(IDLE);
  const [esiV, setEsiV] = useState(IDLE);
  const [lwfV, setLwfV] = useState(IDLE);
  const vTimers = useRef({});

  const validateField = (key, endpoint, value, setV, minLen = 3) => {
    clearTimeout(vTimers.current[key]);
    if (!value || value.length < minLen) { setV(IDLE); return; }
    setV({ status: 'checking', message: '' });
    vTimers.current[key] = setTimeout(async () => {
      try {
        const res = await axios.post(endpoint, { company_code: companyCode, value }, { timeout: 8000 });
        if (res.data?.success === 1) {
          setV({ status: res.data.exists ? 'exists' : 'valid', message: res.data.message || '' });
        } else {
          setV(IDLE);
        }
      } catch (_) { setV(IDLE); }
    }, 800);
  };

  // Step 6 – Other Details
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [esiNo, setEsiNo] = useState('');
  const [esiDispensary, setEsiDispensary] = useState('');
  const [pfNo, setPfNo] = useState('');
  const [uanNo, setUanNo] = useState('');
  const [prevMemberId, setPrevMemberId] = useState('');
  const [wpsId, setWpsId] = useState('');
  const [lwfRegNo, setLwfRegNo] = useState('');
  const [epsEligibility, setEpsEligibility] = useState(false);
  const [intlWorker, setIntlWorker] = useState(false);
  const [originCountry, setOriginCountry] = useState(null);
  const [showOriginCountryPicker, setShowOriginCountryPicker] = useState(false);
  const [physHandicap, setPhysHandicap] = useState(false);
  const [locomotive, setLocomotive] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [visual, setVisual] = useState(false);

  // Countries list
  const [countries, setCountries] = useState([]);

  const fetchCountries = async (userId) => {
    try {
      const res = await axios.get(API_ENDPOINTS.GET_COUNTRIES, { params: { user_id: userId } });
      if (res.data?.success === 1 && Array.isArray(res.data.data)) setCountries(res.data.data);
    } catch (_) { }
  };

  // ── Step 1: Verify email + company code ──────────────────────────────────
  const handleStep1Submit = async () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!companyCode.trim() || !email.trim()) {
      showAlert('error', 'Missing Details', 'Please enter your Company Code and Email to continue.');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      showAlert('warning', 'Invalid Email', 'Please enter a valid email address (e.g. employee@gmail.com).');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.CHECK_EMAIL_EXISTS, {
        company_code: companyCode.trim(),
        email: email.trim(),
      });
      if (res.data) {
        const isSuccess = res.data.success === true || res.data.success === 1 || res.data.success === 'true';
        if (res.data.exists || res.data.data?.exists) {
          showAlert('warning', 'Account Exists', 'An account already exists with this email. Please try a different email or login.', [
            { text: 'Try Another', style: 'cancel' },
            { text: 'Login', style: 'destructive', onPress: () => navigation.navigate('Login') },
          ]);
        } else if (isSuccess) {
          fetchCountries(companyCode.trim());
          showAlert('success', 'Valid Email', 'Your email has been verified successfully.', [
            { text: 'OK', onPress: () => setStep(3) },
          ]);
        } else {
          showAlert('error', 'Verification Failed', res.data.message || 'Please check your company code and email.');
        }
      } else {
        showAlert('error', 'Server Error', 'No response from server. Please try again.');
      }
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to verify. Please check your connection.';
      showAlert('error', 'Connection Error', msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 6: Final submit ──────────────────────────────────────────────────
  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      // Format DOB as YYYY-MM-DD for the API
      const dobFormatted = dobDate
        ? `${dobDate.getFullYear()}-${String(dobDate.getMonth() + 1).padStart(2, '0')}-${String(dobDate.getDate()).padStart(2, '0')}`
        : dob;

      const payload = {
        company_code: companyCode,
        name: name,
        mobile_no: mobileNo,
        email: email,
        date_of_birth: dobFormatted,
        gender: gender,
        maritual_status: maritalStatus,
        blood: bloodGroup,
        country_id: addrCountry?.id || null,
        aadhar: aadhaarNumber,
        pan_no: panNumber,
        address: [address.house, address.line2, address.city].filter(Boolean).join(', '),
        pincode: address.pincode,
        district: address.district,
        state: address.state,
        guardian: guardianName,
        relation_guardian: guardianRelation,
        bank: bankName,
        bank_branch: branch,
        ifsc_code: ifscCode,
        account_no: accountNumber,
        esi: esiNo,
        esi_dispensary: esiDispensary,
        pf: pfNo,
        uan: uanNo,
        previous_member_id: prevMemberId,
        wps_code: wpsId,
        lwf_code: lwfRegNo,
        eps: epsEligibility ? 'Y' : 'N',
        international_worker: intlWorker ? 'Y' : 'N',
        // Country of origin only sent when international_worker = Y.
        country_origin: intlWorker && originCountry?.id ? originCountry.id : null,
        physical_handicap: physHandicap ? 'Y' : 'N',
        locomotive: physHandicap && locomotive ? 'Y' : 'N',
        hearing: physHandicap && hearing ? 'Y' : 'N',
        visual: physHandicap && visual ? 'Y' : 'N',
      };
      if (photoBase64) payload.profile_pic = `data:image/jpeg;base64,${photoBase64}`;

      const res = await axios.post(API_ENDPOINTS.REGISTER, payload, { headers: { 'Content-Type': 'application/json' } });
      if (res.data?.success === 1 || res.data?.success === true) {
        setStep(7);
      } else {
        showAlert('error', 'Submission Failed', res.data?.message || 'Could not complete signup. Please try again.');
      }
    } catch (e) {
      console.log('Signup error', e.message);
      showAlert('error', 'Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      handleStep1Submit();
    } else if (step === 3) {
      if (!name.trim()) { showAlert('warning', 'Name Required', 'Please enter your first name to continue.'); return; }
      if (!mobileNo.trim() || mobileNo.length < 8) { showAlert('warning', 'Invalid Mobile', 'Please enter a valid mobile number.'); return; }
      if (!dob.trim()) { showAlert('warning', 'DOB Required', 'Please enter your date of birth.'); return; }
      if (!gender) { showAlert('warning', 'Gender Required', 'Please select your gender.'); return; }
      setStep(4);
    } else if (step === 4) {
      if (!address.house.trim()) { showAlert('warning', 'Address Required', 'Please enter your house or flat address to continue.'); return; }
      setStep(5);
    } else if (step === 5) {
      if (!aadhaarNumber.trim() || !/^\d{12}$/.test(aadhaarNumber)) {
        showAlert('warning', 'Aadhaar Required', 'Aadhaar must be exactly 12 digits.');
        return;
      }
      if (aadharV.status === 'exists') {
        showAlert('error', 'Aadhaar Already Registered', aadharV.message || 'This Aadhaar number is already registered. Please check and try again.');
        return;
      }
      if (aadharV.status === 'checking') {
        showAlert('info', 'Please Wait', 'Validating Aadhaar number, please wait a moment.');
        return;
      }
      // PAN is optional; validate format only if entered.
      if (panNumber.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
        showAlert('warning', 'Invalid PAN', 'PAN must be in the format ABCDE1234F (5 letters, 4 digits, 1 letter).');
        return;
      }
      if (panV.status === 'exists') {
        showAlert('error', 'PAN Already Registered', panV.message || 'This PAN number is already registered.');
        return;
      }
      setStep(6);
    } else if (step === 6) {
      // All step-6 fields are optional, but if filled they must match format.
      if (ifscCode.trim() && !/^[A-Z0-9]{4,12}$/.test(ifscCode)) {
        showAlert('warning', 'Invalid IFSC', 'IFSC must be 4-12 alphanumeric characters.');
        return;
      }
      if (accountNumber.trim() && !/^\d+$/.test(accountNumber)) {
        showAlert('warning', 'Invalid Account Number', 'Account Number must contain only digits.');
        return;
      }
      if (esiNo.trim() && !/^\d{10}$/.test(esiNo)) {
        showAlert('warning', 'Invalid ESI', 'ESI must be exactly 10 digits.');
        return;
      }
      if (pfNo.trim() && !/^[A-Za-z0-9]+$/.test(pfNo)) {
        showAlert('warning', 'Invalid PF', 'PF Number must be alphanumeric.');
        return;
      }
      if (uanNo.trim() && !/^\d{12}$/.test(uanNo)) {
        showAlert('warning', 'Invalid UAN', 'UAN must be exactly 12 digits.');
        return;
      }
      if (lwfRegNo.trim() && !/^[A-Za-z0-9]{5,15}$/.test(lwfRegNo)) {
        showAlert('warning', 'Invalid LWF', 'LWF must be 5-15 alphanumeric characters.');
        return;
      }
      handleFinalSubmit();
    }
  };

  const prevStep = () => {
    if (step === 3) setStep(1);
    else if (step === 4) setStep(3);
    else if (step === 5) setStep(4);
    else if (step === 6) setStep(5);
    else if (step === 1) setStep(0);
    else navigation.goBack();
  };

  const pickImage = async (useCamera = false) => {
    const { status } = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('error', 'Permission Denied', 'Camera or gallery access is required.'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        showAlert('warning', 'File Too Large', 'The selected image exceeds the 5MB limit. Please choose a smaller image.');
        return;
      }
      setPhotoUri(asset.uri);
      setPhotoBase64(asset.base64);
      setShowPicModal(false);
    }
  };

  const getStepNum = () => {
    if (step === 3) return 1;
    if (step === 4) return 2;
    if (step === 5) return 3;
    if (step === 6) return 4;
    return 0;
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ── STEP 0: WELCOME CAROUSEL
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 0) {
    return (
      <View style={[st.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
        <FlatList
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setCarouselIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width }}>
              <View style={[st.carouselTop, { backgroundColor: theme.bg }]}>
                <Image source={item.img} style={st.carouselImg} resizeMode="contain" />
              </View>
              <View style={[st.carouselCard, { backgroundColor: theme.card }]}>
                <View style={st.dotRow}>
                  {SLIDES.map((_, i) => (
                    <View key={i} style={[st.dot, { backgroundColor: theme.border }, carouselIndex === i && st.dotActive]} />
                  ))}
                </View>
                <Text style={[st.slideTitle, { color: theme.text }]}>{item.title}</Text>
                <Text style={[st.slideSub, { color: theme.textLight }]}>{item.subtitle}</Text>
                <TouchableOpacity style={st.getStartedBtn} onPress={() => setStep(1)}>
                  <Text style={st.getStartedText}>Get Started</Text>
                  <ChevronRight color="#FFF" size={20} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          keyExtractor={i => i.id}
        />
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── STEP 1: EMAIL + COMPANY CODE
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <View style={[st.container, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
          <View style={[st.step1Top, { backgroundColor: theme.bg }]}>
            <TouchableOpacity onPress={prevStep} style={st.backBtnLight}>
              <ChevronLeft color={theme.isDark ? theme.text : PURPLE} size={28} />
            </TouchableOpacity>
            <Image source={require('../../assets/signup/group.png')} style={st.step1Img} resizeMode="contain" />
          </View>
          <View style={[st.bottomCard, { backgroundColor: theme.card }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <Text style={[st.cardTitle, { color: theme.text }]}>Hello,</Text>
              <Text style={[st.cardSub, { color: theme.textLight }]}>Enter your details to continue</Text>
              <View style={{ marginTop: 28 }}>
                <FloatInput label="Company Code" value={companyCode} onChangeText={t => setCompanyCode(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="GLET" maxLength={50} />
              </View>
              <FloatInput label="Email ID" value={email} onChangeText={t => setEmail(t.replace(/[^a-zA-Z0-9@._-]/g, '').toLowerCase())} keyboardType="email-address" autoCapitalize="none" placeholder="employee@gmail.com" maxLength={100} />
              <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={st.nextBtnText}>Continue</Text>
                    <ChevronRight color="#FFF" size={20} />
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={st.loginLink} onPress={() => navigation.navigate('Login')}>
                <Text style={[st.loginLinkText, { color: theme.textLight }]}>Already have an account? <Text style={[st.loginLinkBold, { color: theme.primary }]}>Login</Text></Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── STEP 7: SUCCESS
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 7) {
    return (
      <SafeAreaView style={[st.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }]}>
        <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
        <View style={st.successCircle}>
          <Check color="#FFF" size={44} strokeWidth={3} />
        </View>
        <Text style={[st.successTitle, { color: theme.text }]}>Profile Complete!</Text>
        <Text style={[st.successSub, { color: theme.textLight }]}>Your account has been created successfully. You can now login.</Text>
        <TouchableOpacity style={[st.nextBtn, { width: width - 80, marginTop: 40 }]} onPress={() => navigation.navigate('Login')}>
          <Text style={st.nextBtnText}>Go to Login</Text>
          <ChevronRight color="#FFF" size={20} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── STEPS 3 / 4 / 5 / 6  —  purple top + white card bottom
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={[st.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />

      {/* ── PURPLE TOP SECTION ── */}
      <View style={[st.dataTop, { backgroundColor: theme.bg }]}>
        <View style={st.dataTopBar}>
          <TouchableOpacity onPress={prevStep} style={st.dataBackBtn}>
            <ChevronLeft color={theme.isDark ? theme.text : PURPLE} size={28} />
          </TouchableOpacity>
          <StepBar current={getStepNum()} total={4} />
          <Text style={[st.stepCount, { color: theme.isDark ? theme.text : PURPLE }]}>{getStepNum()} / 4</Text>
        </View>

        <View style={st.dataTopCenter}>
          {step === 3 && (
            <>
              <TouchableOpacity onPress={() => setShowPicModal(true)} style={st.avatarPickerWrap} activeOpacity={0.85}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={st.avatarImg} />
                ) : (
                  <View style={st.avatarPlaceholder}>
                    <Image source={require('../../assets/signup/placeholdermen.jpeg')} style={{ width: 110, height: 110, borderRadius: 55 }} resizeMode="cover" />
                  </View>
                )}
                <View style={st.camBadge}>
                  <Camera color="#FFF" size={14} />
                </View>
              </TouchableOpacity>
              <Text style={[st.avatarHint, { color: theme.isDark ? theme.textLight : '#6D28D9' }]}>{photoUri ? 'Tap to change photo' : 'Tap to add profile photo'}</Text>
            </>
          )}
          {step === 4 && <Image source={require('../../assets/signup/group-1.png')} style={st.topIllustration} resizeMode="contain" />}
          {step === 5 && <Image source={require('../../assets/signup/illustration-3.png')} style={st.topIllustration} resizeMode="contain" />}
          {step === 6 && <Image source={require('../../assets/signup/group-1.png')} style={st.topIllustration} resizeMode="contain" />}
        </View>
      </View>

      {/* ── WHITE CARD BOTTOM ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
        <View style={[st.bottomCard, { backgroundColor: theme.card }]}>
          <ScrollView contentContainerStyle={st.cardScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ══ STEP 3 — PERSONAL DETAILS ══ */}
            {step === 3 && (
              <>
                <Text style={[st.cardTitle, { color: theme.text }]}>Personal Details</Text>
                <Text style={[st.cardSub, { color: theme.textLight }]}>Let's start with your basic information</Text>
                <FloatInput label="Name *" value={name} onChangeText={t => setName(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="Employee Name" maxLength={50} />
                <FloatInput label="Mobile Number *" value={mobileNo} onChangeText={t => setMobileNo(t.replace(/[^0-9]/g, ''))} keyboardType="phone-pad" placeholder="Mobile Number" maxLength={18} />
                <PickerRow label="Date of Birth *" value={dob || ''} onPress={() => setShowDobPicker(true)} />
                <PickerRow label="Gender *" value={gender} onPress={() => setShowGenderPicker(true)} />
                <PickerRow label="Marital Status" value={maritalStatus} onPress={() => setShowMaritalPicker(true)} />
                <PickerRow label="Blood Group" value={bloodGroup} onPress={() => setShowBloodPicker(true)} />
                <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Continue</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
              </>
            )}

            {/* ══ STEP 4 — ADDRESS DETAILS ══ */}
            {step === 4 && (
              <>
                <Text style={[st.cardTitle, { color: theme.text }]}>Address Details</Text>
                <Text style={[st.cardSub, { color: theme.textLight }]}>This information will be used for official records</Text>
                <FloatInput label="House / Flat Name" value={address.house} onChangeText={t => setAddress({ ...address, house: t })} placeholder="Flat 12A, Sunshine Apt" maxLength={60} />
                <FloatInput label="Address Line 2 (Optional)" value={address.line2} onChangeText={t => setAddress({ ...address, line2: t })} placeholder="Near City Mall" maxLength={60} />
                <View style={st.inputRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <FloatInput label="City" value={address.city} onChangeText={t => setAddress({ ...address, city: t.replace(/[^A-Za-z\s]/g, '') })} placeholder="Mumbai" maxLength={30} />
                  </View>
                  <View style={{ width: 120 }}>
                    <FloatInput label="Pin Code" value={address.pincode} onChangeText={t => setAddress({ ...address, pincode: t.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="400001" maxLength={6} />
                  </View>
                </View>
                <FloatInput label="District" value={address.district} onChangeText={t => setAddress({ ...address, district: t.replace(/[^A-Za-z\s]/g, '') })} placeholder="District" maxLength={30} />
                <FloatInput label="State" value={address.state} onChangeText={t => setAddress({ ...address, state: t.replace(/[^A-Za-z\s]/g, '') })} placeholder="Maharashtra" maxLength={30} />
                <PickerRow label="Country" value={addrCountry?.country_name} onPress={() => setShowAddrCountryPicker(true)} />
                <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Continue</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
              </>
            )}

            {/* ══ STEP 5 — KYC (Aadhaar Number only) ══ */}
            {step === 5 && (
              <>
                <Text style={[st.cardTitle, { color: theme.text }]}>KYC Details</Text>
                <Text style={[st.cardSub, { color: theme.textLight }]}>Enter your Aadhaar card number</Text>
                <FloatInput
                  label="Aadhaar Number *"
                  value={aadhaarNumber}
                  onChangeText={t => {
                    const v = t.replace(/[^0-9]/g, '');
                    setAadhaarNumber(v);
                    if (v.length === 0) {
                      setAadharV(IDLE);
                    } else if (v.length < 12) {
                      setAadharV({ status: 'error', message: 'Aadhaar must be exactly 12 digits!' });
                    } else {
                      validateField('aadhar', API_ENDPOINTS.CHECK_AADHAR, v, setAadharV, 12);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="XXXX XXXX XXXX"
                  maxLength={12}
                  validation={aadharV}
                />
                <FloatInput
                  label="PAN Number"
                  value={panNumber}
                  onChangeText={t => {
                    const v = t.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    setPanNumber(v);
                    if (v.length === 0) {
                      setPanV(IDLE);
                    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v)) {
                      setPanV({ status: 'error', message: 'Invalid PAN format! (e.g. ABCDE1234F)' });
                    } else {
                      validateField('pan', API_ENDPOINTS.CHECK_PAN, v, setPanV, 10);
                    }
                  }}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  validation={panV}
                />
                <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Continue</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
                <Text style={[st.skipNote, { color: theme.textMuted }]}>You can update your documents later from your profile.</Text>
              </>
            )}

            {/* ══ STEP 6 — OTHER DETAILS ══ */}
            {step === 6 && (
              <>
                <Text style={[st.cardTitle, { color: theme.text }]}>Other Details</Text>
                <Text style={[st.cardSub, { color: theme.textLight }]}>Enter your details to complete signup to Rizo</Text>

                {/* Guardian */}
                <View style={[st.toggleCard, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
                  <Text style={[st.toggleLabel, { color: theme.text, marginBottom: 14 }]}>Guardian Details</Text>
                  <FloatInput label="Guardian Name" value={guardianName} onChangeText={t => setGuardianName(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="Guardian Name" maxLength={40} />
                  <FloatInput label="Relation" value={guardianRelation} onChangeText={setGuardianRelation} placeholder="Father / Mother / Spouse" maxLength={30} />
                </View>

                {/* Bank */}
                <View style={[st.toggleCard, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
                  <Text style={[st.toggleLabel, { color: theme.text, marginBottom: 14 }]}>Bank Details</Text>
                  <FloatInput label="Bank Name" value={bankName} onChangeText={t => setBankName(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="Bank Name" maxLength={50} />
                  <FloatInput label="Branch" value={branch} onChangeText={t => setBranch(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="Branch" maxLength={50} />
                  <FloatInput label="IFSC Code" value={ifscCode} onChangeText={t => setIfscCode(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="SBIN0001234" maxLength={12} />
                  <FloatInput label="Account Number" value={accountNumber} onChangeText={t => setAccountNumber(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Account Number" maxLength={18} />
                </View>

                {/* HR / Compliance */}
                <View style={[st.toggleCard, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
                  <Text style={[st.toggleLabel, { color: theme.text, marginBottom: 14 }]}>HR &amp; Compliance</Text>
                  <View style={st.inputRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <FloatInput label="ESI No" value={esiNo} onChangeText={t => {
                        const v = t.replace(/[^0-9]/g, '');
                        setEsiNo(v);
                        if (v.length === 0) setEsiV(IDLE);
                        else if (v.length < 10) setEsiV({ status: 'error', message: 'ESI must be exactly 10 digits!' });
                        else validateField('esi', API_ENDPOINTS.CHECK_ESI, v, setEsiV);
                      }} keyboardType="number-pad" placeholder="ESI No" maxLength={10} validation={esiV} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FloatInput label="PF No" value={pfNo} onChangeText={t => { const v = t.replace(/[^A-Za-z0-9]/g, ''); setPfNo(v); validateField('pf', API_ENDPOINTS.CHECK_PF, v, setPfV); }} placeholder="PF No" maxLength={22} validation={pfV} />
                    </View>
                  </View>
                  <FloatInput label="ESI Dispensary" value={esiDispensary} onChangeText={t => setEsiDispensary(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="ESI Dispensary" maxLength={50} />
                  <View style={st.inputRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <FloatInput label="UAN No" value={uanNo} onChangeText={t => {
                        const v = t.replace(/[^0-9]/g, '');
                        setUanNo(v);
                        if (v.length === 0) setUanV(IDLE);
                        else if (v.length < 12) setUanV({ status: 'error', message: 'UAN must be exactly 12 digits!' });
                        else validateField('uan', API_ENDPOINTS.CHECK_UAN, v, setUanV);
                      }} keyboardType="number-pad" placeholder="UAN No" maxLength={12} validation={uanV} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FloatInput label="Previous Member ID" value={prevMemberId} onChangeText={t => setPrevMemberId(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Prev Member ID" maxLength={15} />
                    </View>
                  </View>
                  <View style={st.inputRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <FloatInput label="WPS ID" value={wpsId} onChangeText={t => setWpsId(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="WPS ID" maxLength={15} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FloatInput label="LWF Registration No" value={lwfRegNo} onChangeText={t => {
                        const v = t.replace(/[^A-Za-z0-9]/g, '');
                        setLwfRegNo(v);
                        if (v.length === 0) setLwfV(IDLE);
                        else if (v.length < 5) setLwfV({ status: 'error', message: 'LWF must be 5-15 alphanumeric characters!' });
                        else validateField('lwf', API_ENDPOINTS.CHECK_LWF, v, setLwfV);
                      }} placeholder="LWF Reg No" maxLength={15} validation={lwfV} />
                    </View>
                  </View>
                  <CheckRow label="EPS Eligibility" value={epsEligibility} onToggle={() => setEpsEligibility(v => !v)} />
                </View>

                {/* International Worker */}
                <View style={[st.toggleCard, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
                  <View style={st.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.toggleLabel, { color: theme.text }]}>International Worker</Text>
                    </View>
                    <Switch
                      value={intlWorker}
                      onValueChange={v => { setIntlWorker(v); if (!v) setOriginCountry(null); }}
                      trackColor={{ false: '#E5E7EB', true: '#EDE9FE' }}
                      thumbColor={intlWorker ? PURPLE : '#FFF'}
                    />
                  </View>
                  {intlWorker && (
                    <View style={{ marginTop: 12 }}>
                      <PickerRow label="Country of Origin" value={originCountry?.country_name} onPress={() => setShowOriginCountryPicker(true)} />
                    </View>
                  )}
                </View>

                {/* Physically Handicapped */}
                <View style={[st.toggleCard, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
                  <View style={st.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.toggleLabel, { color: theme.text }]}>Physically Handicapped</Text>
                    </View>
                    <Switch
                      value={physHandicap}
                      onValueChange={v => { setPhysHandicap(v); if (!v) { setLocomotive(false); setHearing(false); setVisual(false); } }}
                      trackColor={{ false: '#E5E7EB', true: '#EDE9FE' }}
                      thumbColor={physHandicap ? PURPLE : '#FFF'}
                    />
                  </View>
                  {physHandicap && (
                    <View style={st.checkGroup}>
                      <Text style={[st.checkGroupLabel, { color: theme.textLight }]}>Types of Disability</Text>
                      <View style={st.checkGroupRow}>
                        <CheckRow label="Locomotive" value={locomotive} onToggle={() => setLocomotive(v => !v)} />
                        <CheckRow label="Hearing" value={hearing} onToggle={() => setHearing(v => !v)} />
                        <CheckRow label="Visual" value={visual} onToggle={() => setVisual(v => !v)} />
                      </View>
                    </View>
                  )}
                </View>

                <TouchableOpacity style={[st.nextBtn, { backgroundColor: '#059669' }]} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Complete Signup</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />

      {/* ── Photo Modal ── */}
      <Modal visible={showPicModal} transparent animationType="slide">
        <View style={[st.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[st.modalSheet, { backgroundColor: theme.card }]}>
            <View style={[st.modalHandle, { backgroundColor: theme.border }]} />
            <Text style={[st.modalTitle, { color: theme.textMuted }]}>Profile Photo</Text>
            <TouchableOpacity style={st.modalRow} onPress={() => pickImage(true)}>
              <Image source={require('../../assets/signup/camera-01.png')} style={{ width: 22, height: 22, tintColor: theme.text }} resizeMode="contain" />
              <Text style={[st.modalRowText, { color: theme.text }]}>Take a Photo</Text>
            </TouchableOpacity>
            <View style={[st.modalDivider, { backgroundColor: theme.divider }]} />
            <TouchableOpacity style={st.modalRow} onPress={() => pickImage(false)}>
              <Image source={require('../../assets/signup/upload-04.png')} style={{ width: 22, height: 22, tintColor: theme.text }} resizeMode="contain" />
              <Text style={[st.modalRowText, { color: theme.text }]}>Choose from Gallery</Text>
            </TouchableOpacity>
            {photoUri && (
              <>
                <View style={[st.modalDivider, { backgroundColor: theme.divider }]} />
                <TouchableOpacity style={st.modalRow} onPress={() => { setPhotoUri(null); setPhotoBase64(''); setShowPicModal(false); }}>
                  <Trash2 size={22} color="#DC2626" />
                  <Text style={[st.modalRowText, { color: '#DC2626' }]}>Remove Photo</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[st.modalCloseBtn, { borderColor: theme.border }]} onPress={() => setShowPicModal(false)}>
              <Text style={[st.modalCloseText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── DOB Picker ── */}
      {showDobPicker && (
        Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide" onRequestClose={() => setShowDobPicker(false)}>
            <TouchableOpacity style={[st.modalOverlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={() => setShowDobPicker(false)}>
              <View style={[st.modalSheet, { backgroundColor: theme.card, paddingBottom: 32 }]}>
                <View style={[st.modalHandle, { backgroundColor: theme.border }]} />
                <Text style={[st.modalTitle, { color: theme.textMuted }]}>Date of Birth</Text>
                <DateTimePicker
                  mode="date"
                  display="spinner"
                  value={dobDate || MAX_DOB}
                  maximumDate={MAX_DOB}
                  onChange={(_, date) => {
                    if (date) {
                      setDobDate(date);
                      const d = String(date.getDate()).padStart(2, '0');
                      const m = String(date.getMonth() + 1).padStart(2, '0');
                      const y = date.getFullYear();
                      setDob(`${d}-${m}-${y}`);
                    }
                  }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity style={[st.modalCloseBtn, { borderColor: theme.border }]} onPress={() => setShowDobPicker(false)}>
                  <Text style={[st.modalCloseText, { color: theme.text }]}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        ) : (
          <DateTimePicker
            mode="date"
            display="default"
            value={dobDate || MAX_DOB}
            maximumDate={MAX_DOB}
            onChange={(_, date) => {
              setShowDobPicker(false);
              if (date) {
                setDobDate(date);
                const d = String(date.getDate()).padStart(2, '0');
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const y = date.getFullYear();
                setDob(`${d}-${m}-${y}`);
              }
            }}
          />
        )
      )}

      {/* ── Gender Picker ── */}
      <SimplePickerModal
        visible={showGenderPicker}
        title="Select Gender"
        options={['Male', 'Female', 'Other']}
        selected={gender}
        onClose={() => setShowGenderPicker(false)}
        onSelect={setGender}
      />

      {/* ── Marital Status Picker ── */}
      <SimplePickerModal
        visible={showMaritalPicker}
        title="Select Marital Status"
        options={['Single', 'Married', 'Divorced', 'Widowed']}
        selected={maritalStatus}
        onClose={() => setShowMaritalPicker(false)}
        onSelect={setMaritalStatus}
      />

      {/* ── Blood Group Picker ── */}
      <SimplePickerModal
        visible={showBloodPicker}
        title="Select Blood Group"
        options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']}
        selected={bloodGroup}
        onClose={() => setShowBloodPicker(false)}
        onSelect={setBloodGroup}
      />

      {/* ── Address Country Picker ── */}
      <CountryPickerModal
        visible={showAddrCountryPicker}
        countries={countries}
        selected={addrCountry}
        onClose={() => setShowAddrCountryPicker(false)}
        onSelect={setAddrCountry}
      />

      {/* ── Country of Origin Picker ── */}
      <CountryPickerModal
        visible={showOriginCountryPicker}
        countries={countries}
        selected={originCountry}
        onClose={() => setShowOriginCountryPicker(false)}
        onSelect={setOriginCountry}
      />

    </SafeAreaView>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PURPLE_BG },

  carouselTop: { flex: 1.2, justifyContent: 'center', alignItems: 'center', paddingTop: moderateScale(60), backgroundColor: PURPLE_BG },
  carouselImg: { width: width * 0.75, height: width * 0.65 },
  carouselCard: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(32), borderTopRightRadius: moderateScale(32), padding: moderateScale(32), paddingBottom: Platform.OS === 'ios' ? 48 : 36 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: moderateScale(20) },
  dot: { width: moderateScale(8), height: moderateScale(8), borderRadius: 4, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  dotActive: { width: moderateScale(24), backgroundColor: PURPLE },
  slideTitle: { fontSize: moderateScale(22), fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: moderateScale(12) },
  slideSub: { fontSize: moderateScale(14), color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: moderateScale(32) },
  getStartedBtn: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: moderateScale(56), borderRadius: moderateScale(28) },
  getStartedText: { color: '#FFF', fontSize: moderateScale(16), fontWeight: '700', marginRight: moderateScale(8) },

  step1Top: { flex: 0.75, backgroundColor: PURPLE_BG, justifyContent: 'center', alignItems: 'center' },
  backBtnLight: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 28, left: 16, width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  step1Img: { width: wp(44), height: wp(44) },

  bottomCard: { flex: 1, backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(32), borderTopRightRadius: moderateScale(32), paddingHorizontal: moderateScale(24), paddingTop: moderateScale(28), ...SHADOWS.medium },
  cardScroll: { paddingBottom: moderateScale(100) },
  cardTitle: { fontSize: moderateScale(24), fontWeight: '900', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: moderateScale(14), color: '#6B7280', lineHeight: 20, marginBottom: moderateScale(24) },

  loginLink: { alignItems: 'center', marginTop: moderateScale(20) },
  loginLinkText: { fontSize: moderateScale(14), color: '#6B7280' },
  loginLinkBold: { color: PURPLE, fontWeight: '700' },

  dataTop: { backgroundColor: PURPLE_BG, paddingBottom: 0 },
  dataTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(16), height: moderateScale(56) },
  dataBackBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  stepBarRow: { flex: 1, flexDirection: 'row', marginHorizontal: moderateScale(10) },
  stepBarItem: { flex: 1, height: 5, backgroundColor: '#DDD6FE', borderRadius: 3 },
  stepBarActive: { backgroundColor: PURPLE },
  stepCount: { fontSize: moderateScale(13), fontWeight: '700', color: PURPLE, width: moderateScale(36), textAlign: 'right' },
  dataTopCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: moderateScale(16), paddingBottom: moderateScale(28) },
  topIllustration: { width: wp(38), height: wp(33) },

  avatarPickerWrap: { position: 'relative', width: moderateScale(110), height: moderateScale(110), borderRadius: moderateScale(55) },
  avatarImg: { width: moderateScale(110), height: moderateScale(110), borderRadius: moderateScale(55), borderWidth: 3, borderColor: '#EDE9FE' },
  avatarPlaceholder: { width: moderateScale(110), height: moderateScale(110), borderRadius: moderateScale(55), backgroundColor: '#EDE9FE', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  camBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: PURPLE, width: moderateScale(32), height: moderateScale(32), borderRadius: moderateScale(16), justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarHint: { fontSize: moderateScale(12), color: '#6D28D9', fontWeight: '600', marginTop: moderateScale(10), textAlign: 'center' },

  inputWrap: { marginBottom: moderateScale(20), position: 'relative' },
  floatLabel: { position: 'absolute', top: -9, left: 14, zIndex: 2, backgroundColor: '#FFF', paddingHorizontal: 4, fontSize: moderateScale(11), color: '#9CA3AF', fontWeight: '600' },
  input: { backgroundColor: '#FFF', borderRadius: moderateScale(14), paddingHorizontal: moderateScale(16), height: moderateScale(56), fontSize: moderateScale(15), fontWeight: '600', color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },
  inputRow: { flexDirection: 'row' },

  pickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: moderateScale(14), paddingHorizontal: moderateScale(16), height: moderateScale(56), borderWidth: 1.5, borderColor: '#E5E7EB' },
  pickerText: { flex: 1, fontSize: moderateScale(15), fontWeight: '600', color: '#111827' },

  nextBtn: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: moderateScale(58), borderRadius: moderateScale(30), marginTop: moderateScale(8), ...SHADOWS.medium },
  nextBtnText: { color: '#FFF', fontSize: moderateScale(16), fontWeight: '800', marginRight: moderateScale(8) },

  skipNote: { fontSize: moderateScale(12), color: '#9CA3AF', textAlign: 'center', marginTop: moderateScale(16), lineHeight: 18 },

  // Toggle + disability
  toggleCard: { backgroundColor: '#FAFAFA', borderRadius: moderateScale(16), padding: moderateScale(16), marginBottom: moderateScale(16), borderWidth: 1, borderColor: '#F3F4F6' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: moderateScale(15), fontWeight: '700', color: '#111827' },

  checkGroup: { marginTop: moderateScale(14) },
  checkGroupLabel: { fontSize: moderateScale(12), fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: moderateScale(12) },
  checkGroupRow: { flexDirection: 'row', gap: moderateScale(12), flexWrap: 'wrap' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(8), paddingVertical: 4 },
  checkBox: { width: moderateScale(22), height: moderateScale(22), borderRadius: moderateScale(6), borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  checkBoxActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  checkLabel: { fontSize: moderateScale(14), fontWeight: '600', color: '#374151' },

  // Success
  successCircle: { width: moderateScale(100), height: moderateScale(100), borderRadius: moderateScale(50), backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(24), ...SHADOWS.medium },
  successTitle: { fontSize: moderateScale(26), fontWeight: '900', color: '#111827', marginBottom: moderateScale(12) },
  successSub: { fontSize: moderateScale(15), color: '#6B7280', textAlign: 'center', lineHeight: 22, paddingHorizontal: moderateScale(32) },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: moderateScale(28), borderTopRightRadius: moderateScale(28), padding: moderateScale(24), paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHandle: { width: moderateScale(40), height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(20) },
  modalTitle: { fontSize: moderateScale(13), fontWeight: '700', color: '#9CA3AF', marginBottom: moderateScale(16), textTransform: 'uppercase', letterSpacing: 0.6 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(16) },
  modalDivider: { height: 1, backgroundColor: '#F3F4F6' },
  modalRowText: { fontSize: moderateScale(16), fontWeight: '600', color: '#111827', marginLeft: moderateScale(16) },
  modalCloseBtn: { marginTop: moderateScale(16), height: moderateScale(52), borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: moderateScale(26), justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { fontSize: moderateScale(15), fontWeight: '700', color: '#374151' },

  countrySearch: { height: moderateScale(44), borderRadius: moderateScale(10), borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: moderateScale(14), fontSize: moderateScale(14), color: '#111827', marginBottom: moderateScale(12) },
  vRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, marginLeft: 2 },
  vText: { fontSize: moderateScale(11), fontWeight: '600' },
  vDotGreen: { color: '#16A34A', fontSize: moderateScale(10), marginRight: 5 },
  vDotRed: { color: '#DC2626', fontSize: moderateScale(10), marginRight: 5 },
  countryItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: moderateScale(14), borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  countryItemText: { fontSize: moderateScale(15), color: '#4B5563', flex: 1 },
  countryItemActive: { color: PURPLE, fontWeight: '700' },
});

export default SignupScreen;
