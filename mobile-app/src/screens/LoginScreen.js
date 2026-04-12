import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { Mail, Lock, LogIn, ChevronLeft, ArrowRight } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';
import { initDB, saveUserLocally, getLocalUser } from '../services/LocalDB';
import * as Network from 'expo-network';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const API_URL = API_ENDPOINTS.AUTH;

const LoginScreen = ({ navigation }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!userId || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    await initDB();
    try {
      const net = await Network.getNetworkStateAsync();
      const isOnline = net.isConnected;

      if (isOnline) {
        try {
          const formData = new FormData();
          formData.append('user_id', userId);
          formData.append('password', password);

          const response = await axios.post(API_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 12000 
          });

          if (response.data && response.data.success === 1) {
            const user = response.data.data;
            if (user && user.user_id) {
              await saveUserLocally(user, password);
              navigation.replace('Main', { user });
              return;
            }
          }
          const failMsg = response.data?.message || 'Invalid credentials';
          Alert.alert('❌ Login Failed', failMsg);
          setLoading(false);
          return;
        } catch (error) {
          console.log("Network/Server Error during login - falling back to cache.", error.message);
        }
      }

      const cachedUser = await getLocalUser(userId, password);
      if (cachedUser) {
        Alert.alert('📡 Offline Mode', 'Logged in using cached credentials.');
        navigation.replace('Main', { user: cachedUser });
      } else {
        Alert.alert('❌ Cannot Login', isOnline
          ? 'Cannot connect to server. Please try again.'
          : 'No internet connection. Please connect for your first login.');
      }
    } catch (error) {
      Alert.alert('❌ Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FDF2F8', '#F3E5F5']} style={styles.bgGradient} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft color={COLORS.text} size={28} />
          </TouchableOpacity>

          <View style={styles.formContainer}>
            <View style={styles.headerGroup}>
              <View style={styles.logoContainer}>
                <Image 
                  source={require('../../assets/rizo logo.png')} 
                  style={styles.logoImage} 
                />
              </View>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to access your dashboard</Text>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputBox}>
                <Mail color={COLORS.textLight} size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="User ID (e.g. GLET100056)"
                  value={userId}
                  onChangeText={setUserId}
                  autoCapitalize="none"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.inputBox}>
                <Lock color={COLORS.textLight} size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.8 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <View style={styles.btnInner}>
                  <Text style={styles.btnText}>LOG IN</Text>
                  <ArrowRight color="#FFF" size={20} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.signupLink} onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLabel}>Don't have an account? <Text style={styles.signupText}>Join Rizo</Text></Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  bgGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  safeArea: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 20, left: 16 },
  formContainer: { width: '100%' },
  logoContainer: { marginBottom: 30, alignItems: 'flex-start' },
  logoImage: { width: 80, height: 80, resizeMode: 'contain' },
  headerGroup: { marginBottom: 40 },
  title: { fontSize: 36, fontWeight: '900', color: COLORS.text, marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 16, fontWeight: '600', color: COLORS.textLight },
  inputGroup: { marginBottom: 32 },
  inputBox: { 
    flexDirection: 'row', alignItems: 'center', height: 60, 
    backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 20, 
    marginBottom: 16, ...SHADOWS.light, borderWidth: 1, borderColor: '#F1F5F9' 
  },
  input: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '700', color: COLORS.text },
  loginBtn: { 
    height: 64, backgroundColor: COLORS.primaryDeep, borderRadius: 32, 
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium 
  },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '900', marginRight: 10, letterSpacing: 1 },
  signupLink: { marginTop: 32, alignItems: 'center' },
  signupLabel: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
  signupText: { color: COLORS.primaryDeep, fontWeight: '900' }
});

export default LoginScreen;
