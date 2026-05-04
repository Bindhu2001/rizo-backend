import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
  FlatList, Modal, StatusBar, Image, ActivityIndicator, Switch,
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2, ChevronRight, Camera, Check, ChevronDown } from 'lucide-react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';

const { width } = Dimensions.get('window');
const PURPLE = '#4A148C';
const PURPLE_BG = '#F5F0FF';

// ─── Floating Label Input ──────────────────────────────────────────────────────
const FloatInput = ({ label, value, onChangeText, keyboardType = 'default', secureTextEntry = false, maxLength, placeholder = '' }) => (
  <View style={st.inputWrap}>
    <Text style={st.floatLabel}>{label}</Text>
    <TextInput
      style={st.input}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      placeholder={placeholder}
      placeholderTextColor="#CBD5E0"
      maxLength={maxLength}
    />
  </View>
);

// ─── Picker Row (dropdown trigger) ────────────────────────────────────────────
const PickerRow = ({ label, value, onPress }) => (
  <View style={st.inputWrap}>
    <Text style={st.floatLabel}>{label}</Text>
    <TouchableOpacity style={st.pickerRow} onPress={onPress} activeOpacity={0.75}>
      <Text style={[st.pickerText, !value && { color: '#CBD5E0' }]}>{value || `Select ${label}`}</Text>
      <ChevronDown color="#9CA3AF" size={18} />
    </TouchableOpacity>
  </View>
);

// ─── Checkbox Row ──────────────────────────────────────────────────────────────
const CheckRow = ({ label, value, onToggle }) => (
  <TouchableOpacity style={st.checkRow} onPress={onToggle} activeOpacity={0.75}>
    <View style={[st.checkBox, value && st.checkBoxActive]}>
      {value && <Check color="#FFF" size={13} strokeWidth={3} />}
    </View>
    <Text style={st.checkLabel}>{label}</Text>
  </TouchableOpacity>
);

// ─── Step Progress Bar ─────────────────────────────────────────────────────────
const StepBar = ({ current, total }) => (
  <View style={st.stepBarRow}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={[st.stepBarItem, i < current && st.stepBarActive, { marginRight: i < total - 1 ? 6 : 0 }]}
      />
    ))}
  </View>
);

// ─── Country Picker Modal ──────────────────────────────────────────────────────
const CountryPickerModal = ({ visible, countries, selected, onClose, onSelect }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={onClose}>
      <View style={st.modalSheet}>
        <View style={st.modalHandle} />
        <Text style={st.modalTitle}>Select Country</Text>
        <ScrollView style={{ maxHeight: 320 }}>
          {countries.map((c, i) => (
            <TouchableOpacity
              key={i}
              style={st.countryItem}
              onPress={() => { onSelect(c); onClose(); }}
            >
              <Text style={[st.countryItemText, selected?.id === c.id && st.countryItemActive]}>
                {c.country_name}
              </Text>
              {selected?.id === c.id && <Check color={PURPLE} size={18} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={st.modalCloseBtn} onPress={onClose}>
          <Text style={st.modalCloseText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

// ─── Welcome Slides ────────────────────────────────────────────────────────────
const SLIDES = [
  { id: '1', title: 'Transform your career', subtitle: 'Transform your career with a portable HR profile that travels with you! Streamline your info sharing securely', img: require('../../assets/signup/group.png') },
  { id: '2', title: 'Seamless Connections', subtitle: 'Enjoy seamless connections with instant profile sharing! Streamline your work life and elevate your experience!', img: require('../../assets/signup/group-1.png') },
  { id: '3', title: 'Document Management', subtitle: 'Streamline document management! Easily store and share important papers in one app.', img: require('../../assets/signup/illustration-3.png') },
];

// ─── SignupScreen ──────────────────────────────────────────────────────────────
const SignupScreen = ({ navigation }) => {
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
  const [lastName, setLastName] = useState('');
  const [mobileNo, setMobileNo] = useState('');
  const [dob, setDob] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState('');
  const [showPicModal, setShowPicModal] = useState(false);

  // Step 4 – Address
  const [address, setAddress] = useState({ house: '', line2: '', city: '', pincode: '', state: '' });
  const [addrCountry, setAddrCountry] = useState(null);
  const [showAddrCountryPicker, setShowAddrCountryPicker] = useState(false);

  // Step 5 – KYC (Aadhaar number only)
  const [aadhaarNumber, setAadhaarNumber] = useState('');

  // Step 6 – Other Details
  const [intlWorker, setIntlWorker] = useState(false);
  const [intlCountry, setIntlCountry] = useState(null);
  const [showIntlCountryPicker, setShowIntlCountryPicker] = useState(false);
  const [physHandicap, setPhysHandicap] = useState(false);
  const [locomotive, setLocomotive] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [visual, setVisual] = useState(false);

  // Countries list
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    fetchCountries();
  }, []);

  const fetchCountries = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.GET_COUNTRIES);
      if (res.data?.success && res.data.data) setCountries(res.data.data);
    } catch (_) {}
  };

  // ── Step 1: Verify email + company code ──────────────────────────────────
  const handleStep1Submit = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!companyCode.trim() || !email.trim()) {
      showAlert('error', 'Missing Details', 'Please enter your Company Code and Email to continue.');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      showAlert('warning', 'Invalid Email', 'Please enter a valid email address (e.g. john@company.com).');
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
      const payload = {
        company_code: companyCode,
        first_name: name,
        last_name: lastName,
        mobile_no: mobileNo,
        email: email,
        date_of_birth: dob,
        address: `${address.house} ${address.line2} ${address.city} ${address.state}`.trim(),
        pincode: address.pincode,
        country: addrCountry?.id || null,
        kyc_type: 'Aadhar Card',
        kyc_number: aadhaarNumber,
        international_worker: intlWorker ? 'Y' : 'N',
        intl_country: intlWorker && intlCountry ? intlCountry.id : null,
        physical_handicap: physHandicap ? 'Y' : 'N',
        locomotive: physHandicap && locomotive ? 'Y' : 'N',
        hearing: physHandicap && hearing ? 'Y' : 'N',
        visual: physHandicap && visual ? 'Y' : 'N',
      };
      if (photoBase64) payload.profile_pic = `data:image/jpeg;base64,${photoBase64}`;

      const res = await axios.post(API_ENDPOINTS.REGISTER, payload, { headers: { 'Content-Type': 'application/json' } });
      if (res.data?.success) {
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
      if (!mobileNo.trim() || mobileNo.length < 10) { showAlert('warning', 'Invalid Mobile', 'Please enter a valid 10-digit mobile number.'); return; }
      setStep(4);
    } else if (step === 4) {
      if (!address.house.trim()) { showAlert('warning', 'Address Required', 'Please enter your house or flat address to continue.'); return; }
      setStep(5);
    } else if (step === 5) {
      setStep(6);
    } else if (step === 6) {
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
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64);
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
      <View style={st.container}>
        <StatusBar barStyle="dark-content" backgroundColor={PURPLE_BG} />
        <FlatList
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setCarouselIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width }}>
              <View style={st.carouselTop}>
                <Image source={item.img} style={st.carouselImg} resizeMode="contain" />
              </View>
              <View style={st.carouselCard}>
                <View style={st.dotRow}>
                  {SLIDES.map((_, i) => (
                    <View key={i} style={[st.dot, carouselIndex === i && st.dotActive]} />
                  ))}
                </View>
                <Text style={st.slideTitle}>{item.title}</Text>
                <Text style={st.slideSub}>{item.subtitle}</Text>
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
      <View style={st.container}>
        <StatusBar barStyle="dark-content" backgroundColor={PURPLE_BG} />
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={st.step1Top}>
            <TouchableOpacity onPress={prevStep} style={st.backBtnLight}>
              <ChevronLeft color={PURPLE} size={28} />
            </TouchableOpacity>
            <Image source={require('../../assets/signup/group.png')} style={st.step1Img} resizeMode="contain" />
          </View>
          <View style={st.bottomCard}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <Text style={st.cardTitle}>Hello,</Text>
              <Text style={st.cardSub}>Enter your details to continue</Text>
              <View style={{ marginTop: 28 }}>
                <FloatInput label="Company Code" value={companyCode} onChangeText={t => setCompanyCode(t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="GLET" maxLength={50} />
              </View>
              <FloatInput label="Email ID" value={email} onChangeText={t => setEmail(t.replace(/[^a-zA-Z0-9@._-]/g, ''))} keyboardType="email-address" placeholder="john@company.com" maxLength={100} />
              <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={st.nextBtnText}>Continue</Text>
                    <ChevronRight color="#FFF" size={20} />
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={st.loginLink} onPress={() => navigation.navigate('Login')}>
                <Text style={st.loginLinkText}>Already have an account? <Text style={st.loginLinkBold}>Login</Text></Text>
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
      <SafeAreaView style={[st.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <View style={st.successCircle}>
          <Check color="#FFF" size={44} strokeWidth={3} />
        </View>
        <Text style={st.successTitle}>Profile Complete!</Text>
        <Text style={st.successSub}>Your account has been created successfully. You can now login.</Text>
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
    <SafeAreaView style={st.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={PURPLE_BG} />

      {/* ── PURPLE TOP SECTION ── */}
      <View style={st.dataTop}>
        <View style={st.dataTopBar}>
          <TouchableOpacity onPress={prevStep} style={st.dataBackBtn}>
            <ChevronLeft color={PURPLE} size={28} />
          </TouchableOpacity>
          <StepBar current={getStepNum()} total={4} />
          <Text style={st.stepCount}>{getStepNum()} / 4</Text>
        </View>

        <View style={st.dataTopCenter}>
          {step === 3 && (
            <>
              <TouchableOpacity onPress={() => setShowPicModal(true)} style={st.avatarPickerWrap} activeOpacity={0.85}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={st.avatarImg} />
                ) : (
                  <View style={st.avatarPlaceholder}>
                    <Image source={require('../../assets/signup/picture-updating.png')} style={{ width: 90, height: 90, borderRadius: 45 }} resizeMode="cover" />
                  </View>
                )}
                <View style={st.camBadge}>
                  <Camera color="#FFF" size={14} />
                </View>
              </TouchableOpacity>
              <Text style={st.avatarHint}>{photoUri ? 'Tap to change photo' : 'Tap to add profile photo'}</Text>
            </>
          )}
          {step === 4 && <Image source={require('../../assets/signup/group-1.png')} style={st.topIllustration} resizeMode="contain" />}
          {step === 5 && <Image source={require('../../assets/signup/illustration-3.png')} style={st.topIllustration} resizeMode="contain" />}
          {step === 6 && <Image source={require('../../assets/signup/group-1.png')} style={st.topIllustration} resizeMode="contain" />}
        </View>
      </View>

      {/* ── WHITE CARD BOTTOM ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.bottomCard}>
          <ScrollView contentContainerStyle={st.cardScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ══ STEP 3 — PERSONAL DETAILS ══ */}
            {step === 3 && (
              <>
                <Text style={st.cardTitle}>Personal Details</Text>
                <Text style={st.cardSub}>Let's start with your basic information</Text>
                <FloatInput label="First Name" value={name} onChangeText={t => setName(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="John" maxLength={25} />
                <FloatInput label="Last Name" value={lastName} onChangeText={t => setLastName(t.replace(/[^A-Za-z\s]/g, ''))} placeholder="Doe" maxLength={25} />
                <FloatInput label="Mobile Number" value={mobileNo} onChangeText={t => setMobileNo(t.replace(/[^0-9]/g, ''))} keyboardType="phone-pad" placeholder="9876543210" maxLength={10} />
                <FloatInput label="Date of Birth (DD-MM-YYYY)" value={dob} onChangeText={t => setDob(t.replace(/[^0-9-]/g, ''))} placeholder="01-01-1998" maxLength={10} />
                <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Continue</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
              </>
            )}

            {/* ══ STEP 4 — ADDRESS DETAILS ══ */}
            {step === 4 && (
              <>
                <Text style={st.cardTitle}>Address Details</Text>
                <Text style={st.cardSub}>This information will be used for official records</Text>
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
                <Text style={st.cardTitle}>KYC Details</Text>
                <Text style={st.cardSub}>Enter your Aadhaar card number</Text>
                <FloatInput
                  label="Aadhaar Number"
                  value={aadhaarNumber}
                  onChangeText={t => setAadhaarNumber(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="XXXX XXXX XXXX"
                  maxLength={12}
                />
                <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Continue</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
                <Text style={st.skipNote}>You can update your documents later from your profile.</Text>
              </>
            )}

            {/* ══ STEP 6 — OTHER DETAILS ══ */}
            {step === 6 && (
              <>
                <Text style={st.cardTitle}>Other Details</Text>
                <Text style={st.cardSub}>Enter your details to complete signup to Rizo</Text>

                {/* International Worker */}
                <View style={st.toggleCard}>
                  <View style={st.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.toggleLabel}>International Worker</Text>
                    </View>
                    <Switch
                      value={intlWorker}
                      onValueChange={v => { setIntlWorker(v); if (!v) setIntlCountry(null); }}
                      trackColor={{ false: '#E5E7EB', true: '#EDE9FE' }}
                      thumbColor={intlWorker ? PURPLE : '#FFF'}
                    />
                  </View>
                  {intlWorker && (
                    <View style={{ marginTop: 12 }}>
                      <PickerRow label="Country" value={intlCountry?.country_name} onPress={() => setShowIntlCountryPicker(true)} />
                    </View>
                  )}
                </View>

                {/* Physically Handicapped */}
                <View style={st.toggleCard}>
                  <View style={st.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.toggleLabel}>Physically Handicapped</Text>
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
                      <Text style={st.checkGroupLabel}>Types of Disability</Text>
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
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
            <View style={st.modalHandle} />
            <Text style={st.modalTitle}>Profile Photo</Text>
            <TouchableOpacity style={st.modalRow} onPress={() => pickImage(true)}>
              <Image source={require('../../assets/signup/camera-01.png')} style={{ width: 22, height: 22, tintColor: '#111827' }} resizeMode="contain" />
              <Text style={st.modalRowText}>Take a Photo</Text>
            </TouchableOpacity>
            <View style={st.modalDivider} />
            <TouchableOpacity style={st.modalRow} onPress={() => pickImage(false)}>
              <Image source={require('../../assets/signup/upload-04.png')} style={{ width: 22, height: 22, tintColor: '#111827' }} resizeMode="contain" />
              <Text style={st.modalRowText}>Choose from Gallery</Text>
            </TouchableOpacity>
            {photoUri && (
              <>
                <View style={st.modalDivider} />
                <TouchableOpacity style={st.modalRow} onPress={() => { setPhotoUri(null); setPhotoBase64(''); setShowPicModal(false); }}>
                  <Trash2 size={22} color="#DC2626" />
                  <Text style={[st.modalRowText, { color: '#DC2626' }]}>Remove Photo</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={st.modalCloseBtn} onPress={() => setShowPicModal(false)}>
              <Text style={st.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Address Country Picker ── */}
      <CountryPickerModal
        visible={showAddrCountryPicker}
        countries={countries}
        selected={addrCountry}
        onClose={() => setShowAddrCountryPicker(false)}
        onSelect={setAddrCountry}
      />

      {/* ── International Worker Country Picker ── */}
      <CountryPickerModal
        visible={showIntlCountryPicker}
        countries={countries}
        selected={intlCountry}
        onClose={() => setShowIntlCountryPicker(false)}
        onSelect={setIntlCountry}
      />
    </SafeAreaView>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PURPLE_BG },

  carouselTop: { flex: 1.2, justifyContent: 'center', alignItems: 'center', paddingTop: 60, backgroundColor: PURPLE_BG },
  carouselImg: { width: width * 0.75, height: width * 0.65 },
  carouselCard: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingBottom: Platform.OS === 'ios' ? 48 : 36 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  dotActive: { width: 24, backgroundColor: PURPLE },
  slideTitle: { fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 12 },
  slideSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  getStartedBtn: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 28 },
  getStartedText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginRight: 8 },

  step1Top: { flex: 0.75, backgroundColor: PURPLE_BG, justifyContent: 'center', alignItems: 'center' },
  backBtnLight: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 28, left: 16, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  step1Img: { width: 170, height: 170 },

  bottomCard: { flex: 1, backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 28, ...SHADOWS.medium },
  cardScroll: { paddingBottom: 32 },
  cardTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 24 },

  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { fontSize: 14, color: '#6B7280' },
  loginLinkBold: { color: PURPLE, fontWeight: '700' },

  dataTop: { backgroundColor: PURPLE_BG, paddingBottom: 0 },
  dataTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 },
  dataBackBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  stepBarRow: { flex: 1, flexDirection: 'row', marginHorizontal: 10 },
  stepBarItem: { flex: 1, height: 5, backgroundColor: '#DDD6FE', borderRadius: 3 },
  stepBarActive: { backgroundColor: PURPLE },
  stepCount: { fontSize: 13, fontWeight: '700', color: PURPLE, width: 36, textAlign: 'right' },
  dataTopCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingBottom: 28 },
  topIllustration: { width: 150, height: 130 },

  avatarPickerWrap: { position: 'relative', width: 110, height: 110, borderRadius: 55 },
  avatarImg: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#EDE9FE' },
  avatarPlaceholder: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#EDE9FE', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  camBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: PURPLE, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarHint: { fontSize: 12, color: '#6D28D9', fontWeight: '600', marginTop: 10, textAlign: 'center' },

  inputWrap: { marginBottom: 20, position: 'relative' },
  floatLabel: { position: 'absolute', top: -9, left: 14, zIndex: 2, backgroundColor: '#FFF', paddingHorizontal: 4, fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  input: { backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 16, height: 56, fontSize: 15, fontWeight: '600', color: '#111827', borderWidth: 1.5, borderColor: '#E5E7EB' },
  inputRow: { flexDirection: 'row' },

  pickerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1.5, borderColor: '#E5E7EB' },
  pickerText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },

  nextBtn: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 58, borderRadius: 30, marginTop: 8, ...SHADOWS.medium },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', marginRight: 8 },

  skipNote: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 16, lineHeight: 18 },

  // Toggle + disability
  toggleCard: { backgroundColor: '#FAFAFA', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },

  checkGroup: { marginTop: 14 },
  checkGroupLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  checkGroupRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  checkBoxActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  checkLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },

  // Success
  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center', marginBottom: 24, ...SHADOWS.medium },
  successTitle: { fontSize: 26, fontWeight: '900', color: '#111827', marginBottom: 12 },
  successSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, paddingHorizontal: 32 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.6 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  modalDivider: { height: 1, backgroundColor: '#F3F4F6' },
  modalRowText: { fontSize: 16, fontWeight: '600', color: '#111827', marginLeft: 16 },
  modalCloseBtn: { marginTop: 16, height: 52, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '700', color: '#374151' },

  countryItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  countryItemText: { fontSize: 15, color: '#4B5563', flex: 1 },
  countryItemActive: { color: PURPLE, fontWeight: '700' },
});

export default SignupScreen;
