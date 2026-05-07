import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator, Platform, Image, RefreshControl } from 'react-native';
import CustomAlert from '../components/CustomAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MoreHorizontal, FileText,
  Calendar, Download, Landmark, ShieldCheck,
  ArrowUpRight, Wallet, ChevronLeft
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SHADOWS , moderateScale } from '../components/Theme';
import axios from 'axios';
import { API_ENDPOINTS } from '../constants/Config';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

const SalaryScreen = ({ navigation, route }) => {
  const user = route?.params?.user;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [salarySlips, setSalarySlips] = useState([]);
  const [grossSalary, setGrossSalary] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);
  const [alertCfg, setAlertCfg] = useState(null);

  const showAlert = (type, title, message, buttons) => setAlertCfg({ type, title, message, buttons });

  useEffect(() => {
    if (user && user.user_id) {
      fetchSalaryData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSalaryData();
    setRefreshing(false);
  };

  const fetchSalaryData = async () => {
    try {
      setLoading(true);
      // Fetch Monthly Gross
      const grossRes = await axios.post(API_ENDPOINTS.MONTHLY_GROSS, { user_id: user.user_id }, { timeout: 10000 });
      if (grossRes.data?.success && grossRes.data?.data?.gross_salary) {
        setGrossSalary(grossRes.data.data.gross_salary);
      }

      // Fetch Salary Slips
      const slipRes = await axios.post(API_ENDPOINTS.SALARY_SLIP, { user_id: user.user_id }, { timeout: 10000 });
      if (slipRes.data?.success && Array.isArray(slipRes.data?.data)) {
        setSalarySlips(slipRes.data.data);
      }
    } catch (e) {
      console.log('Error fetching salary data', e.message);
      // Fallback data for showcase if API fails
      if (salarySlips.length === 0) {
        // Alert.alert('Error', 'Unable to fetch salary details at the moment.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async (slip) => {
    if (downloadingId) return;
    setDownloadingId(slip.month);

    try {
      const monthStr = formatMonth(slip.month);
      let htmlContent = `
        <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #581C87; padding-bottom: 20px; }
            .title { font-size: 28px; font-weight: bold; color: #581C87; margin: 0; }
            .subtitle { font-size: 16px; color: #666; margin-top: 5px; }
            .emp-details { margin-bottom: 30px; }
            .emp-details table { width: 100%; }
            .emp-details td { padding: 5px 0; }
            .section-title { font-size: 18px; font-weight: bold; color: #581C87; margin-top: 20px; margin-bottom: 10px; background: #F3E8FF; padding: 10px; border-radius: 5px; }
            table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            table.data-table th, table.data-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            table.data-table th { background-color: #F9FAFB; font-weight: bold; }
            .right-align { text-align: right !important; }
            .amt-col { width: 120px; }
            .total-row { font-weight: bold; background-color: #F3E8FF !important; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="title">Salary Slip</p>
            <p class="subtitle">For the month of ${monthStr}</p>
          </div>
          
          <div class="emp-details">
            <table>
              <tr>
                <td><strong>Employee Name:</strong> ${user?.employee_name || 'N/A'}</td>
                <td><strong>Employee ID:</strong> ${user?.emp_pkey || user?.user_id || 'N/A'}</td>
              </tr>
              <tr>
                <td><strong>Designation:</strong> ${user?.designation || 'N/A'}</td>
                <td><strong>Department:</strong> ${user?.department || 'N/A'}</td>
              </tr>
            </table>
          </div>
      `;

      let totalAdditions = 0;
      let totalDeductions = 0;

      if (slip.heads && Array.isArray(slip.heads)) {
        slip.heads.forEach(head => {
          htmlContent += `<div class="section-title">${head.head_desc}</div>`;
          htmlContent += `
            <table class="data-table">
              <tr>
                <th>Description</th>
                <th class="amt-col right-align">Amount (₹)</th>
              </tr>
          `;

          if (head.items && Array.isArray(head.items)) {
            head.items.forEach(item => {
              const amt = Math.abs(parseFloat(item.amount) || 0);
              if (item.operator === 'Addition') totalAdditions += amt;
              else if (item.operator === 'Deduction') totalDeductions += amt;

              htmlContent += `
                <tr>
                  <td>${item.item_desc}</td>
                  <td class="right-align">${amt.toFixed(2)}</td>
                </tr>
              `;
            });
          }
          htmlContent += `</table>`;
        });
      }

      const netSalary = totalAdditions - totalDeductions;

      htmlContent += `
          <table class="data-table">
            <tr class="total-row">
              <td>Gross Additions</td>
              <td class="right-align amt-col">₹${totalAdditions.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Total Deductions</td>
              <td class="right-align amt-col">₹${totalDeductions.toFixed(2)}</td>
            </tr>
            <tr class="total-row" style="background-color: #EDE9FE !important; font-size: 18px;">
              <td><strong>NET SALARY PAYABLE</strong></td>
              <td class="right-align amt-col"><strong>₹${netSalary.toFixed(2)}</strong></td>
            </tr>
          </table>
          
          <div class="footer">
            <p>This is a computer generated document and does not require a physical signature.</p>
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Salary_Slip_${monthStr}.pdf` });
      } else {
        showAlert('error', 'Error', 'Sharing/Downloading is not available on this device.');
      }

    } catch (e) {
      console.error(e);
      showAlert('error', 'Error', 'Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatMonth = (str) => {
    if (!str) return '';
    try {
      const [year, month] = str.split('-');
      const d = new Date(year, parseInt(month) - 1, 1);
      return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    } catch (e) { return str; }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft color={COLORS.text} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salary Slip</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primaryDeep} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor={'#4F46E5'} />}>

          {/* Salary Card */}
          <LinearGradient
            colors={[COLORS.primaryDeep, '#4527A0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.salaryCard}
          >
            <View style={styles.cardTop}>
              <View>
                <Text style={styles.cardLabel}>Monthly Gross Salary</Text>
                <Text style={styles.amount}>₹{grossSalary ? grossSalary.toLocaleString('en-IN') : '---'}</Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>ACTIVE</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#E1F5FE' }]}><Wallet color="#039BE5" size={18} /></View>
              <Text style={styles.statVal}>₹{(grossSalary * 12).toLocaleString('en-IN') || '---'}</Text>
              <Text style={styles.statLabel}>Annual CTC Configured</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#E8F5E9' }]}><ArrowUpRight color="#2ECC71" size={18} /></View>
              <Text style={styles.statVal}>{salarySlips.length}</Text>
              <Text style={styles.statLabel}>Slips Generated</Text>
            </View>
          </View>

          {/* Payout History */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payout History</Text>
            <TouchableOpacity onPress={fetchSalaryData}><Text style={styles.seeAll}>Refresh</Text></TouchableOpacity>
          </View>

          <View style={styles.listCard}>
            {salarySlips.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: COLORS.textLight }}>No salary slips found</Text>
              </View>
            ) : salarySlips.map((slip, index) => {
              // Calculate rough amount for display if possible
              let dispAmountStr = '---';
              if (slip.heads) {
                let tAdd = 0, tDed = 0;
                slip.heads.forEach(h => {
                  if (h.items) {
                    h.items.forEach(i => {
                      const val = Math.abs(parseFloat(i.amount) || 0);
                      if (i.operator === 'Addition') tAdd += val;
                      if (i.operator === 'Deduction') tDed += val;
                    });
                  }
                });
                dispAmountStr = (tAdd - tDed).toLocaleString('en-IN', { minimumFractionDigits: 2 });
              }

              return (
                <TouchableOpacity onPress={() => handleDownloadPdf(slip)} key={slip.month || index} style={[styles.slipItem, index === salarySlips.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.slipIcon}>
                    <FileText color={COLORS.textLight} size={20} />
                  </View>
                  <View style={styles.slipMain}>
                    <Text style={styles.slipMonth}>{formatMonth(slip.month)}</Text>
                    <Text style={styles.slipDate}>Slip available</Text>
                  </View>
                  <View style={styles.slipEnd}>
                    <Text style={styles.slipAmount}>₹{dispAmountStr}</Text>
                    <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownloadPdf(slip)} disabled={downloadingId === slip.month}>
                      {downloadingId === slip.month ? (
                        <ActivityIndicator size="small" color={COLORS.primaryDeep} />
                      ) : (
                        <Download color={COLORS.textMuted} size={14} />
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20 },

  // Salary Card
  salaryCard: { borderRadius: 30, padding: 24, marginBottom: 32, ...SHADOWS.medium },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 },
  cardLabel: { fontSize: moderateScale(12), color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 4 },
  amount: { fontSize: moderateScale(32), fontWeight: '900', color: '#FFF' },
  statusBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: moderateScale(10), color: '#FFF', fontWeight: '800' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextPayRow: { flexDirection: 'row', alignItems: 'center' },
  nextPayText: { fontSize: moderateScale(11), color: 'rgba(255,255,255,0.7)', marginLeft: 6, fontWeight: '600' },
  slipBtn: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  slipBtnText: { color: COLORS.primaryDeep, fontWeight: '800', fontSize: moderateScale(12), marginLeft: 8 },

  // Bank Card
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: '800', color: COLORS.text },
  seeAll: { fontSize: moderateScale(13), color: COLORS.primaryDeep, fontWeight: '700' },
  bankCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 24, ...SHADOWS.light },
  bankIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#F5F3FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  bankInfo: { flex: 1 },
  bankName: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text },
  accNo: { fontSize: moderateScale(12), color: COLORS.textLight, marginTop: 4, fontWeight: '600' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  verifiedText: { fontSize: moderateScale(10), color: '#2ECC71', fontWeight: '800', marginLeft: 4 },

  // Stats
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  statCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 24, padding: 16, ...SHADOWS.light },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statVal: { fontSize: moderateScale(18), fontWeight: '900', color: COLORS.text, marginBottom: 2 },
  statLabel: { fontSize: moderateScale(11), color: COLORS.textLight, fontWeight: '600' },

  // List
  listCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 8, ...SHADOWS.light },
  slipItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  slipIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  slipMain: { flex: 1 },
  slipMonth: { fontSize: moderateScale(15), fontWeight: '800', color: COLORS.text },
  slipDate: { fontSize: moderateScale(12), color: COLORS.textLight, fontWeight: '600', marginTop: 2 },
  slipEnd: { alignItems: 'flex-end', flexDirection: 'row', alignItems: 'center' },
  slipAmount: { fontSize: moderateScale(15), fontWeight: '900', color: COLORS.text, marginRight: 15 },
  downloadBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' }
});

export default SalaryScreen;

