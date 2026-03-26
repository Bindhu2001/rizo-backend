import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Image, Alert, Switch, TextInput, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  User, Settings, Bell, Shield, CircleHelp, LogOut, 
  ChevronRight, ChevronLeft, Mail, Phone, Briefcase, Camera, Edit2, Check
} from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { clearUserSession, updateUserProfileLocal, getLocalUser } from '../services/LocalDB';

const ProfileScreen = ({ navigation, route }) => {
  const [user, setUser] = useState(route?.params?.user || {
    employee_name: 'Tahaniya',
    designation: 'Senior Associate',
    user_id: 'GLET100056',
    department: 'Operations',
    joining_date: '2024-01-01',
    email: 'tahaniya@greatleap.tech',
    phone: '+91 9876543210'
  });

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Edit Form State
  const [editName, setEditName] = useState(user.employee_name);
  const [editDesignation, setEditDesignation] = useState(user.designation);
  const [editDept, setEditDept] = useState(user.department);
  const [editEmail, setEditEmail] = useState(user.email || '');
  const [editPhone, setEditPhone] = useState(user.phone || '');

  useEffect(() => {
    refreshUser();
  }, []);

  const refreshUser = async () => {
    try {
      const dbUser = await getLocalUser(user.user_id);
      if (dbUser) {
        setUser(dbUser);
        setEditName(dbUser.employee_name);
        setEditDesignation(dbUser.designation);
        setEditDept(dbUser.department);
        setEditEmail(dbUser.email || '');
        setEditPhone(dbUser.phone || '');
      }
    } catch (e) {
      console.log('Error refreshing user', e);
    }
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    setLoading(true);
    try {
      await updateUserProfileLocal(user.user_id, {
        employee_name: editName,
        designation: editDesignation,
        department: editDept,
        email: editEmail,
        phone: editPhone
      });
      setIsEditing(false);
      refreshUser();
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (e) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
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

  const MenuItem = ({ icon, title, subtitle, onPress, isNext = true }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIconContainer}>
        {icon}
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      {isNext && <ChevronRight color={COLORS.textMuted} size={18} />}
    </TouchableOpacity>
  );

  const EditField = ({ label, value, onChangeText, placeholder, keyboardType = 'default' }) => (
    <View style={styles.editInputBox}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput 
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Profile' : 'Profile'}</Text>
        <TouchableOpacity 
          style={styles.headerIcon} 
          onPress={() => isEditing ? handleSave() : setIsEditing(true)}
          disabled={loading}
        >
          {loading ? (
             <ActivityIndicator size="small" color={COLORS.primaryDeep} />
          ) : isEditing ? (
             <Check color={COLORS.primaryDeep} size={24} />
          ) : (
             <Edit2 color={COLORS.text} size={20} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* Profile Card */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrapper}>
            <Image 
              source={{ uri: user.profile_pic || `https://i.pravatar.cc/150?u=${user.user_id}` }} 
              style={styles.avatar} 
            />
            <TouchableOpacity style={styles.camBtn}>
              <Camera color="#FFF" size={14} />
            </TouchableOpacity>
          </View>
          
          {isEditing ? (
            <View style={{ width: '100%', marginTop: 10 }}>
              <EditField label="Employee Name" value={editName} onChangeText={setEditName} placeholder="Enter name" />
              <EditField label="Designation" value={editDesignation} onChangeText={setEditDesignation} placeholder="Enter designation" />
              <EditField label="Department" value={editDept} onChangeText={setEditDept} placeholder="Enter department" />
              <EditField label="Email Address" value={editEmail} onChangeText={setEditEmail} placeholder="Enter email" keyboardType="email-address" />
              <EditField label="Phone Number" value={editPhone} onChangeText={setEditPhone} placeholder="Enter phone" keyboardType="phone-pad" />
              
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                 {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>SAVE CHANGES</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
                 <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
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
                        <Text style={styles.infoLabel}>Phone Number</Text>
                        <Text style={styles.infoVal}>{user.phone}</Text>
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
                />
              </View>

              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <LogOut color={COLORS.danger} size={20} />
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },

  // Profile Section
  profileSection: { alignItems: 'center', marginBottom: 32 },
  avatarWrapper: { position: 'relative', marginBottom: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#FFF', ...SHADOWS.light },
  camBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primaryDeep, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
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

  // Edit Mode
  editInputBox: { marginBottom: 16, width: '100%' },
  editLabel: { fontSize: 13, color: COLORS.textLight, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  textInput: { 
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, 
    fontSize: 15, fontWeight: '600', color: COLORS.text,
    borderWidth: 1, borderColor: '#E5E7EB'
  },
  saveBtn: { backgroundColor: COLORS.primaryDeep, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 10, ...SHADOWS.medium },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  cancelBtn: { height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  cancelBtnText: { color: COLORS.textLight, fontWeight: '700' },

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
  logoutText: { fontSize: 15, fontWeight: '800', color: COLORS.danger, marginLeft: 10 }
});

export default ProfileScreen;
