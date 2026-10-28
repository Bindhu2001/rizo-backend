import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLoggedUser, getLeavesLocal, saveNotificationLocal, markNotificationsAsReadLocal } from './LocalDB';
import { clearShiftReminders } from './ShiftReminders';
import { clearRevampToken, PushTokenApi, AnnouncementsApi } from './RevampApi';
import { API_ENDPOINTS } from '../constants/Config';
import axios from 'axios';
import { Platform } from 'react-native';

const BG_TASK_NAME = 'rizo-status-check';
const ANN_SEEDED_KEY = (userId) => `announcements_seeded_${userId}`;

// Configure Expo Notifications globally
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
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

    await NotificationManager.registerBackgroundFetch();
  }

  static async registerBackgroundFetch() {
    try {
      await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,   // keep running after app is killed (Android)
        startOnBoot: true,        // restart after device reboot
      });
      console.log('[NotificationManager] Background fetch registered');
    } catch (e) {
      console.log('[NotificationManager] Background fetch already registered or failed:', e.message);
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

  // A server push (PHP approvals) carries data.ref = the same key the status checks below use
  // (leave_12_APPROVED, ...). Saving it here means the background check never shows that
  // decision a second time, and the push also appears in the Notifications screen.
  static async recordPush(notification) {
    try {
      const content = notification?.request?.content;
      const ref = content?.data?.ref;
      if (!ref) return;
      const user = await getLoggedUser();
      if (!user?.user_id) return;
      const { initDB } = require('./LocalDB');
      const db = await initDB();
      const existing = await db.getFirstAsync(`SELECT id FROM notifications WHERE type = ?`, [ref]);
      if (existing) return;
      await saveNotificationLocal({
        userId: user.user_id,
        title: content.title || '',
        message: content.body || '',
        type: ref,
      });
    } catch (e) {
      console.log('[NotificationManager] recordPush error:', e?.message);
    }
  }

  // Pushes that arrived while the app was closed are still in the notification tray
  static async recordPresentedPushes() {
    try {
      const presented = await Notifications.getPresentedNotificationsAsync();
      for (const n of presented) await NotificationManager.recordPush(n);
    } catch (_) {}
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

      // Server pushes already shown → recorded first, so the checks below skip them
      await this.recordPresentedPushes();

      // Check Leaves Status
      await this.checkLeavesDiff(user);

      // Check Regularization Status
      await this.checkRegDiff(user);

      // Check Expense Status
      await this.checkExpenseDiff(user);

      // New company announcements
      await this.checkAnnouncements(user);

      this.lastCheckTime = Date.now();
    } catch (e) {
      console.log('[NotificationManager] Error checking status:', e);
    } finally {
      this.isChecking = false;
    }
  }

  static async getPushToken() {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return tokenData?.data || null;
  }

  static async registerAndSendToken(userId) {
    let token = null;
    try {
      token = await NotificationManager.getPushToken();
    } catch (e) {
      console.log('[NotificationManager] Push token unavailable:', e.message);
      return;
    }
    if (!token || !userId) return;

    // Each backend separately — one failing must not skip the other
    try {
      // PHP API pushes leave / regularisation / expense decisions to this phone instantly
      await axios.post(API_ENDPOINTS.REGISTER_PUSH_TOKEN, { user_id: userId, push_token: token, platform: Platform.OS }, { timeout: 5000 });
    } catch (e) {
      console.log('[NotificationManager] Production API token registration failed:', e.message);
    }
    try {
      // rizo-revamp pushes Connect-to-HR replies straight to this phone
      await PushTokenApi.register(token, Platform.OS);
    } catch (e) {
      console.log('[NotificationManager] rizo-revamp token registration failed:', e.message);
    }
  }

  // On logout: stop this phone receiving the signed-out user's notifications.
  // Best-effort — never blocks logout.
  static async unregisterToken(userId) {
    // Shift reminders and the rizo-revamp sign-in are per-user — never leave them for the next login
    await clearShiftReminders().catch(() => {});
    let token = null;
    try { token = await NotificationManager.getPushToken(); } catch (_) {}
    if (token) {
      // Detach from rizo-revamp first — it needs the sign-in that is cleared just below
      try {
        await PushTokenApi.remove(token);
      } catch (e) {
        console.log('[NotificationManager] rizo-revamp token unregister failed:', e.message);
      }
    }
    await clearRevampToken();
    if (userId && token) {
      try {
        await axios.post(API_ENDPOINTS.UNREGISTER_PUSH_TOKEN, { user_id: userId, push_token: token }, { timeout: 4000 });
      } catch (e) {
        console.log('[NotificationManager] PHP API token unregister failed:', e.message);
      }
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

  // Unread announcements this phone has not shown yet. rizo-revamp pushes one the moment it is
  // published (data.ref = ann_<id>, recorded by recordPush); this catches scheduled ones whose
  // publish date has come, and any push that never arrived. The first check after sign-in only
  // records what is already there, so a new install is not flooded with old announcements.
  static async checkAnnouncements(user) {
    try {
      const res = await AnnouncementsApi.list();
      const rows = Array.isArray(res?.data) ? res.data : [];
      const seededKey = ANN_SEEDED_KEY(user.user_id);
      const seeded = (await AsyncStorage.getItem(seededKey).catch(() => null)) === '1';
      const { initDB } = require('./LocalDB');
      const db = await initDB();
      for (const a of rows) {
        if (a.is_read) continue;
        const ref = `ann_${a.announcement_pkey}`;
        const existing = await db.getFirstAsync(`SELECT id FROM notifications WHERE type = ?`, [ref]);
        if (existing) continue;
        const prefix = a.category === 'Emergency' ? '🚨 Emergency' : a.category === 'Important' ? '📌 Important' : '📢 Announcement';
        const title = `${prefix}: ${a.title}`;
        const message = String(a.message || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const notifId = await saveNotificationLocal({ userId: user.user_id, title, message, type: ref });
        // First check after sign-in: kept in the list, but as read — old announcements are not 37 new alerts
        if (!seeded) await markNotificationsAsReadLocal(user.user_id, notifId);
        if (seeded) {
          await Notifications.scheduleNotificationAsync({
            content: { title, body: message, data: { type: 'ANNOUNCEMENT', id: Number(a.announcement_pkey) } },
            trigger: null,
          });
        }
      }
      if (!seeded) await AsyncStorage.setItem(seededKey, '1').catch(() => {});
    } catch (e) {
      console.log('[NotificationManager] checkAnnouncements error:', e?.message);
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

// Background task — runs even when app is killed (Android WorkManager)
TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    const user = await getLoggedUser();
    if (!user) return BackgroundFetch.BackgroundFetchResult.NoData;
    await NotificationManager.recordPresentedPushes();
    await NotificationManager.checkLeavesDiff(user);
    await NotificationManager.checkRegDiff(user);
    await NotificationManager.checkExpenseDiff(user);
    await NotificationManager.checkAnnouncements(user);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export default NotificationManager;
