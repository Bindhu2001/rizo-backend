import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Camera, Plus, Coffee, Car, Home, CreditCard, ChevronLeft, 
  MoreHorizontal, DollarSign, Briefcase, FileText, Clock, 
  ChevronRight, Calendar, ArrowUpRight, Zap
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';

const { width } = Dimensions.get('window');

const ExpenseScreen = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('LIST'); // LIST, ADD

  const categories = [
    { id: '1', name: 'Travel', icon: <Car color="#3498DB" size={20} />, color: '#EBF5FB' },
    { id: '2', name: 'Food', icon: <Coffee color="#F1C40F" size={20} />, color: '#FEF9E7' },
    { id: '3', name: 'Office', icon: <Briefcase color="#E91E63" size={20} />, color: '#FDEDEC' },
    { id: '4', name: 'Other', icon: <CreditCard color="#9B59B6" size={20} />, color: '#F5EEF8' },
  ];

  const expenses = [
    { id: '1', title: 'Travel Allowance', amount: '₹4,500.00', date: '20 Feb 2025', status: 'APPROVED', color: '#2ECC71' },
    { id: '2', title: 'Client Meeting', amount: '₹3,250.50', date: '18 Feb 2025', status: 'PENDING', color: '#FF9800' },
    { id: '3', title: 'Stationery Items', amount: '₹850.00', date: '15 Feb 2025', status: 'REJECTED', color: '#F44336' },
  ];

  const Header = ({ title, onBack }) => (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <ChevronLeft color={COLORS.text} size={28} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity style={styles.headerIcon}>
        <MoreHorizontal color={COLORS.text} size={24} />
      </TouchableOpacity>
    </View>
  );

  const ListView = () => (
    <View style={{ flex: 1 }}>
      <Header title="Expense Tracker" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* Summary Card */}
        <LinearGradient
           colors={[COLORS.primaryDeep, '#4A148C']}
           style={styles.summaryCard}
        >
           <View style={styles.summaryTop}>
             <View>
               <Text style={styles.summaryLabel}>Total Expense</Text>
               <Text style={styles.totalAmount}>₹12,450.00</Text>
             </View>
             <View style={styles.periodBadge}>
               <Text style={styles.periodText}>JAN 2025</Text>
             </View>
           </View>
           <View style={styles.statsRow}>
             <View style={styles.statLine}>
               <View style={[styles.dot, { backgroundColor: '#FFEE58' }]} />
               <Text style={styles.statText}>Pending: ₹3,950</Text>
             </View>
             <View style={styles.statLine}>
               <View style={[styles.dot, { backgroundColor: '#66BB6A' }]} />
               <Text style={styles.statText}>Approved: ₹8,500</Text>
             </View>
           </View>
        </LinearGradient>

        {/* Category List */}
        <Text style={styles.sectionTitle}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar}>
          {categories.map(cat => (
            <TouchableOpacity key={cat.id} style={styles.catItem}>
              <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
                {cat.icon}
              </View>
              <Text style={styles.catName}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Transactions */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>My Claims</Text>
          <View style={styles.listCard}>
            {expenses.map((item, index) => (
              <TouchableOpacity key={item.id} style={[styles.expenseItem, index === expenses.length -1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.itemIcon, { backgroundColor: item.color + '10' }]}>
                  <Zap color={item.color} size={20} />
                </View>
                <View style={styles.itemMain}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDate}>{item.date}</Text>
                </View>
                <View style={styles.itemEnd}>
                  <Text style={styles.amountText}>{item.amount}</Text>
                  <View style={[styles.statusTag, { backgroundColor: item.color + '15' }]}>
                    <Text style={[styles.statusText, { color: item.color }]}>{item.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setActiveTab('ADD')}>
        <Plus color="#FFF" size={30} />
      </TouchableOpacity>
    </View>
  );

  const AddView = () => (
    <View style={{ flex: 1 }}>
      <Header title="New Claim" onBack={() => setActiveTab('LIST')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        <View style={styles.formCard}>
          <View style={styles.amountInput}>
            <Text style={styles.currency}>₹</Text>
            <TextInput 
              style={styles.mainInput} 
              placeholder="0.00" 
              keyboardType="numeric"
              placeholderTextColor="#CBD5E1"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Expense Title</Text>
            <TextInput style={styles.field} placeholder="e.g. Client Dinner" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Select Category</Text>
            <View style={styles.pickerRow}>
              {categories.map(cat => (
                <TouchableOpacity key={cat.id} style={styles.pickerBtn}>
                  <View style={[styles.pickerDot, { backgroundColor: cat.color }]}>{cat.icon}</View>
                  <Text style={styles.pickerLabel}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Attachment</Text>
            <TouchableOpacity style={styles.uploadBox}>
              <View style={styles.camCirc}><Camera color={COLORS.primaryDeep} size={28} /></View>
              <Text style={styles.uploadTitle}>Scan Bills</Text>
              <Text style={styles.uploadSub}>Take a clear photo of your receipt</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={() => setActiveTab('LIST')}>
             <Text style={styles.submitText}>SUBMIT CLAIM</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'LIST' ? <ListView /> : <AddView />}
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

  // List View
  summaryCard: { borderRadius: 30, padding: 24, marginBottom: 32, ...SHADOWS.medium },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  summaryLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  totalAmount: { fontSize: 36, fontWeight: '900', color: '#FFF' },
  periodBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  periodText: { fontSize: 10, color: '#FFF', fontWeight: '800' },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 },
  statLine: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 16, marginLeft: 4 },
  catBar: { marginBottom: 32 },
  catItem: { alignItems: 'center', marginRight: 24 },
  catIcon: { width: 60, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8, ...SHADOWS.light },
  catName: { fontSize: 12, color: COLORS.textLight, fontWeight: '600' },

  listCard: { backgroundColor: '#FFF', borderRadius: 28, padding: 8, ...SHADOWS.light },
  expenseItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  itemIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  itemMain: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  itemDate: { fontSize: 11, color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  itemEnd: { alignItems: 'flex-end' },
  amountText: { fontSize: 16, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },

  fab: { 
    position: 'absolute', bottom: 30, right: 30, 
    width: 64, height: 64, borderRadius: 32, 
    backgroundColor: COLORS.primaryDeep, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.medium
  },

  // Add View
  formCard: { backgroundColor: '#FFF', borderRadius: 32, padding: 24, ...SHADOWS.light },
  amountInput: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#F3F4F6', paddingBottom: 10, marginBottom: 32 },
  currency: { fontSize: 24, fontWeight: '900', color: COLORS.text, marginRight: 12 },
  mainInput: { fontSize: 40, fontWeight: '900', color: COLORS.text, flex: 1 },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 12, color: COLORS.textLight, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase' },
  field: { 
    height: 54, backgroundColor: '#F9FAFB', borderRadius: 16, 
    paddingHorizontal: 16, fontSize: 15, fontWeight: '700', 
    borderWidth: 1, borderColor: '#F3F4F6' 
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pickerBtn: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', 
    padding: 10, borderRadius: 16, marginRight: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#F3F4F6'
  },
  pickerDot: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  pickerLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  uploadBox: { 
    height: 160, borderRadius: 24, borderStyle: 'dotted', 
    borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
    justifyContent: 'center', alignItems: 'center'
  },
  camCirc: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F3E5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  uploadTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  uploadSub: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  submitBtn: { 
    backgroundColor: COLORS.primaryDeep, height: 64, borderRadius: 32, 
    justifyContent: 'center', alignItems: 'center', marginTop: 8, ...SHADOWS.medium 
  },
  submitText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 }
});

export default ExpenseScreen;
