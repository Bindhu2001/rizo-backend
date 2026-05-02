import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
  FlatList, Modal, StatusBar, Image, ActivityIndicator
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2, ChevronRight, Camera, FileText, Check } from 'lucide-react-native';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
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
  const [address, setAddress] = useState({ house: '', line2: '', city: '', pincode: '', state: '', country: '' });

  // Step 5 – KYC
  const [kycDocType] = useState('Aadhar Card');
  const [kycDocNumber, setKycDocNumber] = useState('');
  const [aadharDoc, setAadharDoc] = useState(null);
  const [panDoc, setPanDoc] = useState(null);

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
          setStep(3);
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

  // ── Step 5: Final submit ──────────────────────────────────────────────────
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
        kyc_type: kycDocType,
        kyc_number: kycDocNumber,
      };
      if (photoBase64) payload.profile_pic = `data:image/jpeg;base64,${photoBase64}`;
      if (aadharDoc) {
        try {
          const b64 = await FileSystem.readAsStringAsync(aadharDoc.uri, { encoding: FileSystem.EncodingType.Base64 });
          payload.aadhar_card = `data:${aadharDoc.mimeType || 'image/jpeg'};base64,${b64}`;
        } catch (_) {}
      }
      if (panDoc) {
        try {
          const b64 = await FileSystem.readAsStringAsync(panDoc.uri, { encoding: FileSystem.EncodingType.Base64 });
          payload.pan_card = `data:${panDoc.mimeType || 'image/jpeg'};base64,${b64}`;
        } catch (_) {}
      }
      const res = await axios.post(API_ENDPOINTS.REGISTER, payload, { headers: { 'Content-Type': 'application/json' } });
      if (res.data?.success) {
        setStep(6);
      } else {
        showAlert('error', 'Submission Failed', res.data?.message || 'Could not complete signup. Please try again.');
        navigation.navigate('Login');
      }
    } catch (e) {
      console.log('Signup error', e.message);
      navigation.navigate('Login');
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
      handleFinalSubmit();
    }
  };

  const prevStep = () => {
    if (step === 3) setStep(1);
    else if (step === 4) setStep(3);
    else if (step === 5) setStep(4);
    else if (step === 1) setStep(0);
    else navigation.goBack();
  };

  const pickImage = async (useCamera = false) => {
    const { status } = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('error', 'Permission Denied', 'Camera or gallery access is required to add a profile photo.'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64);
      setShowPicModal(false);
    }
  };

  const pickDocument = async (type) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        if (type === 'aadhar') setAadharDoc(result.assets[0]);
        else setPanDoc(result.assets[0]);
      }
    } catch (_) {
      showAlert('error', 'Upload Failed', 'Could not open the document picker. Please try again.');
    }
  };

  const getStepNum = () => {
    if (step === 3) return 1;
    if (step === 4) return 2;
    if (step === 5) return 3;
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
  // ── STEP 6: SUCCESS
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 6) {
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
  // ── STEPS 3 / 4 / 5  —  V1 SPLIT DESIGN: purple top + white card bottom
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={PURPLE_BG} />

      {/* ── PURPLE TOP SECTION ── */}
      <View style={st.dataTop}>

        {/* Step header bar */}
        <View style={st.dataTopBar}>
          <TouchableOpacity onPress={prevStep} style={st.dataBackBtn}>
            <ChevronLeft color={PURPLE} size={28} />
          </TouchableOpacity>
          <StepBar current={getStepNum()} total={3} />
          <Text style={st.stepCount}>{getStepNum()} / 3</Text>
        </View>

        {/* Illustration / Avatar area */}
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
          {step === 4 && (
            <Image source={require('../../assets/signup/group-1.png')} style={st.topIllustration} resizeMode="contain" />
          )}
          {step === 5 && (
            <Image source={require('../../assets/signup/illustration-3.png')} style={st.topIllustration} resizeMode="contain" />
          )}
        </View>
      </View>

      {/* ── WHITE CARD BOTTOM ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={st.bottomCard}>
          <ScrollView
            contentContainerStyle={st.cardScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

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
                <FloatInput label="House / Flat Name" value={address.house} onChangeText={t => setAddress({ ...address, house: t.replace(/[^A-Za-z0-9\s,./#()-]/g, '') })} placeholder="Flat 12A, Sunshine Apt" maxLength={60} />
                <FloatInput label="Address Line 2 (Optional)" value={address.line2} onChangeText={t => setAddress({ ...address, line2: t.replace(/[^A-Za-z0-9\s,./#()-]/g, '') })} placeholder="Near City Mall" maxLength={60} />
                <View style={st.inputRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <FloatInput label="City" value={address.city} onChangeText={t => setAddress({ ...address, city: t.replace(/[^A-Za-z\s]/g, '') })} placeholder="Mumbai" maxLength={30} />
                  </View>
                  <View style={{ width: 120 }}>
                    <FloatInput label="Pin Code" value={address.pincode} onChangeText={t => setAddress({ ...address, pincode: t.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="400001" maxLength={6} />
                  </View>
                </View>
                <FloatInput label="State" value={address.state} onChangeText={t => setAddress({ ...address, state: t.replace(/[^A-Za-z\s]/g, '') })} placeholder="Maharashtra" maxLength={30} />
                <FloatInput label="Country" value={address.country} onChangeText={t => setAddress({ ...address, country: t.replace(/[^A-Za-z\s]/g, '') })} placeholder="India" maxLength={30} />
                <TouchableOpacity style={st.nextBtn} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Continue</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
              </>
            )}

            {/* ══ STEP 5 — ID / KYC ══ */}
            {step === 5 && (
              <>
                <Text style={st.cardTitle}>ID Verification</Text>
                <Text style={st.cardSub}>Upload your government-issued identity documents</Text>

                <Text style={st.docLabel}>PAN Card</Text>
                <FloatInput label="PAN Card Number" value={kycDocNumber} onChangeText={t => setKycDocNumber(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE1234F" maxLength={10} />
                <TouchableOpacity style={[st.uploadBtn, panDoc && st.uploadBtnDone]} onPress={() => pickDocument('pan')} activeOpacity={0.8}>
                  <FileText color={panDoc ? '#059669' : PURPLE} size={20} />
                  <Text style={[st.uploadBtnText, panDoc && { color: '#059669' }]}>
                    {panDoc ? `✓  ${panDoc.name}` : 'Upload PAN Card (JPG / PNG / PDF)'}
                  </Text>
                </TouchableOpacity>

                <Text style={st.docLabel}>Aadhaar Card</Text>
                <TouchableOpacity style={[st.uploadBtn, aadharDoc && st.uploadBtnDone]} onPress={() => pickDocument('aadhar')} activeOpacity={0.8}>
                  <FileText color={aadharDoc ? '#059669' : PURPLE} size={20} />
                  <Text style={[st.uploadBtnText, aadharDoc && { color: '#059669' }]}>
                    {aadharDoc ? `✓  ${aadharDoc.name}` : 'Upload Aadhaar Card (JPG / PNG / PDF)'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={[st.nextBtn, { backgroundColor: '#059669' }]} onPress={nextStep} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Text style={st.nextBtnText}>Complete Signup</Text><ChevronRight color="#FFF" size={20} /></>}
                </TouchableOpacity>
                <Text style={st.skipNote}>Documents are optional — you can add them later from your profile.</Text>
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
    </SafeAreaView>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PURPLE_BG },

  // ── Welcome Carousel ─────────────────────────────────────────────────────
  carouselTop: {
    flex: 1.2, justifyContent: 'center', alignItems: 'center',
    paddingTop: 60, backgroundColor: PURPLE_BG,
  },
  carouselImg: { width: width * 0.75, height: width * 0.65 },
  carouselCard: {
    backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 32, paddingBottom: Platform.OS === 'ios' ? 48 : 36,
  },
  dotRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  dotActive: { width: 24, backgroundColor: PURPLE },
  slideTitle: { fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 12 },
  slideSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  getStartedBtn: {
    backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', height: 56, borderRadius: 28,
  },
  getStartedText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginRight: 8 },

  // ── Step 1 top (split layout same style as carousel) ─────────────────────
  step1Top: {
    flex: 0.75, backgroundColor: PURPLE_BG,
    justifyContent: 'center', alignItems: 'center',
  },
  backBtnLight: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 28,
    left: 16, width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
  },
  step1Img: { width: 170, height: 170 },

  // ── Shared white bottom card ──────────────────────────────────────────────
  bottomCard: {
    flex: 1, backgroundColor: '#FFF',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 28,
    ...SHADOWS.medium,
  },
  cardScroll: { paddingBottom: 32 },
  cardTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 4 },
  cardSub: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 24 },

  // ── Login link (step 1) ───────────────────────────────────────────────────
  loginLink: { alignItems: 'center', marginTop: 20 },
  loginLinkText: { fontSize: 14, color: '#6B7280' },
  loginLinkBold: { color: PURPLE, fontWeight: '700' },

  // ── Data steps: purple top section ───────────────────────────────────────
  dataTop: { backgroundColor: PURPLE_BG, paddingBottom: 0 },
  dataTopBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, height: 56,
  },
  dataBackBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  stepBarRow: { flex: 1, flexDirection: 'row', marginHorizontal: 10 },
  stepBarItem: { flex: 1, height: 5, backgroundColor: '#DDD6FE', borderRadius: 3 },
  stepBarActive: { backgroundColor: PURPLE },
  stepCount: { fontSize: 13, fontWeight: '700', color: PURPLE, width: 36, textAlign: 'right' },

  dataTopCenter: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingBottom: 28,
  },
  topIllustration: { width: 150, height: 130 },

  // ── Avatar picker (step 3 in purple top) ─────────────────────────────────
  avatarPickerWrap: {
    position: 'relative', width: 110, height: 110, borderRadius: 55,
  },
  avatarImg: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: '#EDE9FE',
  },
  avatarPlaceholder: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#EDE9FE', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  camBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: PURPLE, width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  avatarHint: {
    fontSize: 12, color: '#6D28D9', fontWeight: '600',
    marginTop: 10, textAlign: 'center',
  },

  // ── Floating input ────────────────────────────────────────────────────────
  inputWrap: { marginBottom: 20, position: 'relative' },
  floatLabel: {
    position: 'absolute', top: -9, left: 14, zIndex: 2,
    backgroundColor: '#FFF', paddingHorizontal: 4,
    fontSize: 11, color: '#9CA3AF', fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 16, height: 56,
    fontSize: 15, fontWeight: '600', color: '#111827',
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  inputRow: { flexDirection: 'row' },

  // ── Action button ─────────────────────────────────────────────────────────
  nextBtn: {
    backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', height: 58, borderRadius: 30,
    marginTop: 8, ...SHADOWS.medium,
  },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', marginRight: 8 },

  // ── Document upload ───────────────────────────────────────────────────────
  docLabel: {
    fontSize: 12, fontWeight: '800', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C4B5FD',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16,
    marginBottom: 16, backgroundColor: '#FAF5FF',
  },
  uploadBtnDone: { borderColor: '#6EE7B7', borderStyle: 'solid', backgroundColor: '#ECFDF5' },
  uploadBtnText: { fontSize: 14, fontWeight: '600', color: PURPLE, marginLeft: 12, flex: 1 },
  skipNote: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 16, lineHeight: 18 },

  // ── Success ───────────────────────────────────────────────────────────────
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center',
    marginBottom: 24, ...SHADOWS.medium,
  },
  successTitle: { fontSize: 26, fontWeight: '900', color: '#111827', marginBottom: 12 },
  successSub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, paddingHorizontal: 32 },

  // ── Photo modal ───────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.6 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  modalDivider: { height: 1, backgroundColor: '#F3F4F6' },
  modalRowText: { fontSize: 16, fontWeight: '600', color: '#111827', marginLeft: 16 },
  modalCloseBtn: {
    marginTop: 16, height: 52, borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 26, justifyContent: 'center', alignItems: 'center',
  },
  modalCloseText: { fontSize: 15, fontWeight: '700', color: '#374151' },
});

export default SignupScreen;
