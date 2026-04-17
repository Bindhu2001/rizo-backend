import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Alert, Switch, TextInput, ActivityIndicator, Modal, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, Shield, Bell, LogOut, ChevronRight, ChevronLeft,
  Mail, Phone, Briefcase, Camera, Edit2, Check, Calendar, ChevronDown, X
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { clearUserSession, updateUserProfileLocal, getLocalUser } from '../services/LocalDB';
import { API_ENDPOINTS } from '../constants/Config';

// ─── Selection Modal (for Country) ───────────────────────────────────────────
const SelectionModal = ({ visible, options, selectedValue, onClose, onSelect, title, labelKey = 'country_name', valueKey = 'id' }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <TouchableOpacity style={sm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={sm.sheet}>
        <View style={sm.handle} />
        {title && <Text style={sm.title}>{title}</Text>}
        <ScrollView style={{ maxHeight: 300 }}>
          {options.map((opt, i) => {
            const val = opt[valueKey];
            const lab = opt[labelKey];
            return (
              <TouchableOpacity key={i} style={sm.item} onPress={() => { onSelect(opt); onClose(); }}>
                <Text style={[sm.itemText, val === selectedValue && sm.itemTextActive]}>{lab}</Text>
                {val === selectedValue && <Check color={COLORS.primaryDeep} size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </TouchableOpacity>
  </Modal>
);
const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 16 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemText: { fontSize: 15, color: '#4B5563' },
  itemTextActive: { color: '#111827', fontWeight: '600' },
});

// ─── ProfileScreen ────────────────────────────────────────────────────────────
const ProfileScreen = ({ navigation, route }) => {
  const [user, setUser] = useState(route?.params?.user);

  useEffect(() => {
    if (!user || !user.user_id) {
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    }
  }, [user, navigation]);

  if (!user || !user.user_id) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // Edit Form State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editCountry, setEditCountry] = useState(null); // object { id, name }
  const [editIntlWorker, setEditIntlWorker] = useState(false);
  const [editHandicap, setEditHandicap] = useState(false);
  const [editPic, setEditPic] = useState('');
  const [editPicLocalUri, setEditPicLocalUri] = useState(''); // track if we have a real file to upload

  // Data
  const [countries, setCountries] = useState([]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  useEffect(() => {
    refreshUser();
    fetchCountries();
  }, []);

  const fetchCountries = async () => {
    try {
      const res = await axios.get(`${API_ENDPOINTS.GET_COUNTRIES}?user_id=${user.user_id}`);
      if (res.data?.success && res.data.data) {
        setCountries(res.data.data);
      }
    } catch (e) { console.log('Error fetching countries', e); }
  };

  const refreshUser = async () => {
    try {
      const dbUser = await getLocalUser(user.user_id);
      if (dbUser) {
        setUser(dbUser);
        setEditName(dbUser.employee_name || '');
        setEditEmail(dbUser.email || '');
        setEditPhone(dbUser.phone || '');
        setEditCity(dbUser.city || '');
        setEditState(dbUser.state || '');
        setEditPic(dbUser.profile_pic || '');
        // For country, we try to map if dbUser.country_id exists, 
        // fallback to setting it when we receive it
        if (dbUser.country_id) {
          setEditCountry({ id: dbUser.country_id, country_name: dbUser.country_name || 'Selected' });
        }
        setEditIntlWorker(dbUser.international_worker === 'Y');
        setEditHandicap(dbUser.physical_handicap === 'Y');
      }
    } catch (e) {
      console.log('Error refreshing user', e);
    }
  };

  // Helper to sync country selection once we load countries
  useEffect(() => {
    if (countries.length > 0 && user?.country_id && !editCountry) {
      const fd = countries.find(c => c.id == user.country_id);
      if (fd) setEditCountry(fd);
    }
  }, [countries]);

  const handleSave = async () => {
    if (!editName.trim()) {
      Alert.alert('Notice', 'Name cannot be empty'); return;
    }
    setLoading(true);
    try {
      const fName = editName.trim();
      const lName = '';

      const formData = new FormData();
      formData.append('user_id', user.user_id);
      formData.append('first_name', fName);
      formData.append('last_name', lName);
      formData.append('email', editEmail);
      formData.append('mobile_no', editPhone);
      formData.append('city', editCity);
      formData.append('state', editState);
      formData.append('country', editCountry?.id || '1');
      formData.append('international_worker', editIntlWorker ? 'Y' : 'N');
      formData.append('physical_handicap', editHandicap ? 'Y' : 'N');

      if (editPicLocalUri) {
        formData.append('profile_pic', { uri: editPicLocalUri, type: 'image/jpeg', name: 'profile.jpg' });
      } else {
        formData.append('profile_pic', editPic || '');
      }

      // API Call
      const res = await axios.post(API_ENDPOINTS.UPDATE_PROFILE, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        // Save locally
        await updateUserProfileLocal(user.user_id, {
          employee_name: editName,
          email: editEmail,
          phone: editPhone,
          city: editCity,
          state: editState,
          country_id: editCountry?.id || '',
          country_name: editCountry?.country_name || '',
          international_worker: editIntlWorker ? 'Y' : 'N',
          physical_handicap: editHandicap ? 'Y' : 'N',
          profile_pic: editPicLocalUri || editPic // assume local caching or wait for backend refresh
        });

        setIsEditing(false);
        setEditPicLocalUri('');
        refreshUser();
      } else {
        Alert.alert('Server Response', res.data?.message || 'Failed to update');
      }
    } catch (e) {
      console.log(e.response?.data || e.message);
      Alert.alert('Error', 'Failed to update profile via API.');
    } finally {
      setLoading(false);
    }
  };

  const attemptDiscard = () => {
    setShowDiscardModal(true);
  };

  const confirmDiscard = () => {
    setShowDiscardModal(false);
    setIsEditing(false);
    setEditPicLocalUri('');
    refreshUser(); // revert changes
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Gallery access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setEditPic(result.assets[0].uri);
      setEditPicLocalUri(result.assets[0].uri);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await clearUserSession();
          navigation.replace('Welcome');
        }
      }
    ]);
  };

  const MenuItem = ({ icon, title, subtitle, onPress }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIconContainer}>
        {icon}
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <ChevronRight color={COLORS.textMuted} size={18} />
    </TouchableOpacity>
  );

  const EditField = ({ label, value, onChangeText, keyboardType = 'default' }) => (
    <View style={styles.editInputBox}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { isEditing ? attemptDiscard() : navigation.goBack() }} style={styles.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Personal Details' : 'Profile'}</Text>
        <View style={styles.headerIcon} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Profile Card / Edit Mode */}
        {isEditing ? (
          <View style={styles.formWrapper}>
            <View style={styles.profileSection}>
              <View style={styles.avatarWrapper}>
                <Image
                  source={{ uri: editPic || user.profile_pic || `https://i.pravatar.cc/150?u=${user.user_id}` }}
                  style={styles.avatar}
                />
                <TouchableOpacity style={styles.editPencilBtn} onPress={handlePickImage} activeOpacity={0.8}>
                  <Edit2 color="#111827" size={14} />
                </TouchableOpacity>
              </View>
            </View>

            <EditField label="Name" value={editName} onChangeText={setEditName} />
            <EditField label="Email" value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />
            <EditField label="Contact Number" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
            <EditField label="City" value={editCity} onChangeText={setEditCity} />

            <View style={styles.editInputBox}>
              <Text style={styles.editLabel}>State</Text>
              <View style={styles.inputPickerRow}>
                <TextInput style={styles.inputInner} value={editState} onChangeText={setEditState} />
                <ChevronDown color={COLORS.textMuted} size={18} />
              </View>
            </View>

            <View style={styles.editInputBox}>
              <Text style={styles.editLabel}>Country</Text>
              <TouchableOpacity activeOpacity={0.7} style={[styles.inputPickerRow, { backgroundColor: '#FFF' }]} onPress={() => setShowCountryPicker(true)}>
                <Text style={styles.inputInner}>{editCountry?.country_name || ''}</Text>
                <ChevronDown color={COLORS.textMuted} size={18} />
              </TouchableOpacity>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>International Worker</Text>
              <Switch
                value={editIntlWorker}
                onValueChange={setEditIntlWorker}
                trackColor={{ false: '#E5E7EB', true: '#FCE7F3' }}
                thumbColor={editIntlWorker ? '#E91E63' : '#FFF'}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Physically Handicapped</Text>
              <Switch
                value={editHandicap}
                onValueChange={setEditHandicap}
                trackColor={{ false: '#E5E7EB', true: '#FCE7F3' }}
                thumbColor={editHandicap ? '#E91E63' : '#FFF'}
              />
            </View>

            {/* Bottom Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.discardOutBtn} onPress={attemptDiscard} disabled={loading}>
                <Text style={styles.discardOutText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveSolidBtn} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveSolidText}>Save</Text>}
              </TouchableOpacity>
            </View>

          </View>
        ) : (
          <View style={styles.profileSection}>
            <View style={styles.avatarWrapper}>
              <Image
                source={{ uri: editPic || user.profile_pic || `https://i.pravatar.cc/150?u=${user.user_id}` }}
                style={styles.avatar}
              />
            </View>

            <Text style={styles.userName}>{user.employee_name}</Text>
            <Text style={styles.userRole}>{user.designation}</Text>

            <View style={styles.statusBadge}>
              <View style={styles.dot} />
              <Text style={styles.statusText}>ACTIVE</Text>
            </View>

            {/* Info Grid */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}><User color="#2196F3" size={18} /></View>
                <View>
                  <Text style={styles.infoLabel}>User ID</Text>
                  <Text style={styles.infoVal}>{user.user_id}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}><Briefcase color="#2ECC71" size={18} /></View>
                <View>
                  <Text style={styles.infoLabel}>Department</Text>
                  <Text style={styles.infoVal}>{user.department}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              {user.email && (
                <>
                  <View style={styles.infoRow}>
                    <View style={[styles.iconBox, { backgroundColor: '#FFF3E0' }]}><Mail color="#FF9800" size={18} /></View>
                    <View>
                      <Text style={styles.infoLabel}>Email Address</Text>
                      <Text style={styles.infoVal}>{user.email}</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                </>
              )}
              {user.phone && (
                <>
                  <View style={styles.infoRow}>
                    <View style={[styles.iconBox, { backgroundColor: '#E0F2F1' }]}><Phone color="#009688" size={18} /></View>
                    <View>
                      <Text style={styles.infoLabel}>Contact Number</Text>
                      <Text style={styles.infoVal}>{editPhone || user.phone}</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                </>
              )}
              <View style={styles.infoRow}>
                <View style={[styles.iconBox, { backgroundColor: '#F3E5F5' }]}><Bell color={COLORS.primaryDeep} size={18} /></View>
                <View>
                  <Text style={styles.infoLabel}>Joining Date</Text>
                  <Text style={styles.infoVal}>{user.joining_date}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Account Settings</Text>
            <View style={styles.menuContainer}>
              <MenuItem
                icon={<User color={COLORS.text} size={20} />}
                title="Personal Information"
                subtitle="Change your avatar and name"
                onPress={() => setIsEditing(true)}
              />
              <MenuItem
                icon={<Shield color={COLORS.text} size={20} />}
                title="Privacy & Security"
                subtitle="Password and biometric lock"
                onPress={() => { }}
              />
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <LogOut color={COLORS.danger} size={20} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <SelectionModal
        visible={showCountryPicker}
        title="Select Country"
        options={countries}
        selectedValue={editCountry?.id}
        onClose={() => setShowCountryPicker(false)}
        onSelect={setEditCountry}
      />

  {/* Discard Modal Form */ }
  {
    showDiscardModal && (
      <Modal visible transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalCircleOuter}>
              <View style={styles.modalCircleInner}>
                <X color="#DC2626" size={32} strokeWidth={2.5} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Are you sure you want to discard changes?</Text>
            <Text style={styles.modalSub}>The informations won't be Updated if you discard.</Text>

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalBtnNo} onPress={() => setShowDiscardModal(false)}>
                <Text style={styles.modalBtnNoText}>No, Go back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnYes} onPress={confirmDiscard}>
                <Text style={styles.modalBtnYesText}>Yes, Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    )
  }

    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },

  // Profile Section
  profileSection: { alignItems: 'center', marginBottom: 32, width: '100%' },
  avatarWrapper: { position: 'relative', marginBottom: 24, marginTop: 10 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#FFF', ...SHADOWS.light },

  // Custom Pencil for Mockup Edit
  editPencilBtn: { position: 'absolute', bottom: -4, right: -4, backgroundColor: '#FFF', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },

  userName: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  userRole: { fontSize: 14, color: COLORS.textLight, fontWeight: '600', marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ECC71', marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: '800', color: '#2ECC71' },

  // Info Card
  infoCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 32, width: '100%', ...SHADOWS.light },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  infoLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '600', marginBottom: 2 },
  infoVal: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },

  // Edit Mode Specifics
  formWrapper: { width: '100%' },
  editInputBox: { marginBottom: 16, width: '100%' },

  // For standard TextInput layout shown in mockup
  editLabel: { position: 'absolute', top: -8, left: 14, backgroundColor: '#F9FAFB', zIndex: 2, paddingHorizontal: 4, fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  textInput: {
    backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 16, height: 54,
    fontSize: 14, fontWeight: '600', color: COLORS.text,
    borderWidth: 1, borderColor: '#E5E7EB'
  },

  inputPickerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 16, height: 54, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 1
  },
  inputInner: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  discardOutBtn: { flex: 1, height: 54, borderRadius: 30, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginRight: 8, backgroundColor: '#FFF' },
  discardOutText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  saveSolidBtn: { flex: 1, height: 54, borderRadius: 30, backgroundColor: '#4C1D95', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  saveSolidText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Menu
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 16, marginLeft: 4, alignSelf: 'flex-start' },
  menuContainer: { backgroundColor: '#FFF', borderRadius: 24, padding: 8, marginBottom: 24, width: '100%', ...SHADOWS.light },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuIconContainer: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  menuSubtitle: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF', paddingVertical: 18, borderRadius: 24,
    borderWidth: 1, borderColor: '#FEE2E2', ...SHADOWS.light, width: '100%'
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: COLORS.danger, marginLeft: 10 },

  // Discard Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center', ...SHADOWS.medium },
  modalCircleOuter: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalCircleInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#DC2626', justifyContent: 'center', alignItems: 'center', ...SHADOWS.light },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 10 },
  modalSub: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 26, lineHeight: 18 },
  modalActionRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  modalBtnNo: { flex: 1, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  modalBtnNoText: { color: '#4B5563', fontWeight: '700', fontSize: 13 },
  modalBtnYes: { flex: 1, height: 48, borderRadius: 24, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  modalBtnYesText: { color: '#FFF', fontWeight: '700', fontSize: 13 }
});

export default ProfileScreen;
