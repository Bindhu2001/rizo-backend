import * as Notifications from 'expo-notifications';
import { getLoggedUser, getLeavesLocal, saveNotificationLocal } from './LocalDB';
import { API_ENDPOINTS } from '../constants/Config';
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

  static async checkStatusChanges() {
    if (this.isChecking) return;
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
    } catch (e) {
      console.log('[NotificationManager] Error checking status:', e);
    } finally {
      this.isChecking = false;
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
            if ((serverStatus === 'APPROVED' || serverStatus === 'REJECTED') && leaveId) {
                const title = `Leave ${serverStatus === 'APPROVED' ? 'Approved ✅' : 'Rejected ❌'}`;
                const dateText = sLeave.from_date || 'your request';
                const message = `Your leave (${sLeave.leave_name || 'request'}) for ${dateText} was ${serverStatus.toLowerCase()}.`;
                
                const uniqueNotifIdRef = `leave_${leaveId}_${serverStatus}`;

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
            if (serverStatus === 'APPROVED' || serverStatus === 'REJECTED') {
              const title = `Regularization ${serverStatus === 'APPROVED' ? 'Approved' : 'Rejected'}`;
              const dateText = sReg.punch_date || 'your request';
              const message = `Your attendance regularization for ${dateText} was ${serverStatus.toLowerCase()}.`;

              const uniqueNotifIdRef = `reg_${sReg.id}_${serverStatus}`;

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
          if (serverStatus === 'APPROVED' || serverStatus === 'REJECTED') {
            const title = `Expense ${serverStatus === 'APPROVED' ? 'Approved' : 'Rejected'}`;
            const dateText = sExp.expense_date || 'your request';
            const message = `Your expense request for ${dateText} was ${serverStatus.toLowerCase()}.`;

            const uniqueNotifIdRef = `exp_${sExp.emp_expenses_pkey}_${serverStatus}`;

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
