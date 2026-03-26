import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  DollarSign, ChevronLeft, MoreHorizontal, FileText, 
  TrendingUp, Calendar, Download, Landmark, ShieldCheck, 
  ChevronRight, ArrowUpRight, Wallet
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';

const { width } = Dimensions.get('window');

const SalaryScreen = ({ navigation }) => {
  const salarySlips = [
    { id: '1', month: 'January 2025', amount: '₹42,500.00', date: '01 Feb 2025', status: 'CREDITED' },
    { id: '2', month: 'December 2024', amount: '₹42,500.00', date: '01 Jan 2025', status: 'CREDITED' },
    { id: '3', month: 'November 2024', amount: '₹40,000.00', date: '01 Dec 2024', status: 'CREDITED' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salary Slip</Text>
        <TouchableOpacity style={styles.headerIcon}>
           <MoreHorizontal color={COLORS.text} size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* Salary Card */}
        <LinearGradient
           colors={[COLORS.primaryDeep, '#4527A0']}
           start={{ x: 0, y: 0 }}
           end={{ x: 1, y: 1 }}
           style={styles.salaryCard}
        >
           <View style={styles.cardTop}>
             <View>
              <Text style={styles.cardLabel}>Next Payout</Text>
              <Text style={styles.amount}>₹42,500.00</Text>
             </View>
             <View style={styles.statusBadge}>
               <Text style={styles.statusText}>ACTIVE</Text>
             </View>
           </View>
           
           <View style={styles.cardBottom}>
             <View style={styles.nextPayRow}>
                <Calendar color="rgba(255,255,255,0.7)" size={14} />
                <Text style={styles.nextPayText}>Pate Date: 01 March 2025</Text>
             </View>
             <TouchableOpacity style={styles.slipBtn}>
               <FileText color={COLORS.primaryDeep} size={16} />
               <Text style={styles.slipBtnText}>Current Slip</Text>
             </TouchableOpacity>
           </View>
        </LinearGradient>

        {/* Bank Details */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Bank Details</Text>
        </View>
        <View style={styles.bankCard}>
          <View style={styles.bankIcon}>
            <Landmark color={COLORS.primaryDeep} size={24} />
          </View>
          <View style={styles.bankInfo}>
            <Text style={styles.bankName}>Chase Bank (Salary)</Text>
            <Text style={styles.accNo}>**** **** 4290</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <ShieldCheck color="#2ECC71" size={18} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#E1F5FE' }]}><Wallet color="#039BE5" size={18} /></View>
            <Text style={styles.statVal}>₹5.1L</Text>
            <Text style={styles.statLabel}>Annual CTC</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#E8F5E9' }]}><ArrowUpRight color="#2ECC71" size={18} /></View>
            <Text style={styles.statVal}>₹3,500</Text>
            <Text style={styles.statLabel}>Bonus</Text>
          </View>
        </View>

        {/* Payout History */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Payout History</Text>
          <TouchableOpacity><Text style={styles.seeAll}>Download Slips</Text></TouchableOpacity>
        </View>

        <View style={styles.listCard}>
          {salarySlips.map((slip, index) => (
            <TouchableOpacity key={slip.id} style={[styles.slipItem, index === salarySlips.length -1 && { borderBottomWidth: 0 }]}>
              <View style={styles.slipIcon}>
                <FileText color={COLORS.textLight} size={20} />
              </View>
              <View style={styles.slipMain}>
                <Text style={styles.slipMonth}>{slip.month}</Text>
                <Text style={styles.slipDate}>Paid on {slip.date}</Text>
              </View>
              <View style={styles.slipEnd}>
                <Text style={styles.slipAmount}>{slip.amount}</Text>
                <View style={styles.downloadBtn}>
                   <Download color={COLORS.textMuted} size={14} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 100 }} />
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

  // Salary Card
  salaryCard: { borderRadius: 30, padding: 24, marginBottom: 32, ...SHADOWS.medium },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 },
  cardLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4 },
  amount: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  statusBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 10, color: '#FFF', fontWeight: '800' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextPayRow: { flexDirection: 'row', alignItems: 'center' },
  nextPayText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginLeft: 6, fontWeight: '600' },
  slipBtn: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  slipBtnText: { color: COLORS.primaryDeep, fontWeight: '800', fontSize: 12, marginLeft: 8 },

  // Bank Card
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  seeAll: { fontSize: 13, color: COLORS.primaryDeep, fontWeight: '700' },
  bankCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 24, ...SHADOWS.light },
  bankIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  bankInfo: { flex: 1 },
  bankName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  accNo: { fontSize: 12, color: COLORS.textLight, marginTop: 4, fontWeight: '600' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  verifiedText: { fontSize: 10, color: '#2ECC71', fontWeight: '800', marginLeft: 4 },

  // Stats
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  statCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 24, padding: 16, ...SHADOWS.light },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statVal: { fontSize: 18, fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  statLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '600' },

  // List
  listCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 8, ...SHADOWS.light },
  slipItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  slipIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  slipMain: { flex: 1 },
  slipMonth: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  slipDate: { fontSize: 12, color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  slipEnd: { alignItems: 'flex-end', flexDirection: 'row', alignItems: 'center' },
  slipAmount: { fontSize: 15, fontWeight: '900', color: COLORS.text, marginRight: 15 },
  downloadBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' }
});

export default SalaryScreen;
