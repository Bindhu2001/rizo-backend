import axios from 'axios';
import * as Network from 'expo-network';
import { 
  initDB
} from './LocalDB';
import { API_ENDPOINTS } from '../constants/Config';

const SyncService = {
  isSyncing: false,

  /**
   * Main sync function - pushes all pending data to cloud
   */
  syncAll: async () => {
    if (SyncService.isSyncing) return;
    
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) {
      console.log('[SyncService] No internet connection, skipping sync.');
      return;
    }

    SyncService.isSyncing = true;
    console.log('[SyncService] Starting background sync...');

    try {
      const db = await initDB();

      // 1. Sync Attendance
      await SyncService.syncAttendance(db);

      // 2. Sync Visits
      await SyncService.syncVisits(db);

      // 3. Sync Leaves
      await SyncService.syncLeaves(db);

      // 4. Sync Regularization
      await SyncService.syncRegularization(db);

      console.log('[SyncService] Sync cycle complete ✅');
    } catch (error) {
      console.error('[SyncService] Sync failed:', error.message);
    } finally {
      SyncService.isSyncing = false;
    }
  },

  syncAttendance: async (db) => {
    const pending = await db.getAllAsync("SELECT * FROM attendance WHERE sync_status = 'PENDING'");
    if (pending.length === 0) return;

    // Group pending punches by user_id
    const userPunches = {};
    pending.forEach(item => {
      if (!userPunches[item.user_id]) userPunches[item.user_id] = [];
      userPunches[item.user_id].push(item);
    });

    for (const userId of Object.keys(userPunches)) {
      const items = userPunches[userId];
      
      // Attempt to get the emp_pkey from the user profile if needed
      let empPkey = 0;
      try {
        const userProfile = await db.getFirstAsync("SELECT emp_pkey FROM user_profile WHERE user_id = ?", [userId]);
        if (userProfile && userProfile.emp_pkey) {
          empPkey = parseInt(userProfile.emp_pkey, 10) || 0;
        }
      } catch (e) {
        console.log('[SyncService] Could not fetch emp_pkey for user:', userId);
      }

      const formatTime = (isoString) => {
        const d = new Date(isoString);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };

      const login_auditor_array = items.map(item => ({
        auditor_pkey: empPkey,
        latitude: parseFloat(item.latitude) || 0,
        longitude: parseFloat(item.longitude) || 0,
        user_id: item.user_id,
        time_check: formatTime(item.punch_time),
        in_out: item.type, // 'IN' or 'OUT'
        accuracy: "20",
        loc_sourse: "fused-android",
        locationName: item.address || "Unknown"
      }));

      try {
        await axios.post('https://v1.mypayrollmaster.online/api/v2qa/newapp/swipe', {
          user_id: userId,
          login_auditor: JSON.stringify(login_auditor_array)
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        
        // Mark as SYNCED
        for (const item of items) {
          await db.runAsync("UPDATE attendance SET sync_status = 'SYNCED' WHERE id = ?", [item.id]);
        }
      } catch (e) {
        console.log(`[SyncService] Attendance sync failed for user ${userId}:`, e.message);
      }
    }
  },

  syncVisits: async (db) => {
    const pending = await db.getAllAsync("SELECT * FROM client_visits WHERE sync_status = 'PENDING'");
    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        await axios.post(API_ENDPOINTS.VISITS, {
          userId: item.user_id,
          clientName: item.client_name,
          contactNumber: item.contact_number,
          contactPerson: item.contact_person,
          purpose: item.purpose,
          location: item.location,
          latitude: item.latitude,
          longitude: item.longitude,
          startTime: item.start_time,
          stepInTime: item.step_in_time,
          endTime: item.end_time,
          status: item.status
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        await db.runAsync("UPDATE client_visits SET sync_status = 'SYNCED' WHERE id = ?", [item.id]);
      } catch (e) {
        console.log(`[SyncService] Visit ${item.id} sync failed:`, e.message);
      }
    }
  },

  syncLeaves: async (db) => {
    const pending = await db.getAllAsync("SELECT * FROM leaves WHERE status = 'PENDING'");
    // Note: LocalDB leaves table uses 'status' as 'PENDING'.
    // We should differentiate between local status (like 'APPROVED') and sync status.
    // For now, let's assume PENDING means it hasn't stayed safe in cloud.
    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        await axios.post(API_ENDPOINTS.LEAVES, {
          userId: item.user_id,
          leaveType: item.leave_type,
          fromDate: item.from_date,
          toDate: item.to_date,
          fromHalf: item.from_half,
          toHalf: item.to_half,
          reason: item.reason,
          authorizedBy: item.authorized_by,
          approvedBy: item.approved_by,
          contactNo: item.contact_no
        }, { headers: { 'Content-Type': 'application/json' } });
        // We set status to 'PENDING (CLOUD)' or just keep it as is if server returns PENDING.
        // Usually, the server will reply with the request's cloud ID.
        // For simplicity, we'll mark it as 'SUBMITTED' locally.
        await db.runAsync("UPDATE leaves SET status = 'SUBMITTED' WHERE id = ?", [item.id]);
      } catch (e) {
        console.log(`[SyncService] Leave ${item.id} sync failed:`, e.message);
      }
    }
  },

  syncRegularization: async (db) => {
    const pending = await db.getAllAsync("SELECT * FROM attendance_reg WHERE status = 'PENDING'");
    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        await axios.post(API_ENDPOINTS.REGULARIZATION, {
          userId: item.user_id,
          punchDate: item.punch_date,
          actualTime: item.actual_time,
          expectedTime: item.expected_time,
          type: item.type,
          reason: item.reason
        }, { headers: { 'Content-Type': 'application/json' } });
        await db.runAsync("UPDATE attendance_reg SET status = 'SUBMITTED' WHERE id = ?", [item.id]);
      } catch (e) {
        console.log(`[SyncService] Reg ${item.id} sync failed:`, e.message);
      }
    }
  }
};

export default SyncService;
