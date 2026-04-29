import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions, Image, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { Mail, Lock, LogIn, ChevronLeft, ArrowRight } from 'lucide-react-native';
import { COLORS, SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';
import { initDB, saveUserLocally, getLocalUser } from '../services/LocalDB';
import * as Network from 'expo-network';

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
          Alert.alert('Login Failed', failMsg);
          setLoading(false);
          return;
        } catch (error) {
          console.log("Auth Error", error.message);
        }
      }

      const cachedUser = await getLocalUser(userId, password);
      if (cachedUser) {
        Alert.alert('Offline Mode', 'Logged in using cached credentials.');
        navigation.replace('Main', { user: cachedUser });
      } else {
        Alert.alert('Cannot Login', isOnline
          ? 'Cannot connect to server.'
          : 'No internet connection.');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.content}
        >
          <View style={styles.formContainer}>
            {/* TOP LOGO */}
            <View style={styles.headerGroup}>
              <Image 
                source={require('../../assets/rizo.png')} 
                style={styles.mainLogo} 
                resizeMode="contain"
              />
            </View>

            {/* INPUT FIELDS */}
            <View style={styles.inputGroup}>
              <View style={styles.inputBox}>
                <Mail color="#94A3B8" size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="User ID"
                  value={userId}
                  onChangeText={setUserId}
                  autoCapitalize="none"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.inputBox}>
                <Lock color="#94A3B8" size={20} />
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
              <Text style={styles.signupLabel}>Don't have an account? <Text style={styles.signupText}>Join Rizo</Text></Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>POWERED BY RIZO SOLUTIONS</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  safeArea: { flex: 1 },
  content: { flex: 1, padding: 30, justifyContent: 'center' },
  formContainer: { width: '100%', alignItems: 'center' },
  
  headerGroup: { alignItems: 'center', marginBottom: 50, width: '100%' },
  mainLogo: {
    width: 200,
    height: 120,
  },

  inputGroup: { width: '100%', marginBottom: 40 },
  inputBox: { 
    flexDirection: 'row', alignItems: 'center', height: 60, 
    backgroundColor: '#F9FAFB', borderRadius: 15, paddingHorizontal: 20, 
    marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' 
  },
  input: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: '700', color: '#000' },
  
  loginBtn: { 
    width: '100%', height: 60, backgroundColor: COLORS.primaryDeep || '#4A148C', borderRadius: 30, 
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium 
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  
  signupLink: { marginTop: 32, alignItems: 'center' },
  signupLabel: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  signupText: { color: COLORS.primaryDeep || '#4A148C', fontWeight: '900' },

  footer: { alignItems: 'center', paddingBottom: 20 },
  footerText: { fontSize: 10, color: '#94A3B8', fontWeight: '800', letterSpacing: 1.5 },
});

export default LoginScreen;
