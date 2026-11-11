import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, Platform, ScrollView } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { Mail, Lock, KeyRound, ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { COLORS, SHADOWS, moderateScale, KEYBOARD_AVOID_BEHAVIOR } from '../components/Theme';
import KeyboardSafeView from '../components/KeyboardSafeView';
import { API_ENDPOINTS } from '../constants/Config';
import { useTheme } from '../components/ThemeContext';

// Forgot password, all inside the app (no link to open):
//  1. User ID or email -> the server emails a 6-digit code to the account's registered email (forgot_password_code)
//  2. the code + a new password -> the password changes for the app and the web login (forgot_password_reset)
// Works for every company. New password: the same checks, list and messages as the website's reset page
// (rizo-revamp lib/passwordRules.ts STRONG_PASSWORD_CHECKS + app/(auth)/forgot-password/reset/page.tsx).

const PASSWORD_MAX_LENGTH = 20;
const STRONG_PASSWORD_CHECKS = [
  { key: 'length', label: '8–20 characters', test: (p) => p.length >= 8 && p.length <= PASSWORD_MAX_LENGTH },
  { key: 'letter', label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { key: 'digit', label: 'A number', test: (p) => /\d/.test(p) },
  { key: 'symbol', label: 'A symbol (e.g. @ # $ !)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];
const strongEnough = (p) => STRONG_PASSWORD_CHECKS.every((c) => c.test(p));
const ok = (res) => res?.data?.success === 1 || res?.data?.success === true || res?.data?.success === '1';
const NETWORK = 'Could not reach the server. Please check your internet connection and try again.';
// The server answered with an error: its own message (or a plain one); no answer at all: the network message
const serverMessage = (e) => (e?.response
  ? (e.response.data?.message || e.response.data?.error || 'Something went wrong on the server. Please try again in a few minutes.')
  : NETWORK);

const ForgotPasswordScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [login, setLogin] = useState(String(route?.params?.login || '').trim());
  const [requestId, setRequestId] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds until "Resend code" works
  const [tried, setTried] = useState(false); // Reset tapped at least once
  const [expiresAt, setExpiresAt] = useState(0); // when the code stops working (the server's 5 minutes)
  const [now, setNow] = useState(Date.now());

  // Live "Code expires in 9:41" while the code step is open
  useEffect(() => {
    if (step !== 2 || !expiresAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, expiresAt]);
  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const expired = step === 2 && !!expiresAt && secondsLeft === 0;
  const timeLeft = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const [alertCfg, setAlertCfg] = useState(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async () => {
    const value = login.trim();
    if (!value) { showAlert('warning', 'User ID or Email', 'Please enter your User ID or email.'); return; }
    setBusy(true);
    try {
      const res = await axios.post(API_ENDPOINTS.FORGOT_PASSWORD_CODE, { login: value }, { timeout: 45000 });
      if (ok(res)) {
        setRequestId(res.data.data?.request_id || '');
        setEmailHint(res.data.data?.email_hint || '');
        setWait(Number(res.data.data?.resend_after) || 60);
        setExpiresAt(Date.now() + (Number(res.data.data?.expires_in) || 300) * 1000);
        setCode('');
        setTried(false);
        setStep(2);
      } else {
        showAlert('error', 'Could not send code', res?.data?.message || 'Please try again.');
      }
    } catch (e) {
      showAlert('error', 'Could not send code', serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Like the website: unmet rules turn red, and Confirm Password shows its message, once Reset was tapped
  const confirmError = !tried ? null
    : !confirm ? 'Please confirm your new password'
      : password !== confirm ? 'New Password and Confirm Password are not matching' : null;
  const codeError = tried && !/^\d{6}$/.test(code.trim()) ? 'Please enter the 6-digit code from the email' : null;

  const resetPassword = async () => {
    setTried(true);
    if (expired) { showAlert('warning', 'Code expired', 'This code has expired. Please tap Resend code for a new one.'); return; }
    if (!/^\d{6}$/.test(code.trim()) || !strongEnough(password) || !confirm || password !== confirm) return;
    setBusy(true);
    try {
      const res = await axios.post(API_ENDPOINTS.FORGOT_PASSWORD_RESET, {
        request_id: requestId, code: code.trim(), new_password: password, confirm_password: confirm,
      }, { timeout: 30000 });
      if (ok(res)) {
        const userId = res.data.data?.user_id || '';
        showAlert('success', 'Password changed', 'Please log in with your new password.', [
          // Back to the Login page underneath (React Navigation 7: navigate would open a second one)
          { text: 'Login', onPress: () => (navigation.popTo ? navigation.popTo('Login', { prefillUserId: userId }) : navigation.navigate('Login', { prefillUserId: userId })) },
        ]);
      } else {
        showAlert('error', 'Could not change password', res?.data?.message || 'Please try again.');
      }
    } catch (e) {
      showAlert('error', 'Could not change password', serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const box = [s.inputBox, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }];
  const input = [s.input, { color: theme.text }];

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBarStyle} backgroundColor={theme.bg} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => (step === 2 ? setStep(1) : navigation.goBack())} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Back">
            <ChevronLeft color={theme.text} size={28} />
          </TouchableOpacity>
        </View>
        <KeyboardSafeView behavior={KEYBOARD_AVOID_BEHAVIOR} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
            <View style={[s.iconWrap, { backgroundColor: theme.isDark ? '#2E1065' : '#F3E8FF' }]}>
              <KeyRound color={theme.isDark ? '#C4B5FD' : COLORS.primaryDeep} size={34} />
            </View>
            <Text style={[s.title, { color: theme.text }]}>Forgot password</Text>

            {step === 1 ? (
              <>
                <Text style={[s.sub, { color: theme.textLight }]}>Enter your User ID or email. We'll email a 6-digit code to the email registered on your account.</Text>
                <View style={box}>
                  <Mail color={theme.textMuted} size={20} />
                  <TextInput
                    style={input}
                    placeholder="User ID or Email"
                    value={login}
                    onChangeText={setLogin}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    returnKeyType="send"
                    onSubmitEditing={sendCode}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                <TouchableOpacity style={[s.btn, busy && { opacity: 0.8 }]} onPress={sendCode} disabled={busy}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>SEND CODE</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[s.sub, { color: theme.textLight }]}>
                  Enter the code we sent to <Text style={{ fontWeight: '800', color: theme.text }}>{emailHint || 'your email'}</Text>, then choose a new password.
                </Text>
                <View style={box}>
                  <KeyRound color={theme.textMuted} size={20} />
                  <TextInput
                    style={[input, !!code && s.codeInput]}
                    placeholder="6-digit code"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                {!!codeError && <Text style={s.fieldError}>{codeError}</Text>}
                {!!expiresAt && (
                  <Text style={[s.expiry, { color: expired || secondsLeft < 60 ? '#DC2626' : theme.textMuted }]}>
                    {expired ? 'Code expired — tap Resend code' : `Code expires in ${timeLeft}`}
                  </Text>
                )}
                <View style={box}>
                  <Lock color={theme.textMuted} size={20} />
                  <TextInput
                    ref={passwordRef}
                    style={input}
                    placeholder="New Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    maxLength={20}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => confirmRef.current?.focus()}
                    placeholderTextColor={theme.textMuted}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff color={theme.textMuted} size={20} /> : <Eye color={theme.textMuted} size={20} />}
                  </TouchableOpacity>
                </View>
                {/* The website's list: ✓ green when met, ✕ red once Reset was tapped, ○ grey before */}
                <View style={s.checks}>
                  {STRONG_PASSWORD_CHECKS.map((c) => {
                    const met = c.test(password);
                    const failed = !met && tried;
                    return (
                      <Text key={c.key} style={[s.checkItem, { color: met ? '#16A34A' : failed ? '#DC2626' : theme.textMuted }]}>
                        {met ? '✓' : failed ? '✕' : '○'} {c.label}
                      </Text>
                    );
                  })}
                </View>
                <View style={box}>
                  <Lock color={theme.textMuted} size={20} />
                  <TextInput
                    ref={confirmRef}
                    style={input}
                    placeholder="Confirm Password"
                    value={confirm}
                    onChangeText={setConfirm}
                    secureTextEntry={!showPassword}
                    maxLength={20}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={resetPassword}
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                {!!confirmError && <Text style={s.fieldError}>{confirmError}</Text>}
                <TouchableOpacity style={[s.btn, busy && { opacity: 0.8 }]} onPress={resetPassword} disabled={busy}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>RESET PASSWORD</Text>}
                </TouchableOpacity>
                <View style={s.linksRow}>
                  <TouchableOpacity onPress={sendCode} disabled={busy || wait > 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[s.link, (busy || wait > 0) && { color: theme.textMuted }]}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStep(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.link}>Change User ID / email</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardSafeView>
      </SafeAreaView>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: moderateScale(12), paddingTop: moderateScale(6), height: moderateScale(48), justifyContent: 'center' },
  backBtn: { width: moderateScale(40), height: moderateScale(40), justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: moderateScale(30), paddingTop: moderateScale(10), paddingBottom: moderateScale(40) },
  iconWrap: { width: moderateScale(72), height: moderateScale(72), borderRadius: moderateScale(36), alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: moderateScale(18) },
  title: { fontSize: moderateScale(24), fontWeight: '900', textAlign: 'center', marginBottom: moderateScale(10) },
  sub: { fontSize: moderateScale(14), lineHeight: moderateScale(21), textAlign: 'center', marginBottom: moderateScale(28), fontWeight: '500' },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', height: moderateScale(60),
    borderRadius: moderateScale(15), paddingHorizontal: moderateScale(20), marginBottom: moderateScale(16), borderWidth: 1,
  },
  input: { flex: 1, marginLeft: moderateScale(12), fontSize: moderateScale(16), fontWeight: '700' },
  codeInput: { letterSpacing: 6 },
  checks: { marginTop: -moderateScale(8), marginBottom: moderateScale(16), marginLeft: moderateScale(6) },
  checkItem: { fontSize: moderateScale(12.5), lineHeight: moderateScale(19), fontWeight: '600' },
  expiry: { fontSize: moderateScale(12.5), fontWeight: '700', marginTop: -moderateScale(8), marginBottom: moderateScale(14), marginLeft: moderateScale(6) },
  fieldError: { color: '#DC2626', fontSize: moderateScale(12.5), fontWeight: '600', marginTop: -moderateScale(8), marginBottom: moderateScale(14), marginLeft: moderateScale(6) },
  btn: {
    width: '100%', height: moderateScale(60), backgroundColor: COLORS.primaryDeep || '#4A148C', borderRadius: moderateScale(30),
    justifyContent: 'center', alignItems: 'center', marginTop: moderateScale(8), ...SHADOWS.medium,
  },
  btnText: { color: '#FFF', fontSize: moderateScale(16), fontWeight: '900', letterSpacing: 2 },
  linksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: moderateScale(24), paddingHorizontal: moderateScale(4) },
  link: { color: COLORS.primaryDeep || '#4A148C', fontSize: moderateScale(14), fontWeight: '800', textDecorationLine: 'none' },
});

export default ForgotPasswordScreen;
