import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
  FlatList, Modal, StatusBar, SafeAreaView as RNSafeAreaView, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2, ArrowRight } from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  { id: '1', title: 'Transform your career', subtitle: 'Transform your career with a portable HR profile that travels with you! Streamline your info sharing securely' },
  { id: '2', title: 'Seamless Connections', subtitle: 'Enjoy seamless connections with instant profile sharing! Streamline your work life and elevate your experience!' },
  { id: '3', title: 'Document Management', subtitle: 'Streamline document management! Easily store and share important papers in one app.' },
];

const SignupScreen = ({ navigation }) => {
  const [step, setStep] = useState(0); 

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null); 
  const [address, setAddress] = useState({ house: '', line2: '', city: '', pincode: '', state: '', country: '' });
  const [kycDoc, setKycDoc] = useState('');
  const [kycDocNumber, setKycDocNumber] = useState('');
  
  const [showScanModal, setShowScanModal] = useState(false);
  const [scannedImage, setScannedImage] = useState(null);
  
  const [otpError, setOtpError] = useState(false);
  const otpRefs = useRef([...Array(6)].map(() => React.createRef()));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPicModal, setShowPicModal] = useState(false);

  const nextStep = () => {
    if (step < 6) setStep(step + 1);
    else navigation.navigate('Login'); 
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
    else navigation.goBack();
  };

  const handleOtpChange = (text, index) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    if (text && index < 5) {
      otpRefs.current[index + 1].current.focus();
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1].current.focus();
    }
  };

  const renderWelcomeCarousel = () => (
    <View style={styles.carouselContainer}>
      <FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({item, index}) => (
          <View style={{ width, flex: 1 }}>
            <View style={styles.illustrationArea}>
              {index === 0 && <Image source={require('../../assets/signup/group.png')} style={styles.illustrationImage} resizeMode="contain" />}
              {index === 1 && <Image source={require('../../assets/signup/group-1.png')} style={styles.illustrationImage} resizeMode="contain" />}
              {index === 2 && <Image source={require('../../assets/signup/illustration-3.png')} style={styles.illustrationImage} resizeMode="contain" />}
            </View>
            <View style={styles.bottomCardWelcome}>
              <View style={styles.paginationDots}>
                {SLIDES.map((_, i) => (
                  <View key={i} style={[styles.dot, currentIndex === i && styles.activeDot]} />
                ))}
              </View>
              <Text style={styles.slideTitle}>{item.title}</Text>
              <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
              <TouchableOpacity style={styles.getStartedBtn} onPress={() => setStep(1)}>
                <Text style={styles.getStartedText}>Get Started</Text>
                <Image source={require('../../assets/signup/arrow-right-02.png')} style={{width: 20, height: 20, tintColor: '#FFF'}} resizeMode="contain" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  const FloatingInput = ({ label, value, onChangeText, keyboardType = 'default', autoFocus=false, secureTextEntry=false, placeholder="" }) => (
    <View style={styles.inputContainer}>
      <View style={styles.floatingLabelContainer}>
        <Text style={styles.floatingLabel}>{label}</Text>
      </View>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor="#CBD5E0"
      />
    </View>
  );

  const renderFormContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.formStep}>
            <Text style={styles.formTitle}>Hello, Enter your Email to Continue</Text>
            <View style={{ marginTop: 30 }}>
               <FloatingInput label="Email ID" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="Loisbecket@gmail.com" />
            </View>
            <View style={styles.nextBtnRow}>
               <TouchableOpacity style={styles.roundNextBtn} onPress={nextStep}>
                 <Image source={require('../../assets/signup/arrow-right-02.png')} style={{width: 24, height: 24, tintColor: '#FFF'}} resizeMode="contain" />
               </TouchableOpacity>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.formStep}>
            <Text style={styles.formTitle}>Welcome to Rizo</Text>
            <Text style={styles.formSubtitle}>Enter OTP sent to {email || 'your email'}</Text>
            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={otpRefs.current[i]}
                  style={[styles.otpBox, otpError && styles.otpBoxError]}
                  value={digit}
                  onChangeText={(txt) => handleOtpChange(txt, i)}
                  onKeyPress={(e) => handleOtpKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                />
              ))}
            </View>
            <View style={styles.otpFooter}>
              <TouchableOpacity><Text style={styles.resendText}>Resend OTP</Text></TouchableOpacity>
              {otpError ? (
                <Text style={styles.errorText}>Invalid OTP</Text>
              ) : (
                <Text style={styles.timerText}>0.25s</Text>
              )}
            </View>
            <View style={styles.nextBtnRow}>
               <TouchableOpacity style={styles.roundNextBtn} onPress={nextStep}>
                 <ArrowRight color="#FFF" size={24} />
               </TouchableOpacity>
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.formStep}>
            <Text style={styles.formTitle}>Welcome, enter your name to continue</Text>
            <View style={{ marginTop: 30 }}>
               <FloatingInput label="Name" value={name} onChangeText={setName} />
            </View>
            <View style={styles.nextBtnRow}>
               <TouchableOpacity style={styles.roundNextBtn} onPress={nextStep}>
                 <ArrowRight color="#FFF" size={24} />
               </TouchableOpacity>
            </View>
          </View>
        );
      case 4:
        return (
          <View style={styles.formStep}>
            <View style={styles.progressBar}>
               {[1,2,3,4,5,6].map(i => <View key={i} style={[styles.progressDash, i <= 3 && styles.progressDashActive]} />)}
            </View>
            <Text style={styles.formTitle}>Upload your profile picture</Text>
            <Text style={styles.formSubtitle}>Enter your details to complete signup to Rizo</Text>
            
            <View style={styles.pictureUploadContainer}>
              <View style={styles.pictureCircle}>
                 {photo ? (
                    <View style={styles.photoUploaded} /> 
                 ) : (
                    <Image source={require('../../assets/signup/picture-updating.png')} style={{width: 140, height: 140, borderRadius: 70}} resizeMode="cover" />
                 )}
                 <TouchableOpacity style={styles.editPicBtn} onPress={() => setShowPicModal(true)}>
                    <Image source={require('../../assets/signup/edit-btn.png')} style={{width: 36, height: 36}} resizeMode="contain" />
                 </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.nextBtnRowSpaceBetween, {marginTop: 60}]}>
               <TouchableOpacity onPress={nextStep}>
                 <Text style={styles.skipText}>Skip & Do it later</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.roundNextBtn} onPress={nextStep}>
                 <ArrowRight color="#FFF" size={24} />
               </TouchableOpacity>
            </View>
          </View>
        );
      case 5:
        return (
          <View style={styles.formStep}>
            <View style={styles.progressBar}>
               {[1,2,3,4,5,6].map(i => <View key={i} style={[styles.progressDash, i <= 4 && styles.progressDashActive]} />)}
            </View>
            <Text style={styles.formTitle}>Add Your Address Details</Text>
            <Text style={styles.formSubtitle}>Enter your details to complete signup to Rizo</Text>
            
            <View style={styles.scrollForm}>
               <TextInput style={styles.simpleInput} placeholder="House/Flat Name" placeholderTextColor="#A0AEC0" value={address.house} onChangeText={t=>setAddress({...address, house: t})} />
               <TextInput style={styles.simpleInput} placeholder="Address Line 2" placeholderTextColor="#A0AEC0" value={address.line2} onChangeText={t=>setAddress({...address, line2: t})} />
               <TextInput style={styles.simpleInput} placeholder="City" placeholderTextColor="#A0AEC0" value={address.city} onChangeText={t=>setAddress({...address, city: t})} />
               <TextInput style={styles.simpleInput} placeholder="Pin code" placeholderTextColor="#A0AEC0" value={address.pincode} onChangeText={t=>setAddress({...address, pincode: t})} keyboardType="number-pad" />
               <TouchableOpacity style={styles.dropdownInput}>
                 <Text style={[styles.dropdownText, !address.state && {color: '#A0AEC0'}]}>{address.state || 'State'}</Text>
                 <Image source={require('../../assets/signup/arrow-down-01.png')} style={{width: 20, height: 20, tintColor: '#A0AEC0'}} resizeMode="contain" />
               </TouchableOpacity>
               <TouchableOpacity style={styles.dropdownInput}>
                 <Text style={[styles.dropdownText, !address.country && {color: '#A0AEC0'}]}>{address.country || 'Country'}</Text>
                 <Image source={require('../../assets/signup/arrow-down-01.png')} style={{width: 20, height: 20, tintColor: '#A0AEC0'}} resizeMode="contain" />
               </TouchableOpacity>
            </View>

            <View style={[styles.nextBtnRowSpaceBetween, {marginTop: 20}]}>
               <TouchableOpacity onPress={nextStep}>
                 <Text style={styles.skipText}>Skip & Do it later</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.roundNextBtn} onPress={nextStep}>
                 <Image source={require('../../assets/signup/arrow-right-02.png')} style={{width: 24, height: 24, tintColor: '#FFF'}} resizeMode="contain" />
               </TouchableOpacity>
            </View>
          </View>
        );
      case 6:
        return (
          <View style={styles.formStep}>
            <View style={styles.progressBar}>
               {[1,2,3,4,5,6].map(i => <View key={i} style={[styles.progressDash, i <= 5 && styles.progressDashActive]} />)}
            </View>
            <Text style={styles.formTitle}>Enter Your KYC Details</Text>
            <Text style={styles.formSubtitle}>Enter your details to complete signup to Rizo</Text>
            
            <View style={styles.scrollForm}>
               <Text style={styles.inputLabel}>Choose Document</Text>
               <TouchableOpacity style={styles.dropdownInput}>
                 <Text style={[styles.dropdownText, !kycDoc && {color: '#A0AEC0'}]}>{kycDoc || 'Aadhar Card'}</Text>
                 <Image source={require('../../assets/signup/arrow-down-01.png')} style={{width: 20, height: 20, tintColor: '#A0AEC0'}} resizeMode="contain" />
               </TouchableOpacity>
               
               <TextInput style={styles.simpleInput} placeholder="Aadhar Card Number" placeholderTextColor="#A0AEC0" value={kycDocNumber} onChangeText={setKycDocNumber} />
               
               <TouchableOpacity style={styles.uploadDocBtn} onPress={() => { setScannedImage(null); setShowScanModal(true); }}>
                 <Image source={require('../../assets/signup/camera-01.png')} style={{width: 20, height: 20, tintColor: '#A0AEC0', marginRight: 12}} resizeMode="contain" />
                 <Text style={styles.uploadDocText}>Upload Image front Side</Text>
               </TouchableOpacity>

               <TouchableOpacity style={styles.uploadDocBtn} onPress={() => { setScannedImage(null); setShowScanModal(true); }}>
                 <Image source={require('../../assets/signup/camera-01.png')} style={{width: 20, height: 20, tintColor: '#A0AEC0', marginRight: 12}} resizeMode="contain" />
                 <Text style={styles.uploadDocText}>Upload Image back Side</Text>
               </TouchableOpacity>

               <TouchableOpacity style={styles.addDocBtn}>
                 <Text style={styles.addDocBtnText}>+ Add Document</Text>
               </TouchableOpacity>
            </View>

            <View style={[styles.nextBtnRowSpaceBetween, {marginTop: 20}]}>
               <TouchableOpacity onPress={nextStep}>
                 <Text style={styles.skipText}>Skip & Do it later</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.roundNextBtn} onPress={nextStep}>
                 <Image source={require('../../assets/signup/arrow-right-02.png')} style={{width: 24, height: 24, tintColor: '#FFF'}} resizeMode="contain" />
               </TouchableOpacity>
            </View>
          </View>
        );
      default: return null;
    }
  };

  const isFullScreenWhite = step >= 4;

  return (
    <View style={[styles.container, isFullScreenWhite && { backgroundColor: '#FFF' }]}>
      <StatusBar barStyle="dark-content" backgroundColor={isFullScreenWhite ? '#FFF' : '#EDF2F6'} />
      {step === 0 ? renderWelcomeCarousel() : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {!isFullScreenWhite ? (
            <>
              <View style={styles.topSection}>
                <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                  <ChevronLeft size={28} color="#333" />
                </TouchableOpacity>
                {step === 1 && <Image source={require('../../assets/signup/group.png')} style={styles.stepIllustrationImage} resizeMode="contain" />}
                {step === 2 && <Image source={require('../../assets/signup/group-1.png')} style={styles.stepIllustrationImage} resizeMode="contain" />}
                {step === 3 && <Image source={require('../../assets/signup/illustration-3.png')} style={styles.stepIllustrationImage} resizeMode="contain" />}
              </View>
              <View style={styles.bottomSheet}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                  {renderFormContent()}
                </ScrollView>
              </View>
            </>
          ) : (
            <RNSafeAreaView style={styles.fullScreenWhite}>
              <View style={styles.fullScreenHeader}>
                <TouchableOpacity onPress={prevStep} style={styles.backBtnFull}>
                  <ChevronLeft size={28} color="#333" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.fullScreenScroll}>
                {renderFormContent()}
              </ScrollView>
            </RNSafeAreaView>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Document Scan Modal */}
      <Modal visible={showScanModal} transparent animationType="fade">
         <View style={styles.scanModalContainer}>
            <View style={styles.scanHeader}>
               <TouchableOpacity onPress={() => setShowScanModal(false)} style={styles.scanBackBtn}>
                  <ChevronLeft size={28} color="#FFF" />
               </TouchableOpacity>
               <Text style={styles.scanTitle}>{scannedImage ? 'Confirm Scan' : 'Scan Card'}</Text>
               <View style={{width: 40}} />
            </View>

            {!scannedImage ? (
               <View style={styles.scannerBody}>
                  <TouchableOpacity activeOpacity={0.9} style={styles.scanFrameArea} onPress={() => setScannedImage(true)}>
                     <View style={styles.scanFrame} />
                     <Text style={[styles.scanInstruction, {marginTop: 20}]}>Tap frame to simulate scan</Text>
                  </TouchableOpacity>
                  <View style={styles.scanControls}>
                     <TouchableOpacity style={styles.scanIconBtn}><Text style={{fontSize: 20}}>🔄</Text></TouchableOpacity>
                     <TouchableOpacity style={styles.scanIconBtn}><Text style={{fontSize: 20}}>⚡</Text></TouchableOpacity>
                  </View>
               </View>
            ) : (
               <View style={styles.scannerBody}>
                  <Text style={styles.scanInstruction}>Position the card within the frame</Text>
                  <View style={[styles.scanFrame, styles.scannedImageSim]} />
                  
                  <View style={styles.scanConfirmControls}>
                     <TouchableOpacity style={styles.discardBtn} onPress={() => setScannedImage(null)}>
                        <Text style={styles.discardBtnText}>Discard</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.confirmBtn} onPress={() => setShowScanModal(false)}>
                        <Text style={styles.confirmBtnText}>Confirm</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            )}
         </View>
      </Modal>

      {/* Picture Modal */}
      <Modal visible={showPicModal} transparent animationType="slide">
         <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <Text style={styles.modalTitle}>Edit Profile Picture</Text>
               <TouchableOpacity style={styles.modalAction} onPress={() => setShowPicModal(false)}>
                  <Image source={require('../../assets/signup/camera-01.png')} style={{width: 20, height: 20, tintColor: '#333'}} resizeMode="contain" />
                  <Text style={styles.modalActionText}>Take a Photo</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.modalAction} onPress={() => setShowPicModal(false)}>
                  <Image source={require('../../assets/signup/upload-04.png')} style={{width: 20, height: 20, tintColor: '#333'}} resizeMode="contain" />
                  <Text style={styles.modalActionText}>Upload From Camera Roll</Text>
               </TouchableOpacity>
               {photo && (
                 <TouchableOpacity style={styles.modalAction} onPress={() => {setPhoto(null); setShowPicModal(false);}}>
                    <Trash2 size={20} color="#E53E3E" />
                    <Text style={[styles.modalActionText, {color: '#E53E3E'}]}>Delete Picture</Text>
                 </TouchableOpacity>
               )}
               <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowPicModal(false)}>
                  <Text style={styles.modalCloseText}>Close</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF2F6',
  },
  topSection: {
    flex: 0.9, 
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: 'center'
  },
  bottomSheet: {
    flex: 1.1,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingTop: 32,
    ...SHADOWS.medium
  },
  scrollContent: {
    paddingBottom: 20,
  },
  fullScreenWhite: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  fullScreenHeader: {
    height: 60,
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: Platform.OS === 'android' ? 20 : 0,
  },
  backBtnFull: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  fullScreenScroll: {
    padding: 24,
    paddingTop: 10,
    paddingBottom: 40,
  },
  carouselContainer: {
    flex: 1,
    backgroundColor: '#EDF2F6',
  },
  illustrationArea: {
    flex: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomCardWelcome: {
    flex: 1,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationDots: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: COLORS.primary || '#E91E63',
    width: 24,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A202C',
    textAlign: 'center',
    marginBottom: 12,
  },
  slideSubtitle: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
    marginBottom: 40,
  },
  getStartedBtn: {
    backgroundColor: COLORS.primaryDeep || '#4A148C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 28,
    width: '100%',
  },
  getStartedText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  formStep: {
    flex: 1,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A202C',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 20,
    lineHeight: 20,
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: '#FFF'
  },
  floatingLabelContainer: {
    position: 'absolute',
    top: -10,
    left: 12,
    backgroundColor: '#FFF',
    paddingHorizontal: 4,
    zIndex: 1,
  },
  floatingLabel: {
    fontSize: 12,
    color: '#A0AEC0',
    fontWeight: '500'
  },
  textInput: {
    fontSize: 16,
    color: '#1A202C',
    fontWeight: '600',
    height: '100%'
  },
  simpleInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 15,
    color: '#1A202C',
    marginBottom: 16,
    backgroundColor: '#FFF',
    fontWeight: '500'
  },
  dropdownInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 16,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dropdownText: {
    fontSize: 15,
    color: '#1A202C',
    fontWeight: '500'
  },
  inputLabel: {
    fontSize: 12,
    color: '#A0AEC0',
    fontWeight: '500',
    marginBottom: 8,
    marginLeft: 4
  },
  uploadDocBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 16,
    backgroundColor: '#FAFCFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadDocText: {
    fontSize: 15,
    color: '#718096',
    fontWeight: '500'
  },
  addDocBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignSelf: 'flex-start'
  },
  addDocBtnText: {
    fontSize: 15,
    color: '#3182CE',
    fontWeight: '600'
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 20,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    fontSize: 24,
    textAlign: 'center',
    color: '#1A202C',
    fontWeight: '700',
    backgroundColor: '#FFF'
  },
  otpBoxError: {
    borderColor: '#E53E3E',
    color: '#E53E3E'
  },
  otpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  resendText: {
    color: '#718096',
    fontWeight: '600',
    fontSize: 14,
    textDecorationLine: 'underline'
  },
  errorText: {
    color: '#E53E3E',
    fontWeight: '600',
    fontSize: 14
  },
  timerText: {
    color: COLORS.primaryDeep || '#4A148C',
    fontWeight: '600',
    fontSize: 14
  },
  nextBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  nextBtnRowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  roundNextBtn: {
    backgroundColor: COLORS.primaryDeep || '#4A148C',
    width: 70,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.light
  },
  skipText: {
    color: '#718096',
    fontWeight: '600',
    fontSize: 14,
  },
  progressBar: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  progressDash: {
    flex: 1,
    height: 4,
    backgroundColor: '#E2E8F0',
    marginRight: 8,
    borderRadius: 2,
  },
  progressDashActive: {
    backgroundColor: COLORS.primary || '#E91E63',
  },
  pictureUploadContainer: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },
  pictureCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  photoUploaded: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#CBD5E0',
  },
  editPicBtn: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#FFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.light,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 14,
    color: '#A0AEC0',
    fontWeight: '600',
    marginBottom: 20,
  },
  modalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC'
  },
  modalActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A202C',
    marginLeft: 16,
  },
  modalCloseBtn: {
    marginTop: 20,
    height: 56,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
  },
  dummyIllustrationShape: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5
  },
  dummyIllustrationText: {
    color: '#6B7280',
    fontWeight: '600'
  },
  illustrationImage: {
    width: width * 0.8,
    height: width * 0.8,
  },
  stepIllustrationImage: {
    width: 180,
    height: 180,
  },
  scanModalContainer: {
    flex: 1,
    backgroundColor: '#1A202C',
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  scanBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  scanTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  scannerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  scanInstruction: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 20,
  },
  scanFrameArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: width * 0.85,
    height: (width * 0.85) * 0.63, 
    borderWidth: 2,
    borderColor: '#FFF',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  scannedImageSim: {
    backgroundColor: '#E2E8F0',
    borderColor: 'transparent'
  },
  scanControls: {
    flexDirection: 'row',
    marginTop: 60,
    width: 120,
    justifyContent: 'space-between',
  },
  scanIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanConfirmControls: {
    width: '100%',
    marginTop: 'auto',
    gap: 16,
  },
  discardBtn: {
    backgroundColor: '#E2E8F0',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  discardBtnText: {
    color: '#1A202C',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: COLORS.primaryDeep || '#4A148C',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  }
});

export default SignupScreen;
