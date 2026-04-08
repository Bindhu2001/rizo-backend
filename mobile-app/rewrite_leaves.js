const fs = require('fs');
const path = 'c:/Users/91858/Rizo_Mobile/mobile-app/src/screens/LeaveScreen.js';
let content = fs.readFileSync(path, 'utf8');

// Replace imports
content = content.replace(
`import { saveLeaveLocal, getLeavesLocal, initDB } from '../services/LocalDB';
import SyncService from '../services/SyncService';
import * as Network from 'expo-network';`,
`import axios from 'axios';`
);

// Replace state
content = content.replace(
`  const [view, setView] = useState('DASHBOARD');
  const [selectedLeaveType, setSelectedLeaveType] = useState('Casual Leave');
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);`,
`  const [view, setView] = useState('DASHBOARD');
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loading, setLoading] = useState(true);`
);

// Replace fetchHistory
content = content.replace(
`  const fetchHistory = async () => {
    try {
      const data = await getLeavesLocal(user.user_id);
      setLeaves(data || []);
    } catch (e) {
      console.log('Fetch leaves error', e);
    } finally {
      setLoading(false);
    }
  };`,
`  const fetchHistory = async () => {
    setLoading(true);
    try {
      const hist = await axios.post(\`https://v1.mypayrollmaster.online/api/v2qa/newapp/leave_history\`, { user_id: user.user_id });
      if (hist.data?.success) setLeaves(hist.data.data || []);

      const items = await axios.post(\`https://v1.mypayrollmaster.online/api/v2qa/newapp/leave_items\`, { user_id: user.user_id });
      if (items.data?.success) setLeaveBalances(items.data.data || []);
    } catch (e) {
      console.log('Fetch leaves error', e);
    } finally {
      setLoading(false);
    }
  };`
);

// Replace handleSubmit
content = content.replace(
`  const handleSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('Error', 'Please provide a reason for leave');
      return;
    }
    setSubmitting(true);
    try {
      await saveLeaveLocal({
        userId: user.user_id,
        leaveType: selectedLeaveType,
        fromDate,
        toDate,
        fromHalf,
        toHalf,
        reason,
        authorizedBy: authorisedBy,
        approvedBy: approvedBy,
        contactNo: contactNo
      });
      
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        await SyncService.syncAll();
      }
      
      setView('SUCCESS');
      fetchHistory();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save leave request.\\n\\nDetails: ' + e.message);
    } finally {
      setProcessing(false);
    }
  };`,
`  const handleSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('Error', 'Please provide a reason for leave');
      return;
    }
    if (!selectedLeave) return;

    setSubmitting(true);
    try {
      const res = await axios.post('https://v1.mypayrollmaster.online/api/v2qa/newapp/leave', {
        user_id: user.user_id,
        from_date: fromDate,
        to_date: toDate,
        salary_head_item_fkey: selectedLeave.leave_id,
        reason: reason,
        from_session: fromHalf === 'Full Day' ? 1 : 1,
        to_session: toHalf === 'Full Day' ? 2 : 2,
        contact_number: contactNo || 'N/A',
        duties_handed_over: 'N/A',
        authorized_by: 1, 
        approved_by: 1
      });

      if (res.data?.success === 1 || res.data?.success === true || res.data?.message?.toLowerCase().includes('success')) {
        setView('SUCCESS');
        await fetchHistory();
      } else {
        Alert.alert('Notice', res.data?.message || 'Failed to submit leave.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save leave request.\\n\\nDetails: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };`
);

// Remove static array
content = content.replace(
`  const leaveBalances = [
    { id: '1', type: 'Casual Leave', taken: 2, total: 5, color: COLORS.primaryDeep },
    { id: '2', type: 'Compensatory Off', taken: 0, total: 5, color: '#FF9800' },
    { id: '3', type: 'Sick Leave', taken: 3, total: 10, color: '#4CAF50' },
    { id: '4', type: 'Earned Leave', taken: 3.5, total: 10, color: '#2196F3' },
    { id: '5', type: 'Vacation Leave', taken: 0, total: 10, color: '#E91E63' },
  ];`,
``
);

// Update Dashboard View map loop
content = content.replace(
`        {leaveBalances.map(item => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.balanceCard}
            onPress={() => {
              setSelectedLeaveType(item.type);
              setView('APPLY');
            }}
          >
            <View style={[styles.typeBar, { backgroundColor: item.color }]} />
            <View style={styles.balanceContent}>
              <View>
                <Text style={styles.balanceRatio}>{item.taken}/{item.total}</Text>
                <Text style={styles.balanceType}>{item.type}</Text>
              </View>
              <ChevronRight color={COLORS.textMuted} size={20} />
            </View>
          </TouchableOpacity>
        ))}`,
`        {leaveBalances.map((item, index) => {
          const colors = ['#8E24AA', '#FF9800', '#4CAF50', '#2196F3', '#E91E63', '#9C27B0'];
          const ccolor = colors[index % colors.length];
          const taken = parseFloat(item.leave_taken) || 0;
          const bal = parseFloat(item.leave_balance) || 0;
          const total = taken + bal;
          
          return (
          <TouchableOpacity 
            key={item.leave_id} 
            style={styles.balanceCard}
            onPress={() => {
              setSelectedLeave(item);
              setView('APPLY');
            }}
          >
            <View style={[styles.typeBar, { backgroundColor: ccolor }]} />
            <View style={styles.balanceContent}>
              <View>
                <Text style={styles.balanceRatio}>{taken}/{total}</Text>
                <Text style={styles.balanceType}>{item.leave_name?.trim()}</Text>
              </View>
              <ChevronRight color={COLORS.textMuted} size={20} />
            </View>
          </TouchableOpacity>
        )})}`
);

// Update ApplyFormView titles
content = content.replace(
`      <LeaveHeader title={\`Apply \${selectedLeaveType}\`} onBack={() => setView('DASHBOARD')} />
      <View style={styles.remainingBanner}>
        <Text style={styles.remainingText}>{selectedLeaveType} remaining : 5</Text>
      </View>`,
`      <LeaveHeader title={\`Apply \${selectedLeave?.leave_name?.trim() || ''}\`} onBack={() => setView('DASHBOARD')} />
      <View style={styles.remainingBanner}>
        <Text style={styles.remainingText}>{selectedLeave?.leave_name?.trim() || ''} remaining : {selectedLeave?.leave_balance || 0}</Text>
      </View>`
);

/* Update History card loop */
content = content.replace(
`            leaves.map(item => (
                <View key={item.id} style={styles.historyCard}>
                    <View style={[styles.statusSideBar, { backgroundColor: item.status === 'APPROVED' ? '#4CAF50' : item.status === 'REJECTED' ? '#F44336' : (item.status === 'PENDING' ? '#F59E0B' : '#2196F3') }]}>
                        <Text style={styles.sidebarText}>{item.status === 'PENDING' ? 'LOCAL' : item.status}</Text>
                    </View>
                    <View style={styles.historyInfo}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.historyTypeTitle}>{item.leave_type}</Text>
                            <Text style={styles.historyDateText}>{item.from_date} to {item.to_date}</Text>
                            <Text style={styles.historyBy}>Reason: {item.reason}</Text>
                        </View>
                        <View style={styles.dayBadge}>
                            <Text style={styles.dayNum}>?</Text>
                            <Text style={styles.dayLabel}>Days</Text>
                        </View>
                    </View>
                </View>
            ))`,
`            leaves.map((item, index) => (
                <View key={item.leave_id || index.toString()} style={styles.historyCard}>
                    <View style={[styles.statusSideBar, { backgroundColor: item.leave_status === 'Approved' ? '#4CAF50' : item.leave_status === 'Rejected' ? '#F44336' : (item.leave_status === 'Applied' ? '#2196F3' : '#F59E0B') }]}>
                        <Text style={styles.sidebarText}>{item.leave_status}</Text>
                    </View>
                    <View style={styles.historyInfo}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.historyTypeTitle}>{item.leave_name?.trim()}</Text>
                            <Text style={styles.historyDateText}>{item.from_date} to {item.to_date}</Text>
                            {item.approved_by_person && <Text style={styles.historyBy}>Appr: {item.approved_by_person}</Text>}
                        </View>
                        <View style={styles.dayBadge}>
                            <Text style={styles.dayNum}>{item.leave_count}</Text>
                            <Text style={styles.dayLabel}>Days</Text>
                        </View>
                    </View>
                </View>
            ))`
);

fs.writeFileSync(path, content);
