import React, { useState, useEffect, useRef, useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, BackHandler, Switch, Linking,
  Platform, Modal,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { Text, TextInput } from '../components/AppText';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, LogOut, ChevronLeft, ChevronRight,
  MapPin, CreditCard, FileText, Moon, Sun, BellRing, Megaphone,
  Lock, Eye, EyeOff, ShieldCheck, Trash2, Mail, Briefcase, CalendarCheck, Users, Landmark, X,
  Cake, VenusAndMars, Heart, Droplet, Phone, UserCheck, HeartHandshake, IdCard, Building2, AtSign, Smartphone,
  CalendarDays, BadgeCheck, Hourglass, CalendarX, Clock, Building, Award, Timer, ClipboardList, UserRoundCog,
  GraduationCap, House, Map as MapIcon, Hash, Globe, KeyRound, Wallet, PiggyBank, Stethoscope, Percent, Plane,
  Accessibility, TrainFront, Ear,
} from 'lucide-react-native';
import axios from 'axios';
import { COLORS, SHADOWS, moderateScale, KEYBOARD_AVOID_BEHAVIOR } from '../components/Theme';
import KeyboardSafeView from '../components/KeyboardSafeView';
import { clearUserSession, getLocalUser } from '../services/LocalDB';
import { syncEmployeeDetails } from '../services/EmployeeSync';
import NotificationManager from '../services/NotificationManager';
import { isRemindersEnabled, setRemindersEnabled } from '../services/ShiftReminders';
import { AnnouncementsApi, DocumentsApi } from '../services/RevampApi';
import { API_ENDPOINTS, IMAGE_ROOT } from '../constants/Config';
import { usePhotoSource, retryPhoto } from '../services/photoSource';
import { useTheme } from '../components/ThemeContext';

const PLACEHOLDER_AVATAR = require('../../assets/signup/placeholdermen.jpeg');

const PURPLE = '#4A148C';

// ─── Small read-only field row ────────────────────────────────────────────────
const yesNo = (v) => (String(v).toUpperCase() === 'Y' || v === true ? 'Yes' : 'No');
const dash = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '—');

// Tinted icon colours (light background, icon colour); dark theme uses the icon colour at low opacity
const TINTS = {
  purple: ['#F3E8FF', '#7C3AED'], blue: ['#EFF6FF', '#2563EB'], green: ['#ECFDF5', '#059669'],
  orange: ['#FFF7ED', '#EA580C'], pink: ['#FDF2F8', '#DB2777'], teal: ['#F0FDFA', '#0D9488'],
  amber: ['#FFFBEB', '#D97706'], red: ['#FEF2F2', '#DC2626'], indigo: ['#EEF2FF', '#4F46E5'],
};
const tintOf = (tint, theme) => {
  const [bg, fg] = TINTS[tint] || TINTS.purple;
  return { bg: theme.isDark ? `${fg}26` : bg, fg };
};
const isBlank = (v) => v == null || String(v).trim() === '' || String(v).trim() === '—' || String(v).trim() === '-';

// One detail: a tinted icon, the label, then the value ("Not added" when empty). chip: a Yes / No pill instead.
const Field = ({ label, value, icon: Icon, tint = 'purple', chip, last }) => {
  const theme = useTheme();
  const t = tintOf(tint, theme);
  const blank = isBlank(value);
  const yes = String(value) === 'Yes';
  return (
    <View style={[s.fieldRow, !last && { borderBottomColor: theme.divider, borderBottomWidth: 1 }]}>
      {Icon ? <View style={[s.fieldIcon, { backgroundColor: t.bg }]}><Icon color={t.fg} size={18} /></View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
        {chip ? (
          <View style={[s.chip, { backgroundColor: yes ? (theme.isDark ? '#05966933' : '#ECFDF5') : theme.cardSoft }]}>
            <Text style={[s.chipText, { color: yes ? '#059669' : theme.textMuted }]}>{yes ? 'Yes' : 'No'}</Text>
          </View>
        ) : (
          <Text style={[s.fieldValue, { color: blank ? theme.textMuted : theme.text }, blank && s.fieldBlank]} selectable={!blank}>
            {blank ? 'Not added' : String(value).trim()}
          </Text>
        )}
      </View>
    </View>
  );
};

// A titled card of details (the last row has no divider)
const Group = ({ title, children }) => {
  const theme = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={s.group}>
      {!!title && <Text style={[s.groupTitle, { color: theme.textMuted }]}>{title}</Text>}
      <View style={[s.fieldCard, { backgroundColor: theme.card }]}>
        {items.map((c, i) => React.cloneElement(c, { last: i === items.length - 1 }))}
      </View>
    </View>
  );
};

// A list in Other Details (education, experience, family, documents): a titled card, each entry with an icon,
// a bold title, muted lines and an optional action (a document's View)
const ListGroup = ({ title, rows, empty, renderItem, icon: Icon, tint = 'purple' }) => {
  const theme = useTheme();
  const t = tintOf(tint, theme);
  return (
    <View style={s.group}>
      <Text style={[s.groupTitle, { color: theme.textMuted }]}>{title}{rows.length ? `  ·  ${rows.length}` : ''}</Text>
      <View style={[s.fieldCard, { backgroundColor: theme.card }]}>
        {rows.length === 0 ? (
          <View style={s.listEmptyRow}>
            {Icon ? <View style={[s.fieldIcon, { backgroundColor: theme.cardSoft }]}><Icon color={theme.textMuted} size={18} /></View> : null}
            <Text style={[s.listEmpty, { color: theme.textMuted }]}>{empty}</Text>
          </View>
        ) : rows.map((row, i) => {
          const { heading, lines, action } = renderItem(row);
          return (
            <View key={i} style={[s.listItem, i < rows.length - 1 && { borderBottomColor: theme.divider, borderBottomWidth: 1 }]}>
              {Icon ? <View style={[s.fieldIcon, { backgroundColor: t.bg }]}><Icon color={t.fg} size={18} /></View> : null}
              <View style={{ flex: 1 }}>
                <Text style={[s.listHeading, { color: theme.text }]}>{heading}</Text>
                {lines.filter(Boolean).map((line, j) => (
                  <Text key={j} style={[s.listLine, { color: theme.textLight }]}>{line}</Text>
                ))}
              </View>
              {action && (
                <TouchableOpacity onPress={action.onPress} disabled={action.busy} style={[s.listAction, { backgroundColor: theme.isDark ? '#7C3AED26' : '#F3E8FF' }]} accessibilityLabel={action.label}>
                  {action.busy ? <ActivityIndicator size="small" color={PURPLE} /> : (
                    <>
                      <Eye color={theme.isDark ? '#C4B5FD' : PURPLE} size={15} />
                      <Text style={[s.listActionText, { color: theme.isDark ? '#C4B5FD' : PURPLE }]}>{action.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const SectionItem = ({ iconBg, icon, title, subtitle, onPress, last }) => {
  const theme = useTheme();
  return (
    <>
      <TouchableOpacity style={s.sectionRow} onPress={onPress} activeOpacity={0.7}>
        <View style={[s.sectionIconBox, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={s.sectionText}>
          <Text style={[s.sectionTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[s.sectionSub, { color: theme.textLight }]}>{subtitle}</Text>
        </View>
        <ChevronRight color={theme.textMuted} size={20} />
      </TouchableOpacity>
      {!last && <View style={[s.divider, { backgroundColor: theme.divider }]} />}
    </>
  );
};

const SectionHeader = ({ title, onBack, theme }) => (
  <View style={s.header}>
    <TouchableOpacity onPress={onBack} style={s.backBtn}>
      <ChevronLeft color={theme?.text || COLORS.text} size={28} />
    </TouchableOpacity>
    <Text style={[s.headerTitle, { color: theme?.text || COLORS.text }]}>{title}</Text>
    <View style={{ width: 44 }} />
  </View>
);

// ─── ProfileScreen ────────────────────────────────────────────────────────────
const ProfileScreen = ({ navigation, route }) => {
  const theme = useTheme();
  // Opened as the Profile tab, the app's tab bar already sits over the phone's navigation bar: a bottom safe
  // edge here added that space a second time (a blank strip above the tab bar). Opened as a page of its own
  // (no tab bar), it still needs the bottom edge.
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const safeEdges = inTabs ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom'];
  const [user, setUser] = useState(route?.params?.user);
  // The profile photo path that failed to load → the placeholder instead of a blank circle
  const [failedPic, setFailedPic] = useState(null);
  // A website photo (/uploads/...) loads with the app's login token (services/photoSource.js)
  const mainPhoto = usePhotoSource(user?.profile_pic);
  const [remindersOn, setRemindersOn] = useState(true);
  useEffect(() => { isRemindersEnabled().then(setRemindersOn); }, []);
  const toggleReminders = (value) => {
    setRemindersOn(value);
    setRemindersEnabled(value, user?.user_id);
  };

  // Unread announcements for the Support row — refreshed whenever Profile is shown
  const [annUnread, setAnnUnread] = useState(0);
  useEffect(() => {
    const refreshUnread = () => {
      AnnouncementsApi.list().then((res) => setAnnUnread(Number(res?.unread) || 0)).catch(() => {});
    };
    refreshUnread();
    return navigation.addListener('focus', refreshUnread);
  }, [navigation]);
  const [section, setSection] = useState(null);
  const [alertCfg, setAlertCfg] = useState(null);
  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  // Fetched section data
  const [personal, setPersonal] = useState(null);
  const personalPhoto = usePhotoSource(personal?.profile_pic);
  const [address, setAddress] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [bank, setBank] = useState(null);

  // Other Details > Documents: the one being opened, and an image document shown in the app
  const [docBusy, setDocBusy] = useState(null);
  const [docPreview, setDocPreview] = useState(null); // { uri, title }
  const DOC_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  // A website file (/uploads/...) is downloaded with the login, then an image is shown here and anything else
  // (PDF, Word...) opens in a viewer app. A full link or an old-server path (public) opens directly.
  const openDocument = async (doc) => {
    const file = String(doc.files || '').trim();
    if (!file) return;
    const title = [doc.document_type || 'Document', doc.document_number].filter(Boolean).join(' · ');
    const ext = ((file.split('?')[0].match(/\.([A-Za-z0-9]+)$/) || [])[1] || '').toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
    try {
      if (file.startsWith('/uploads/')) {
        setDocBusy(doc.id);
        const uri = await DocumentsApi.download(doc.id, `document_${doc.id}${ext ? `.${ext}` : ''}`);
        if (isImage) { setDocPreview({ uri, title }); return; }
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: DOC_TYPES[ext], UTI: ext === 'pdf' ? '.pdf' : undefined, dialogTitle: title });
        } else {
          showAlert('error', 'Document', 'No app on this phone can open this file.');
        }
        return;
      }
      const url = /^https?:\/\//i.test(file) ? file : `${IMAGE_ROOT}/${file.replace(/^\/+/, '')}`;
      if (isImage) { setDocPreview({ uri: url, title }); return; }
      await Linking.openURL(url);
    } catch (e) {
      showAlert('error', 'Document', 'Could not open this document. Please try again.');
    } finally {
      setDocBusy(null);
    }
  };
  const [busy, setBusy] = useState(false);

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const confirmPwdRef = useRef(null);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
      return;
    }
    (async () => {
      try {
        const dbUser = await getLocalUser(user.user_id);
        if (dbUser) setUser(dbUser);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;
    const refresh = () => {
      syncEmployeeDetails(user, navigation).then((updated) => { if (updated) setUser(updated); });
    };
    refresh();
    const unsub = navigation.addListener?.('focus', refresh);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [navigation, user?.user_id]);

  // Android hardware back: if a section is open, return to the menu;
  // otherwise let the system/navigator handle it (closes app or pops stack).
  useEffect(() => {
    const onBack = () => {
      if (section) { setSection(null); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [section, navigation]);

  if (!user?.user_id) return null;

  const fetchSection = async (endpoint, setter, current) => {
    if (current) return;
    setBusy(true);
    try {
      const res = await axios.post(endpoint, { user_id: user.user_id });
      const ok = res.data?.success === 1 || res.data?.success === true || res.data?.success === '1';
      if (ok) {
        setter(res.data.data || {});
      } else {
        // No data on server yet — show empty fields rather than an error.
        setter({});
      }
    } catch (e) {
      console.log('Profile section fetch error', e?.response?.status, e?.message);
      setter({});
      showAlert('error', 'Could Not Load', 'Failed to load these details. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const openSection = (key) => {
    setSection(key);
    // Official, Company, Policy and Other Details all come with the personal details (one call)
    if (['personal', 'official', 'company', 'policy', 'otherInfo'].includes(key)) fetchSection(API_ENDPOINTS.GET_EMPLOYEE_PERSONAL, setPersonal, personal);
    if (key === 'address') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_ADDRESS, setAddress, address);
    if (key === 'kyc') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_DOCUMENTS, setDocuments, documents);
    if (key === 'other') fetchSection(API_ENDPOINTS.GET_EMPLOYEE_BANK, setBank, bank);
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      showAlert('error', 'Validation', 'Please enter a new password.');
      return;
    }
    if (!confirmPassword.trim()) {
      showAlert('error', 'Validation', 'Please confirm your password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('error', 'Mismatch', 'New password and confirm password do not match.');
      return;
    }
    setResetLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.RESET_PASSWORD, {
        user_id: user.user_id,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      const ok = res.data?.success === 1 || res.data?.success === true || res.data?.success === '1';
      if (ok) {
        showAlert('success', 'Password Reset', 'Your password has been reset successfully. You will be logged out.', [
          {
            text: 'OK', onPress: async () => {
              await NotificationManager.unregisterToken(user.user_id);
              await clearUserSession();
              navigation.replace('Login');
            }
          },
        ]);
      } else {
        showAlert('error', 'Reset Failed', res.data?.message || 'Failed to reset password. Please try again.');
      }
    } catch (e) {
      showAlert('error', 'Error', 'Could not reset password. Please check your connection and try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogout = () => {
    showAlert('warning', 'Sign Out', 'Are you sure you want to sign out from your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await NotificationManager.unregisterToken(user?.user_id); await clearUserSession(); navigation.replace('Login'); } },
    ]);
  };

  const getAvatarSource = (customPic) => {
    const pic = customPic || user.profile_pic;
    if (!pic || pic === failedPic) return PLACEHOLDER_AVATAR; // none, or it failed to load (e.g. deleted on the server)
    // The Personal Details photo (customPic) or the main one — website photos come with the login token
    const source = customPic ? personalPhoto : mainPhoto;
    return source || PLACEHOLDER_AVATAR;
  };

  // ── Section view wrapper ────────────────────────────────────────────────────
  const renderSectionView = (title, children) => (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={safeEdges}>
      <SectionHeader title={title} onBack={() => setSection(null)} theme={theme} />
      {busy ? (
        <View style={s.loaderWrap}><ActivityIndicator size="large" color={PURPLE} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false}>
          {children}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );

  // ── PERSONAL DETAILS ────────────────────────────────────────────────────────
  if (section === 'personal') {
    const d = personal || {};
    const jobLine = [d.designation || user.designation, d.employee_id || user.user_id].filter((v) => !isBlank(v)).join('  ·  ');
    return renderSectionView('Personal Details', (
      <>
        {/* Photo, name and ID on top, like a profile card */}
        <View style={[s.hero, { backgroundColor: theme.card }]}>
          <View style={[s.heroRing, { borderColor: theme.isDark ? '#7C3AED66' : '#E9D5FF' }]}>
            <Image source={getAvatarSource(d.profile_pic)} onError={() => { const pic = d.profile_pic || user.profile_pic; retryPhoto(d.profile_pic ? personalPhoto : mainPhoto).then((again) => { if (!again) setFailedPic(pic); }); }} style={s.heroAvatar} />
          </View>
          <Text style={[s.heroName, { color: theme.text }]}>{isBlank(d.name) ? (user.employee_name || user.name || '') : d.name}</Text>
          {!!jobLine && <Text style={[s.heroSub, { color: theme.textMuted }]}>{jobLine}</Text>}
        </View>
        <Group title="Basic Info">
          <Field icon={User} tint="purple" label="Name" value={dash(d.name)} />
          <Field icon={Cake} tint="pink" label="Date of Birth" value={dash(d.date_of_birth)} />
          <Field icon={VenusAndMars} tint="indigo" label="Gender" value={dash(d.gender)} />
          <Field icon={Heart} tint="red" label="Marital Status" value={dash(d.maritual_status)} />
          <Field icon={Droplet} tint="red" label="Blood Group" value={dash(d.blood)} />
        </Group>
        <Group title="Contact">
          <Field icon={Mail} tint="blue" label="Email Address" value={dash(d.email)} />
          <Field icon={Phone} tint="green" label="Mobile Number" value={dash(d.mobile_number)} />
        </Group>
        <Group title="Guardian">
          <Field icon={UserCheck} tint="teal" label="Guardian Name" value={dash(d.guradian || d.guardian)} />
          <Field icon={HeartHandshake} tint="teal" label="Relation" value={dash(d.relation_guardian)} />
        </Group>
        {/* Employee ID, designation and department are in Company Details */}
      </>
    ));
  }

  // ── OFFICIAL DETAILS (set by HR on the website) ─────────────────────────────
  if (section === 'official') {
    const d = personal || {};
    return renderSectionView('Official Details', (
      <Group title="Given by your company">
        <Field icon={AtSign} tint="blue" label="Official Email" value={dash(d.official_email)} />
        <Field icon={Smartphone} tint="green" label="Official Mobile" value={dash(d.official_mobile)} />
      </Group>
    ));
  }

  // ── COMPANY DETAILS ─────────────────────────────────────────────────────────
  if (section === 'company') {
    const c = (personal && personal.company) || {};
    return renderSectionView('Company Details', (
      <>
        <Group title="Employment">
          <Field icon={CalendarDays} tint="green" label="Joining Date" value={dash(c.joining_date || user.joining_date)} />
          <Field icon={IdCard} tint="purple" label="Employee ID" value={dash(c.employee_id || user.user_id)} />
          <Field icon={BadgeCheck} tint="blue" label="Employment Type" value={dash(c.employment_type)} />
          {/* Like the website: probation days only for a Probation hire, the end date only for a Contract one */}
          {c.employment_type === 'Probation' ? <Field icon={Hourglass} tint="amber" label="Probation Period (days)" value={dash(c.probation_days)} /> : null}
          {c.employment_type === 'Contract' ? <Field icon={CalendarX} tint="red" label="Contract End Date" value={dash(c.contract_end_date)} /> : null}
          <Field icon={Clock} tint="orange" label="Notice Period" value={dash(c.notice_period)} />
        </Group>
        <Group title="Role">
          <Field icon={Building} tint="teal" label="Branch" value={dash(c.branch)} />
          <Field icon={Building2} tint="amber" label="Department" value={dash(c.department || user.department)} />
          <Field icon={Briefcase} tint="orange" label="Designation" value={dash(c.designation || user.designation)} />
          <Field icon={Award} tint="pink" label="Grade" value={dash(c.grade)} />
        </Group>
      </>
    ));
  }

  // ── POLICY DETAILS ──────────────────────────────────────────────────────────
  if (section === 'policy') {
    const p = (personal && personal.policy) || {};
    return renderSectionView('Policy Details', (
      <Group title="Your policies">
        <Field icon={Timer} tint="blue" label="Shift Policy" value={dash(p.shift)} />
        <Field icon={CalendarCheck} tint="green" label="Holiday Group" value={dash(p.holiday_group)} />
        <Field icon={ClipboardList} tint="purple" label="Leave Policy Group" value={dash(p.leave_policy_group)} />
        <Field icon={UserRoundCog} tint="orange" label="Reporting Manager" value={dash(p.reporting_manager)} />
      </Group>
    ));
  }

  // ── OTHER DETAILS (education, experience, family, documents — the website's Other Details tab) ──
  if (section === 'otherInfo') {
    const d = personal || {};
    const list = (v) => (Array.isArray(v) ? v : []);
    const has = (v) => v != null && String(v).trim() !== '';
    return renderSectionView('Other Details', (
      <>
        <ListGroup
          title="Education" icon={GraduationCap} tint="blue" rows={list(d.education)} empty="No education added"
          renderItem={(r) => ({
            heading: dash(r.course),
            lines: [r.university, [has(r.duration) && r.duration, has(r.mark) && `${r.mark}%`].filter(Boolean).join(' · ')],
          })}
        />
        <ListGroup
          title="Experience" icon={Briefcase} tint="orange" rows={list(d.experience)} empty="No experience added"
          renderItem={(r) => ({
            heading: dash(r.company),
            lines: [[r.designation, r.department].filter(has).join(' · '),
              has(r.from_date) ? `${r.from_date} to ${has(r.to_date) && !String(r.to_date).startsWith('0000') ? r.to_date : 'Present'}` : ''],
          })}
        />
        <ListGroup
          title="Family" icon={Users} tint="teal" rows={list(d.family)} empty="No family members added"
          renderItem={(r) => ({
            heading: dash(r.name),
            lines: [[r.relation, r.gender && String(r.gender).charAt(0).toUpperCase() + String(r.gender).slice(1)].filter(has).join(' · '),
              [has(r.DOB) && `DOB ${r.DOB}`, has(r.blood_group) && r.blood_group].filter(Boolean).join(' · '),
              r.contact_number,
              String(r.is_nominee).toUpperCase() === 'Y' ? 'Nominee' : ''],
          })}
        />
        {/* The website's 4th Other Details section: each document with a View when a file is attached */}
        <ListGroup
          title="Documents" icon={FileText} tint="purple" rows={list(d.documents)} empty="No documents added"
          renderItem={(r) => {
            const validFrom = has(r.valid_from) && !String(r.valid_from).startsWith('0000') ? r.valid_from : '';
            const validTill = has(r.valid_till) && !String(r.valid_till).startsWith('0000') ? r.valid_till : '';
            return {
              heading: [has(r.document_type) ? r.document_type : 'Document', has(r.document_number) && r.document_number].filter(Boolean).join(' · '),
              // non-breaking hyphens: a date never splits across two lines
              lines: [r.name, validFrom ? `Valid ${validFrom}${validTill ? ` to ${validTill}` : ''}`.replace(/-/g, '‑') : ''],
              action: has(r.files) ? { label: 'View', busy: docBusy === r.id, onPress: () => openDocument(r) } : null,
            };
          }}
        />
        {/* An image document, shown in the app */}
        <Modal visible={!!docPreview} transparent={false} animationType="fade" onRequestClose={() => setDocPreview(null)}>
          <SafeAreaView style={s.previewWrap} edges={['top', 'bottom']}>
            <View style={s.previewHead}>
              <Text style={s.previewTitle} numberOfLines={1}>{docPreview?.title}</Text>
              <TouchableOpacity onPress={() => setDocPreview(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
                <X color="#FFF" size={24} />
              </TouchableOpacity>
            </View>
            {!!docPreview && (
              <Image
                source={{ uri: docPreview.uri }}
                style={s.previewImage}
                resizeMode="contain"
                onError={() => { setDocPreview(null); showAlert('error', 'Document', 'Could not open this document. Please try again.'); }}
              />
            )}
          </SafeAreaView>
        </Modal>
      </>
    ));
  }

  // ── ADDRESS DETAILS ─────────────────────────────────────────────────────────
  if (section === 'address') {
    const d = address || {};
    return renderSectionView('Address Details', (
      <Group title="Residential address">
        <Field icon={House} tint="green" label="House / Flat Name" value={dash(d.address)} />
        <Field icon={MapPin} tint="teal" label="Address Line 2" value={dash(d.address_line2 || d.line2)} />
        <Field icon={Building} tint="blue" label="City" value={dash(d.city)} />
        <Field icon={MapIcon} tint="indigo" label="District" value={dash(d.district)} />
        <Field icon={MapIcon} tint="purple" label="State" value={dash(d.state)} />
        <Field icon={Hash} tint="amber" label="Pin Code" value={dash(d.pin)} />
        <Field icon={Globe} tint="orange" label="Country" value={dash(d.country)} />
      </Group>
    ));
  }

  // ── KYC DETAILS ─────────────────────────────────────────────────────────────
  if (section === 'kyc') {
    const d = documents || {};
    return renderSectionView('KYC Details', (
      <Group title="Identity">
        <Field icon={CreditCard} tint="purple" label="Aadhaar Number" value={dash(d.aadhar)} />
        <Field icon={FileText} tint="blue" label="PAN Number" value={dash(d.pan)} />
      </Group>
    ));
  }

  // ── BANK & STATUTORY ────────────────────────────────────────────────────────
  if (section === 'other') {
    const d = bank || {};
    return renderSectionView('Bank & Statutory', (
      <>
        <Group title="Bank">
          <Field icon={Landmark} tint="green" label="Bank Name" value={dash(d.bank_name)} />
          <Field icon={Building} tint="teal" label="Branch" value={dash(d.bank_branch)} />
          <Field icon={KeyRound} tint="amber" label="IFSC Code" value={dash(d.ifsc_code)} />
          <Field icon={Wallet} tint="purple" label="Account Number" value={dash(d.account_number)} />
        </Group>
        <Group title="PF & ESI">
          <Field icon={PiggyBank} tint="pink" label="PF Number" value={dash(d.pf)} />
          <Field icon={Hash} tint="indigo" label="UAN Number" value={dash(d.uan)} />
          <Field icon={IdCard} tint="blue" label="Previous Member ID" value={dash(d.previous_member_id)} />
          <Field icon={ShieldCheck} tint="green" label="ESI Number" value={dash(d.esi)} />
          <Field icon={Stethoscope} tint="red" label="ESI Dispensary" value={dash(d.esi_dispensary)} />
        </Group>
        <Group title="Other Registrations">
          <Field icon={BadgeCheck} tint="blue" label="WPS ID" value={dash(d.wps_code)} />
          <Field icon={ClipboardList} tint="orange" label="LWF Registration Number" value={dash(d.lwf_code)} />
          <Field icon={Percent} tint="purple" label="EPS Eligibility" value={yesNo(d.eps)} chip />
          <Field icon={Plane} tint="blue" label="International Worker" value={yesNo(d.international_worker)} chip />
        </Group>
        <Group title="Disability">
          <Field icon={Accessibility} tint="teal" label="Physically Handicapped" value={yesNo(d.physically_handicapped)} chip />
          <Field icon={TrainFront} tint="amber" label="Locomotive" value={yesNo(d.locomotive)} chip />
          <Field icon={Ear} tint="pink" label="Hearing" value={yesNo(d.hearing)} chip />
          <Field icon={Eye} tint="indigo" label="Visual" value={yesNo(d.visual)} chip />
        </Group>
      </>
    ));
  }

  // ── RESET PASSWORD ──────────────────────────────────────────────────────────
  if (section === 'resetPassword') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={safeEdges}>
        <SectionHeader title="Reset Password" onBack={() => { setSection(null); setNewPassword(''); setConfirmPassword(''); }} theme={theme} />
        <KeyboardSafeView behavior={KEYBOARD_AVOID_BEHAVIOR} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[s.fieldCard, { backgroundColor: theme.card, paddingVertical: moderateScale(20) }]}>
            <Text style={[s.pwdLabel, { color: theme.textMuted }]}>New Password</Text>
            <View style={[s.pwdInputWrap, { borderColor: theme.divider, backgroundColor: theme.bg }]}>
              <Lock color={theme.textMuted} size={18} style={{ marginRight: 8 }} />
              <TextInput
                style={[s.pwdInput, { color: theme.text }]}
                placeholder="Enter new password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showNewPwd}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmPwdRef.current?.focus()}
              />
              <TouchableOpacity onPress={() => setShowNewPwd(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {showNewPwd
                  ? <EyeOff color={theme.textMuted} size={18} />
                  : <Eye color={theme.textMuted} size={18} />}
              </TouchableOpacity>
            </View>

            <Text style={[s.pwdLabel, { color: theme.textMuted, marginTop: moderateScale(16) }]}>Confirm Password</Text>
            <View style={[s.pwdInputWrap, { borderColor: theme.divider, backgroundColor: theme.bg }]}>
              <Lock color={theme.textMuted} size={18} style={{ marginRight: 8 }} />
              <TextInput
                ref={confirmPwdRef}
                style={[s.pwdInput, { color: theme.text }]}
                placeholder="Confirm new password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showConfirmPwd}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleResetPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPwd(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {showConfirmPwd
                  ? <EyeOff color={theme.textMuted} size={18} />
                  : <Eye color={theme.textMuted} size={18} />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.resetBtn, resetLoading && { opacity: 0.7 }]}
              onPress={handleResetPassword}
              disabled={resetLoading}
              activeOpacity={0.85}
            >
              {resetLoading
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={s.resetBtnText}>Reset Password</Text>}
            </TouchableOpacity>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
        </KeyboardSafeView>
        <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      </SafeAreaView>
    );
  }

  // ── MAIN PROFILE VIEW ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={safeEdges}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <View style={[s.profileCard, { backgroundColor: theme.card }]}>
          <View style={s.avatarWrap}>
            <Image source={getAvatarSource()} onError={() => { const pic = user.profile_pic; retryPhoto(mainPhoto).then((again) => { if (!again) setFailedPic(pic); }); }} style={s.avatarLg} />
          </View>
          <Text style={[s.profileName, { color: theme.text }]}>{user.employee_name}</Text>
          <Text style={[s.profileRole, { color: theme.textLight }]}>{user.designation}</Text>
          <View style={s.activeBadge}>
            <View style={s.activeDot} />
            <Text style={s.activeText}>ACTIVE</Text>
          </View>
          <View style={s.idRow}>
            <Text style={[s.idLabel, { color: theme.textLight }]}>Employee ID  </Text>
            <Text style={[s.idVal, { color: theme.text }]}>{user.user_id}</Text>
          </View>
          {user.joining_date ? (
            <View style={s.idRow}>
              <Text style={[s.idLabel, { color: theme.textLight }]}>Joined  </Text>
              <Text style={[s.idVal, { color: theme.text }]}>{user.joining_date}</Text>
            </View>
          ) : null}
        </View>

        <Text style={[s.cardGroupTitle, { color: theme.textLight }]}>Profile Information</Text>
        <View style={[s.menuCard, { backgroundColor: theme.card }]}>
          <SectionItem
            iconBg="#EEF2FF" icon={<User color="#4F46E5" size={20} />}
            title="Personal Details" subtitle="Name, contact & basic info"
            onPress={() => openSection('personal')}
          />
          <SectionItem
            iconBg="#ECFDF5" icon={<MapPin color="#059669" size={20} />}
            title="Address Details" subtitle="Your residential address"
            onPress={() => openSection('address')}
          />
          <SectionItem
            iconBg="#FAF5FF" icon={<FileText color="#7C3AED" size={20} />}
            title="KYC Details" subtitle="Aadhaar & PAN"
            onPress={() => openSection('kyc')}
          />
          <SectionItem
            iconBg="#EFF6FF" icon={<Mail color="#2563EB" size={20} />}
            title="Official Details" subtitle="Official email & mobile"
            onPress={() => openSection('official')}
          />
          <SectionItem
            iconBg="#FFF7ED" icon={<Briefcase color="#EA580C" size={20} />}
            title="Company Details" subtitle="Joining, branch, department & grade"
            onPress={() => openSection('company')}
          />
          <SectionItem
            iconBg="#FDF2F8" icon={<CalendarCheck color="#DB2777" size={20} />}
            title="Policy Details" subtitle="Shift, holiday, leave policy & manager"
            onPress={() => openSection('policy')}
          />
          <SectionItem
            iconBg="#F0FDFA" icon={<Users color="#0D9488" size={20} />}
            title="Other Details" subtitle="Education, experience, family & documents"
            onPress={() => openSection('otherInfo')}
          />
          <SectionItem
            iconBg="#F0FDF4" icon={<Landmark color="#16A34A" size={20} />}
            title="Bank & Statutory" subtitle="Bank, PF, ESI & worker info"
            onPress={() => openSection('other')}
            last
          />
        </View>

        <Text style={[s.cardGroupTitle, { color: theme.textLight }]}>Support</Text>
        <View style={[s.menuCard, { backgroundColor: theme.card }]}>
          <SectionItem
            iconBg="#FFF7ED" icon={<Megaphone color="#EA580C" size={20} />}
            title="Announcements"
            subtitle={annUnread > 0
              ? `${annUnread} new ${annUnread === 1 ? 'announcement' : 'announcements'}`
              : 'Company updates from HR'}
            onPress={() => navigation.navigate('Announcements', { user })}
            last
          />
        </View>

        <Text style={[s.cardGroupTitle, { color: theme.textLight }]}>Security</Text>
        <View style={[s.menuCard, { backgroundColor: theme.card }]}>
          <SectionItem
            iconBg="#FFF1F2" icon={<Lock color="#E11D48" size={20} />}
            title="Reset Password" subtitle="Change your account password"
            onPress={() => { setNewPassword(''); setConfirmPassword(''); setSection('resetPassword'); }}
            last
          />
        </View>

        <Text style={[s.cardGroupTitle, { color: theme.textLight }]}>Privacy</Text>
        <View style={[s.menuCard, { backgroundColor: theme.card }]}>
          <SectionItem
            iconBg="#EFF6FF" icon={<ShieldCheck color="#2563EB" size={20} />}
            title="Privacy Policy" subtitle="How your data is used"
            onPress={() => Linking.openURL('https://mypayrollmaster.online/rizo-privacypolicy.html')}
          />
          <SectionItem
            iconBg="#FEF2F2" icon={<Trash2 color="#DC2626" size={20} />}
            title="Delete My Account" subtitle="Request permanent account deletion"
            onPress={() => Linking.openURL('https://mypayrollmaster.online/rizo-delete-account.html')}
            last
          />
        </View>

        <Text style={[s.cardGroupTitle, { color: theme.textLight }]}>Preferences</Text>
        <View style={[s.menuCard, { backgroundColor: theme.card }]}>
          <View style={s.sectionRow}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.isDark ? '#1E293B' : '#F1F5F9' }]}>
              {theme.isDark
                ? <Moon color="#A78BFA" size={20} />
                : <Sun color="#F59E0B" size={20} />}
            </View>
            <View style={s.sectionText}>
              <Text style={[s.sectionTitle, { color: theme.text }]}>Dark Mode</Text>
              <Text style={[s.sectionSub, { color: theme.textLight }]}>{theme.isDark ? 'Dark theme enabled' : 'Light theme enabled'}</Text>
            </View>
            <Switch
              value={theme.isDark}
              onValueChange={theme.toggleTheme}
              trackColor={{ false: '#E5E7EB', true: '#7C3AED' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[s.divider, { backgroundColor: theme.divider }]} />
          <View style={s.sectionRow}>
            <View style={[s.sectionIconBox, { backgroundColor: theme.isDark ? '#1E293B' : '#F1F5F9' }]}>
              <BellRing color={theme.isDark ? '#A78BFA' : '#4A148C'} size={20} />
            </View>
            <View style={s.sectionText}>
              <Text style={[s.sectionTitle, { color: theme.text }]}>Punch Reminders</Text>
              <Text style={[s.sectionSub, { color: theme.textLight }]}>Shift start/end and short-hours alerts</Text>
            </View>
            <Switch
              value={remindersOn}
              onValueChange={toggleReminders}
              trackColor={{ false: '#E5E7EB', true: '#7C3AED' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <TouchableOpacity style={[s.logoutBtn, { backgroundColor: theme.card }]} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut color={COLORS.danger} size={20} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16), height: moderateScale(60) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', color: COLORS.text },

  scroll: { padding: moderateScale(20), paddingTop: moderateScale(12), paddingBottom: moderateScale(110) },
  formScroll: { padding: moderateScale(20), paddingTop: moderateScale(12), paddingBottom: moderateScale(110) },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  profileCard: {
    backgroundColor: '#FFF', borderRadius: moderateScale(24), padding: moderateScale(24), alignItems: 'center',
    marginBottom: moderateScale(24), ...SHADOWS.medium,
  },
  avatarWrap: { position: 'relative', marginBottom: moderateScale(16) },
  avatarLg: { width: moderateScale(100), height: moderateScale(100), borderRadius: moderateScale(50), borderWidth: 3, borderColor: '#FFF', ...SHADOWS.medium },
  profileName: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  profileRole: { fontSize: moderateScale(14), color: COLORS.textLight, fontWeight: '600', marginBottom: moderateScale(12) },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFDF5', paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(6), borderRadius: moderateScale(20), marginBottom: moderateScale(16),
  },
  activeDot: { width: moderateScale(8), height: moderateScale(8), borderRadius: 4, backgroundColor: '#10B981', marginRight: moderateScale(6) },
  activeText: { fontSize: moderateScale(11), fontWeight: '800', color: '#059669', letterSpacing: 0.5 },
  idRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  idLabel: { fontSize: moderateScale(13), color: COLORS.textLight, fontWeight: '500' },
  idVal: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.text },

  cardGroupTitle: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.textLight, letterSpacing: 0.4, marginBottom: moderateScale(10), marginLeft: 4, textTransform: 'uppercase' },

  menuCard: { backgroundColor: '#FFF', borderRadius: moderateScale(20), marginBottom: moderateScale(24), ...SHADOWS.light, overflow: 'hidden' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', padding: moderateScale(16) },
  sectionIconBox: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(14) },
  sectionText: { flex: 1 },
  sectionTitle: { fontSize: moderateScale(15), fontWeight: '700', color: COLORS.text },
  sectionSub: { fontSize: moderateScale(12), color: COLORS.textLight, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: moderateScale(16) },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', paddingVertical: moderateScale(18), borderRadius: moderateScale(20),
    borderWidth: 1, borderColor: '#FEE2E2', ...SHADOWS.light,
  },
  logoutText: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.danger, marginLeft: moderateScale(10) },

  // Password reset
  pwdLabel: { fontSize: moderateScale(12), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: moderateScale(8), marginLeft: 2 },
  pwdInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(12) },
  pwdInput: { flex: 1, fontSize: moderateScale(15), fontWeight: '500' },
  resetBtn: { backgroundColor: PURPLE, borderRadius: moderateScale(14), paddingVertical: moderateScale(16), alignItems: 'center', marginTop: moderateScale(28) },
  resetBtnText: { color: '#FFF', fontSize: moderateScale(15), fontWeight: '800' },

  // Read-only field card
  fieldCard: { backgroundColor: '#FFF', borderRadius: moderateScale(18), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(2), ...SHADOWS.light },
  group: { marginBottom: moderateScale(18) },
  groupTitle: { fontSize: moderateScale(12), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: moderateScale(8), marginLeft: moderateScale(4) },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(12), paddingVertical: moderateScale(12) },
  fieldIcon: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(12), alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: moderateScale(12), fontWeight: '600', marginBottom: 2 },
  fieldValue: { fontSize: moderateScale(15), fontWeight: '700' },
  fieldBlank: { fontSize: moderateScale(14), fontWeight: '500', fontStyle: 'italic' },
  chip: { alignSelf: 'flex-start', borderRadius: moderateScale(8), paddingHorizontal: moderateScale(10), paddingVertical: 3, marginTop: 2 },
  chipText: { fontSize: moderateScale(12.5), fontWeight: '800' },
  hero: { alignItems: 'center', borderRadius: moderateScale(18), paddingVertical: moderateScale(20), paddingHorizontal: moderateScale(16), marginBottom: moderateScale(18), ...SHADOWS.light },
  heroRing: { padding: 4, borderRadius: moderateScale(60), borderWidth: 2, marginBottom: moderateScale(12) },
  heroAvatar: { width: moderateScale(96), height: moderateScale(96), borderRadius: moderateScale(48) },
  heroName: { fontSize: moderateScale(19), fontWeight: '800', textAlign: 'center' },
  heroSub: { fontSize: moderateScale(13), fontWeight: '600', marginTop: 4, textAlign: 'center' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(12), paddingVertical: moderateScale(12) },
  listHeading: { fontSize: moderateScale(15), fontWeight: '700' },
  listLine: { fontSize: moderateScale(13), marginTop: 2, flexShrink: 1 },
  listEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(12), paddingVertical: moderateScale(12) },
  listEmpty: { fontSize: moderateScale(14), fontStyle: 'italic' },
  listAction: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: moderateScale(10), paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(8), minWidth: moderateScale(72), justifyContent: 'center' },
  listActionText: { fontSize: moderateScale(13), fontWeight: '800' },
  previewWrap: { flex: 1, backgroundColor: '#000' },
  previewHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(10), gap: moderateScale(10) },
  previewTitle: { flex: 1, color: '#FFF', fontSize: moderateScale(15), fontWeight: '700' },
  previewImage: { flex: 1, width: '100%' },
});

export default ProfileScreen;
