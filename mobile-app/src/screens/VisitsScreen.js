import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Dimensions, TextInput, ActivityIndicator, Alert, Modal, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  MapPin, Navigation, Clock, CheckCircle, ChevronLeft, 
  MoreHorizontal, Search, Plus, Compass, ArrowRight, X
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';
import { getTodayVisits, saveVisitLocal, updateVisitStatus, initDB } from '../services/LocalDB';
import SyncService from '../services/SyncService';
import * as Network from 'expo-network';

const { width } = Dimensions.get('window');

const VisitsScreen = ({ navigation, route }) => {
  const user = route?.params?.user || { user_id: 'GLET100056' };
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClient, setNewClient] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchVisits();
  }, []);

  const fetchVisits = async () => {
    try {
      const data = await getTodayVisits(user.user_id);
      setVisits(data || []);
    } catch (e) {
      console.log('Fetch visits error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVisit = async () => {
    if (!newClient.trim()) {
      Alert.alert('Error', 'Please enter a client name');
      return;
    }
    setProcessing(true);
    try {
      await saveVisitLocal({
        userId: user.user_id,
        clientName: newClient,
        location: newLocation
      });

      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        await SyncService.syncAll();
      }

      setShowAddModal(false);
      setNewClient('');
      setNewLocation('');
      fetchVisits();
    } catch (e) {
      Alert.alert('Error', 'Failed to save visit');
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckIn = async (visitId) => {
    setProcessing(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
         Alert.alert('Permission Denied', 'Location permission is required to check-in.');
         setProcessing(false);
         return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await updateVisitStatus(visitId, 'REACHED', {
        startTime: new Date().toISOString(),
        lat: loc.coords.latitude,
        lng: loc.coords.longitude
      });

      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        await SyncService.syncAll();
      }

      fetchVisits();
      Alert.alert('Success', 'Checked in successfully!');
    } catch (e) {
      Alert.alert('Error', 'Failed to check-in');
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async (visitId) => {
    setProcessing(true);
    try {
      await updateVisitStatus(visitId, 'COMPLETED', {
        endTime: new Date().toISOString()
      });

      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        await SyncService.syncAll();
      }

      fetchVisits();
      Alert.alert('Success', 'Visit completed!');
    } catch (e) {
      Alert.alert('Error', 'Failed to complete visit');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'COMPLETED': return '#2ECC71';
      case 'REACHED': return '#3498DB';
      default: return COLORS.textMuted;
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primaryDeep} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visits Schedule</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <MoreHorizontal color={COLORS.text} size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* Tracking Card */}
        <LinearGradient
           colors={['#101828', '#1F2937']}
           start={{ x: 0, y: 0 }}
           end={{ x: 1, y: 1 }}
           style={styles.trackingCard}
        >
           <View style={styles.trackTop}>
             <View>
               <Text style={styles.trackLabel}>Live Tracking</Text>
               <Text style={styles.trackValue}>On Duty</Text>
             </View>
             <View style={styles.pulseBox}>
                <View style={styles.pulse} />
                <Text style={styles.pulseText}>GPS ACTIVE</Text>
             </View>
           </View>

           <View style={styles.locRow}>
             <View style={styles.iconCircle}>
               <Compass color={COLORS.primaryDeep} size={28} />
             </View>
             <View style={styles.locInfo}>
               <Text style={styles.locLabel}>Status</Text>
               <Text style={styles.locText}>{visits.filter(v => v.status === 'COMPLETED').length} Visits Completed Today</Text>
             </View>
           </View>
        </LinearGradient>

        {/* List Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Visit List</Text>
          <TouchableOpacity onPress={fetchVisits}><Text style={styles.historyText}>Refresh</Text></TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {visits.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <MapPin color={COLORS.textMuted} size={40} />
              <Text style={{ marginTop: 12, color: COLORS.textMuted, fontWeight: '600' }}>No visits scheduled for today</Text>
            </View>
          ) : (
            visits.map((visit, index) => {
              const color = getStatusColor(visit.status);
              return (
                <View key={visit.id} style={[styles.visitCard, index === visits.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.cardTop}>
                        <View style={styles.clientGroup}>
                            <Text style={styles.clientName}>{visit.client_name}</Text>
                            {visit.start_time && (
                                <View style={styles.timeRow}>
                                    <Clock color={COLORS.textLight} size={12} />
                                    <Text style={styles.timeText}>Started: {new Date(visit.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                            )}
                        </View>
                        <View style={[styles.statusTag, { backgroundColor: color + '15' }]}>
                            <Text style={[styles.statusText, { color: color }]}>{visit.status}{visit.sync_status === 'PENDING' ? ' (LOCAL)' : ''}</Text>
                        </View>
                    </View>

                    <View style={styles.locGroup}>
                        <MapPin color={COLORS.textLight} size={14} />
                        <Text style={styles.locSubText}>{visit.location || 'Location not specified'}</Text>
                    </View>

                    <View style={styles.cardActions}>
                        {visit.status === 'SCHEDULED' && (
                            <TouchableOpacity 
                                style={[styles.actionBtn, { backgroundColor: '#3498DB' }]}
                                onPress={() => handleCheckIn(visit.id)}
                                disabled={processing}
                            >
                                <Navigation color="#FFF" size={14} />
                                <Text style={styles.actionBtnText}>Check-In</Text>
                            </TouchableOpacity>
                        )}
                        {visit.status === 'REACHED' && (
                            <TouchableOpacity 
                                style={[styles.actionBtn, { backgroundColor: '#2ECC71' }]}
                                onPress={() => handleComplete(visit.id)}
                                disabled={processing}
                            >
                                <CheckCircle color="#FFF" size={14} />
                                <Text style={styles.actionBtnText}>Complete Visit</Text>
                            </TouchableOpacity>
                        )}
                        {visit.status === 'COMPLETED' && (
                             <View style={styles.completedRow}>
                                <CheckCircle color="#2ECC71" size={16} />
                                <Text style={styles.completedText}>
                                    Finished at {new Date(visit.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                             </View>
                        )}
                    </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
        <Plus color="#FFF" size={30} />
      </TouchableOpacity>

      {/* Add Visit Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                 <Text style={styles.modalTitle}>New Client Visit</Text>
                 <TouchableOpacity onPress={() => setShowAddModal(false)}>
                    <X color={COLORS.text} size={24} />
                 </TouchableOpacity>
              </View>

              <View style={styles.inputBox}>
                 <Text style={styles.inputLabel}>Client Name</Text>
                 <TextInput 
                    style={styles.input} 
                    placeholder="e.g. Acme Corp" 
                    value={newClient}
                    onChangeText={setNewClient}
                 />
              </View>

              <View style={styles.inputBox}>
                 <Text style={styles.inputLabel}>Location / Landmark</Text>
                 <TextInput 
                    style={styles.input} 
                    placeholder="e.g. North Plaza" 
                    value={newLocation}
                    onChangeText={setNewLocation}
                 />
              </View>

              <TouchableOpacity 
                style={[styles.saveBtn, processing && { opacity: 0.7 }]}
                onPress={handleAddVisit}
                disabled={processing}
              >
                {processing ? (
                    <ActivityIndicator color="#FFF" />
                ) : (
                    <Text style={styles.saveBtnText}>Save Schedule</Text>
                )}
              </TouchableOpacity>
           </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },

  // Tracking Card
  trackingCard: { borderRadius: 30, padding: 24, marginBottom: 32, ...SHADOWS.medium },
  trackTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  trackLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4 },
  trackValue: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  pulseBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ECC71', marginRight: 6 },
  pulseText: { fontSize: 10, color: '#FFF', fontWeight: '800' },
  locRow: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 56, height: 56, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  locLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4 },
  locText: { fontSize: 15, fontWeight: '800', color: '#FFF' },

  // List
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  historyText: { fontSize: 13, color: COLORS.primaryDeep, fontWeight: '700' },
  listContainer: { backgroundColor: '#FFF', borderRadius: 28, padding: 8, ...SHADOWS.light },
  visitCard: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  clientGroup: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 12, color: COLORS.textLight, fontWeight: '600', marginLeft: 6 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  locGroup: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  locSubText: { fontSize: 13, color: COLORS.textLight, fontWeight: '600', marginLeft: 8, flex: 1 },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginRight: 10 },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800', marginLeft: 8 },
  completedRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  completedText: { color: '#2ECC71', fontSize: 12, fontWeight: '700', marginLeft: 8 },

  fab: { 
    position: 'absolute', bottom: 30, right: 30, 
    width: 64, height: 64, borderRadius: 32, 
    backgroundColor: COLORS.primaryDeep, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.medium
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  inputBox: { marginBottom: 20 },
  inputLabel: { fontSize: 13, color: COLORS.textLight, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, fontSize: 15, fontWeight: '600', color: COLORS.text, borderWidth: 1, borderColor: '#F3F4F6' },
  saveBtn: { backgroundColor: COLORS.primaryDeep, padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' }
});

export default VisitsScreen;
