import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { User, Mail, Lock, UserPlus, ChevronLeft, ArrowRight } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { API_ENDPOINTS } from '../constants/Config';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const API_URL = API_ENDPOINTS.AUTH;

const SignupScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/signup`, { name, email, password }, { timeout: 8000 });
      if (response.status === 200) {
        Alert.alert('✅ Joined Successfully', 'Your account is ready! Please sign in.', [
          { text: 'LOG IN NOW', onPress: () => navigation.navigate('Login') },
        ]);
      }
    } catch (error) {
      const msg = error.response?.data || 'Signup failed. Please try again.';
      Alert.alert('❌ Signup Failed', typeof msg === 'string' ? msg : 'Error creating account.');
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.headerGroup}>
              <Text style={styles.title}>Join Rizo</Text>
              <Text style={styles.subtitle}>Create your professional account below</Text>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputBox}>
                <User color={COLORS.textLight} size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  value={name}
                  onChangeText={setName}
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.inputBox}>
                <Mail color={COLORS.textLight} size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.inputBox}>
                <Lock color={COLORS.textLight} size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Create Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.inputBox}>
                <Lock color={COLORS.textLight} size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.signupBtn, loading && { opacity: 0.8 }]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <View style={styles.btnInner}>
                  <Text style={styles.btnText}>CREATE ACCOUNT</Text>
                  <ArrowRight color="#FFF" size={20} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLabel}>Already a member? <Text style={styles.loginText}>Sign In</Text></Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  bgGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  safeArea: { flex: 1 },
  content: { flex: 1, padding: 24 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  headerGroup: { marginBottom: 32 },
  title: { fontSize: 36, fontWeight: '900', color: COLORS.text, marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 16, fontWeight: '600', color: COLORS.textLight },
  inputGroup: { marginBottom: 32 },
  inputBox: { 
    flexDirection: 'row', alignItems: 'center', height: 60, 
    backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 20, 
    marginBottom: 16, ...SHADOWS.light, borderWidth: 1, borderColor: '#F1F5F9' 
  },
  input: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '700', color: COLORS.text },
  signupBtn: { 
    height: 64, backgroundColor: COLORS.primaryDeep, borderRadius: 32, 
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium 
  },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '900', marginRight: 10, letterSpacing: 1 },
  loginLink: { marginTop: 32, alignItems: 'center', marginBottom: 40 },
  loginLabel: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
  loginText: { color: COLORS.primaryDeep, fontWeight: '900' }
});

export default SignupScreen;
