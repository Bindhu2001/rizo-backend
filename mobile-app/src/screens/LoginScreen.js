import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  KeyboardAvoidingView, ActivityIndicator, Dimensions, Image, StatusBar, Platform
} from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { Mail, Lock, LogIn, ChevronLeft, ArrowRight, Eye, EyeOff } from 'lucide-react-native';
import { COLORS, SHADOWS, moderateScale, wp } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';
import { initDB, saveUserLocally, getLocalUser } from '../services/LocalDB';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../components/ThemeContext';

const DEVICE_IMEI_KEY = 'DEVICE_IMEI';

// Per-install stable identifier sent as `imei` to the server. Real IMEI is
// not accessible on modern Android/iOS, so we persist a 15-digit numeric ID
// in AsyncStorage. Survives app updates; resets if app data is cleared or
// app is uninstalled. The server registers it on first login and rejects
// any other device claiming the same user account.
const getOrCreateDeviceImei = async () => {
  let id = await AsyncStorage.getItem(DEVICE_IMEI_KEY);
  if (!id) {
    id = String(Math.floor(Math.random() * 9e14) + 1e14);
    await AsyncStorage.setItem(DEVICE_IMEI_KEY, id);
  }
  return id;
};

const { width, height } = Dimensions.get('window');
const API_URL = API_ENDPOINTS.AUTH;

const LoginScreen = ({ navigation }) => {
  const theme = useTheme();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  const handleLogin = async () => {
    if (!userId || !password) {
      showAlert('warning', 'Missing Fields', 'Please fill in both User ID and Password to login.');
      return;
    }

    setLoading(true);
    await initDB();
    try {
      const net = await Network.getNetworkStateAsync();
      const isOnline = net.isConnected;

      if (isOnline) {
        try {
          const imei = await getOrCreateDeviceImei();
          const formData = new FormData();
          formData.append('user_id', userId);
          formData.append('password', password);
          formData.append('imei', imei);

          const response = await axios.post(API_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 12000
          });

          const loginSuccess = response.data && (
            response.data.success === 1 ||
            response.data.success === true ||
            response.data.success === '1' ||
            response.data.success === 'true'
          );
          if (loginSuccess) {
            const user = response.data.data;
            if (user && user.user_id) {
              // IMEI status from login: "registered" (new device) or "verified" (matches stored).
              // Backend rejects mismatched IMEI by returning success: 0, so reaching here means OK.
              const imeiStatus = user?.imei?.status;
              console.log('[Login] success | user_id:', user.user_id, '| imei status:', imeiStatus);

              // Do NOT call get_employee_full_details here — that happens on Home page load.
              await saveUserLocally(user, password);
              navigation.replace('Main', { user });
              return;
            }
          }
          const failMsg = response.data?.message || 'Invalid credentials';
          showAlert('error', 'Login Failed', failMsg);
          setLoading(false);
          return;
        } catch (error) {
          console.log("Auth Error", error.message);
        }
      }

      const cachedUser = await getLocalUser(userId, password);
      if (cachedUser) {
        showAlert('success', 'Offline Mode', 'Logged in using cached credentials.', [
          { text: 'Continue', onPress: () => navigation.replace('Main', { user: cachedUser }) }
        ]);
      } else {
        showAlert('error', 'Cannot Login', isOnline
          ? 'Cannot connect to server. Please check your network.'
          : 'No internet connection. Offline login failed.');
      }
    } catch (error) {
      showAlert('error', 'Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.formContainer}>
            {/* TOP LOGO */}
            <View style={styles.headerGroup}>
              <View style={styles.logoBg}>
                <Image
                  source={require('../../assets/rizo.png')}
                  style={styles.mainLogo}
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* INPUT FIELDS */}
            <View style={styles.inputGroup}>
              <View style={[styles.inputBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Mail color={theme.textMuted} size={20} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="User ID"
                  value={userId}
                  onChangeText={setUserId}
                  autoCapitalize="none"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <View style={[styles.inputBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Lock color={theme.textMuted} size={20} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholderTextColor={theme.textMuted}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff color={theme.textMuted} size={20} />
                  ) : (
                    <Eye color={theme.textMuted} size={20} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* LOGIN BUTTON */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.8 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnText}>LOGIN</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.signupLink} onPress={() => navigation.navigate('Signup')}>
              <Text style={[styles.signupLabel, { color: theme.textLight }]}>Don't have an account? <Text style={styles.signupText}>Join Rizo</Text></Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.textMuted }]}>POWERED BY RIZO SOLUTIONS</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  safeArea: { flex: 1 },
  content: { flex: 1, padding: moderateScale(30), justifyContent: 'center' },
  formContainer: { width: '100%', alignItems: 'center' },

  headerGroup: { alignItems: 'center', marginBottom: moderateScale(50), width: '100%' },
  logoBg: {
    backgroundColor: 'transparent',
    paddingHorizontal: moderateScale(24),
    paddingVertical: moderateScale(16),
  },
  mainLogo: {
    width: wp(50),
    height: wp(22),
  },

  inputGroup: { width: '100%', marginBottom: moderateScale(40) },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', height: moderateScale(60),
    backgroundColor: '#F9FAFB', borderRadius: moderateScale(15), paddingHorizontal: moderateScale(20),
    marginBottom: moderateScale(16), borderWidth: 1, borderColor: '#F1F5F9'
  },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: moderateScale(16), fontWeight: '700', color: '#000' },

  loginBtn: {
    width: '100%', height: moderateScale(60), backgroundColor: COLORS.primaryDeep || '#4A148C', borderRadius: moderateScale(30),
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium
  },
  btnText: { color: '#FFF', fontSize: moderateScale(16), fontWeight: '900', letterSpacing: 2 },

  signupLink: { marginTop: moderateScale(32), alignItems: 'center' },
  signupLabel: { color: '#64748B', fontSize: moderateScale(14), fontWeight: '600' },
  signupText: { color: COLORS.primaryDeep || '#4A148C', fontWeight: '900' },

  footer: { alignItems: 'center', paddingBottom: moderateScale(20) },
  footerText: { fontSize: moderateScale(10), color: '#94A3B8', fontWeight: '800', letterSpacing: 1.5 },
});

export default LoginScreen;

