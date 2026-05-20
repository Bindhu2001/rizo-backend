import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getLoggedUser, getLeavesLocal, saveNotificationLocal } from './LocalDB';
import { API_ENDPOINTS } from '../constants/Config';
import BASE_URL from '../constants/Config';
import axios from 'axios';
import { Platform } from 'react-native';

// Configure Expo Notifications globally
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationManager {
  static isChecking = false;
  static lastCheckTime = 0;
  static CHECK_COOLDOWN_MS = 30 * 1000; // 30 seconds

  static async setup() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
  }

  static async triggerLocalNotification(title, message, type) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: message,
        data: { type },
      },
      trigger: null, // trigger immediately
    });
  }

  // Bypass cooldown — use when a status change is expected immediately
  static async forceCheck() {
    this.lastCheckTime = 0;
    return this.checkStatusChanges();
  }

  static async checkStatusChanges() {
    if (this.isChecking) return;
    if (Date.now() - this.lastCheckTime < this.CHECK_COOLDOWN_MS) return;
    this.isChecking = true;

    try {
      const user = await getLoggedUser();
      if (!user) {
        this.isChecking = false;
        return;
      }

      // Check Leaves Status
      await this.checkLeavesDiff(user);

      // Check Regularization Status
      await this.checkRegDiff(user);

      // Check Expense Status
      await this.checkExpenseDiff(user);

      this.lastCheckTime = Date.now();
    } catch (e) {
      console.log('[NotificationManager] Error checking status:', e);
    } finally {
      this.isChecking = false;
    }
  }

  static async registerAndSendToken(userId) {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      const token = tokenData?.data;
      if (token && userId) {
        // Register with production API
        await axios.post(API_ENDPOINTS.REGISTER_PUSH_TOKEN, { user_id: userId, push_token: token }, { timeout: 5000 });
        // Also register with rizo-backend so server-side poller can send push when app is closed
        await axios.post(`${BASE_URL}/register-push-token`, { user_id: userId, push_token: token }, { timeout: 5000 });
        console.log('[NotificationManager] Push token registered');
      }
    } catch (e) {
      console.log('[NotificationManager] Push token registration skipped:', e.message);
    }
  }

  static async checkLeavesDiff(user) {
    // 1. Fetch Leave History from Server
    try {
      const res = await axios.post(API_ENDPOINTS.LEAVE_HISTORY, { user_id: user.user_id, filter: 'all' }, { timeout: 10000 });
      if (res.data && res.data.success === 1 && res.data.data) {
        const serverLeaves = res.data.data;
        const localLeaves = await getLeavesLocal(user.user_id);
        
        // Let's create a map for local leaves assuming local DB ID is similar or we use from_date to match
        // Or better yet, we just check if any server leaves correspond to local Leaves and the status changed... 
        // Actually, easiest way is to track "Already Notified statuses" 
        // Since we don't have Server DB ID mapped locally easily, let's just track the last status observed from Server.
        // Wait, for simplicity, let's keep a history of "Notified Server Leaves". 
        // A simpler logic is: if a leave has status "Approved" or "Rejected", check if it exists in Notifications DB.
        
        for (const sLeave of serverLeaves) {
            const serverStatus = (sLeave.leave_status || sLeave.status || '').toUpperCase();
            const leaveId = sLeave.leave_id || sLeave.id;
            
            const isAuthorised = serverStatus === 'AUTHORISED' || serverStatus === 'AUTHORIZED';
            const isCancelled = serverStatus === 'CANCELLED' || serverStatus === 'CANCELED';
            if ((serverStatus === 'APPROVED' || serverStatus === 'REJECTED' || isAuthorised || isCancelled) && leaveId) {
                let title = '';
                if (serverStatus === 'APPROVED') title = 'Leave Approved ✅';
                else if (serverStatus === 'REJECTED') title = 'Leave Rejected ❌';
                else if (isAuthorised) title = 'Leave Authorised 🛡️';
                else if (isCancelled) title = 'Leave Cancelled ⚠️';

                const dateText = sLeave.from_date || 'your request';
                const action = isCancelled ? 'cancelled' : serverStatus.toLowerCase();
                const message = `Your leave (${sLeave.leave_name || 'request'}) for ${dateText} was ${action}.`;

                const normalizedStatus = isAuthorised ? 'AUTHORISED' : (isCancelled ? 'CANCELLED' : serverStatus);
                const uniqueNotifIdRef = `leave_${leaveId}_${normalizedStatus}`;

                const { initDB } = require('./LocalDB');
                const db = await initDB();
                const existing = await db.getFirstAsync(`SELECT id FROM notifications WHERE type = ?`, [uniqueNotifIdRef]);
                
                if (!existing) {
                    await saveNotificationLocal({
                        userId: user.user_id,
                        title: title,
                        message: message,
                        type: uniqueNotifIdRef
                    });
                    await this.triggerLocalNotification(title, message, 'LEAVE');
                }
            }
        }
      }
    } catch(e) {
      console.log('[NotificationManager] checkLeavesDiff error:', e);
    }
  }

  static async checkRegDiff(user) {
    try {
      // Check current month and previous month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      const prev = new Date(now.setMonth(now.getMonth() - 1));
      const prevMonth = `${prev.getFullYear()}-${(prev.getMonth() + 1).toString().padStart(2, '0')}`;

      const months = [currentMonth, prevMonth];

      for (const month of months) {
        const res = await axios.post(API_ENDPOINTS.REGULARISATION_LOGS, { user_id: user.user_id, month }, { timeout: 10000 });
        if (res.data && res.data.success === 1 && res.data.data) {
          const serverRegs = res.data.data;
          for (const sReg of serverRegs) {
            const serverStatus = sReg.status?.toUpperCase() || 'PENDING';
            const isCancelled = serverStatus === 'CANCELLED' || serverStatus === 'CANCELED';
            if (serverStatus === 'APPROVED' || serverStatus === 'REJECTED' || isCancelled) {
              let title;
              if (serverStatus === 'APPROVED') title = 'Regularization Approved ✅';
              else if (serverStatus === 'REJECTED') title = 'Regularization Rejected ❌';
              else title = 'Regularization Cancelled ⚠️';
              const dateText = sReg.punch_date || sReg.reg_date || sReg.date || 'your request';
              const action = isCancelled ? 'cancelled' : serverStatus.toLowerCase();
              const message = `Your attendance regularization for ${dateText} was ${action}.`;

              const normalizedStatus = isCancelled ? 'CANCELLED' : serverStatus;
              const regId = sReg.reg_id || sReg.id || sReg.regularisation_id;
              const uniqueNotifIdRef = `reg_${regId}_${normalizedStatus}`;

              const { initDB } = require('./LocalDB');
              const db = await initDB();
              const existing = await db.getFirstAsync(`SELECT id FROM notifications WHERE type = ?`, [uniqueNotifIdRef]);

              if (!existing) {
                await saveNotificationLocal({
                  userId: user.user_id,
                  title: title,
                  message: message,
                  type: uniqueNotifIdRef
                });
                await this.triggerLocalNotification(title, message, 'REGULARIZATION');
              }
            }
          }
        }
      }
    } catch(e) {
      console.log('[NotificationManager] checkRegDiff error:', e);
    }
  }

  static async checkExpenseDiff(user) {
    try {
      const res = await axios.get(`${API_ENDPOINTS.GET_SUBMITTED_EXPENSES}?user_id=${user.user_id}`, { timeout: 10000 });
      if (res.data && res.data.success === 1 && res.data.data) {
        const serverExpenses = res.data.data;
        for (const sExp of serverExpenses) {
          const serverStatus = sExp.expense_status?.toUpperCase() || 'PENDING';
          const isCancelled = serverStatus === 'CANCELLED' || serverStatus === 'CANCELED';
          const isAuthorised = serverStatus === 'AUTHORISED' || serverStatus === 'AUTHORIZED';
          // Treat AUTHORISED as APPROVED when same person is both authorizer and approver
          const isSelfAuth = isAuthorised && sExp.authorized_by && sExp.approved_by && sExp.authorized_by === sExp.approved_by;
          const effectiveStatus = isSelfAuth ? 'APPROVED' : serverStatus;

          const expId = sExp.emp_expenses_pkey || sExp.expense_id || sExp.id;
          if ((effectiveStatus === 'APPROVED' || serverStatus === 'REJECTED' || isCancelled || isAuthorised) && expId) {
            let title;
            if (effectiveStatus === 'APPROVED') title = 'Expense Approved ✅';
            else if (serverStatus === 'REJECTED') title = 'Expense Rejected ❌';
            else if (isAuthorised) title = 'Expense Authorised 🛡️';
            else title = 'Expense Cancelled ⚠️';
            const dateText = sExp.expense_date || 'your request';
            const action = isCancelled ? 'cancelled' : effectiveStatus.toLowerCase();
            const message = `Your expense request for ${dateText} was ${action}.`;

            const normalizedStatus = isCancelled ? 'CANCELLED' : effectiveStatus;
            const uniqueNotifIdRef = `exp_${expId}_${normalizedStatus}`;

            const { initDB } = require('./LocalDB');
            const db = await initDB();
            const existing = await db.getFirstAsync(`SELECT id FROM notifications WHERE type = ?`, [uniqueNotifIdRef]);

            if (!existing) {
              await saveNotificationLocal({
                userId: user.user_id,
                title: title,
                message: message,
                type: uniqueNotifIdRef
              });
              await this.triggerLocalNotification(title, message, 'EXPENSE');
            }
          }
        }
      }
    } catch(e) {
      console.log('[NotificationManager] checkExpenseDiff error:', e);
    }
  }
}

export default NotificationManager;
