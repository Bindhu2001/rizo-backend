import axios from 'axios';
import * as Network from 'expo-network';
import { initDB } from './LocalDB';
import { API_ENDPOINTS } from '../constants/Config';
import * as Location from 'expo-location';
import NotificationManager from './NotificationManager';

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
      NotificationManager.checkStatusChanges().catch(() => {});
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

      // --- Step 1: Resolve missing locations or addresses ---
      let freshLat = 0, freshLng = 0, freshLocName = 'Location Attached';
      let fetchedFreshLoc = false;

      for (let item of items) {
        let storedLat = parseFloat(item.latitude) || 0;
        let storedLng = parseFloat(item.longitude) || 0;
        let isMissingCoords = Math.abs(storedLat) < 0.0001 && Math.abs(storedLng) < 0.0001;

        if (isMissingCoords) {
          if (!fetchedFreshLoc) {
            console.log(`[SyncService] Punch missing coords detected for user ${userId} — fetching current location...`);
            try {
              const loc = await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
              ]);
              freshLat = loc.coords.latitude;
              freshLng = loc.coords.longitude;
              freshLocName = `Lat: ${freshLat.toFixed(5)}, Lng: ${freshLng.toFixed(5)}`;
              console.log(`[SyncService] Current location acquired: ${freshLat}, ${freshLng}`);
            } catch (_) {
              try {
                const lastLoc = await Location.getLastKnownPositionAsync();
                if (lastLoc) {
                  freshLat = lastLoc.coords.latitude;
                  freshLng = lastLoc.coords.longitude;
                  freshLocName = `Lat: ${freshLat.toFixed(5)}, Lng: ${freshLng.toFixed(5)}`;
                  console.log(`[SyncService] Using last-known location: ${freshLat}, ${freshLng}`);
                }
              } catch (e) {
                console.log('[SyncService] Could not acquire location for offline punch.');
              }
            }

            if (Math.abs(freshLat) > 0.0001) {
              try {
                const geo = await Location.reverseGeocodeAsync({ latitude: freshLat, longitude: freshLng });
                if (geo && geo.length > 0) {
                  const r = geo[0];
                  const parts = [r.name || r.street, r.district || r.city, r.region].filter(Boolean);
                  if (parts.length > 0) {
                    freshLocName = [...new Set(parts)].join(', ');
                  }
                }
              } catch (e) {
                console.log('[SyncService] Reverse geocode failed for offline punch.');
              }
            }
            fetchedFreshLoc = true;
          }

          item.latitude = freshLat;
          item.longitude = freshLng;
          item.address = freshLocName;

          // Update DB so we save the location and address for later use
          if (Math.abs(freshLat) > 0.0001) {
            await db.runAsync("UPDATE attendance SET latitude = ?, longitude = ?, address = ? WHERE id = ?", [freshLat, freshLng, freshLocName, item.id]);
          }
        } else {
          // We have coords, but do we have a valid address generated while offline?
          if (!item.address || item.address === 'Location Attached' || item.address.startsWith('Lat:')) {
            try {
              const geo = await Location.reverseGeocodeAsync({ latitude: storedLat, longitude: storedLng });
              if (geo && geo.length > 0) {
                const r = geo[0];
                const parts = [
                  r.name, 
                  r.street, 
                  r.district || r.subregion,
                  r.city || r.locality, 
                  r.region, 
                  r.postalCode
                ].filter(Boolean);
                
                if (parts.length > 0) {
                  const newAddress = [...new Set(parts)].join(', ');
                  item.address = newAddress;
                  // Save the newly resolved address in DB for later use
                  await db.runAsync("UPDATE attendance SET address = ? WHERE id = ?", [newAddress, item.id]);
                }
              }
            } catch (e) {
              console.log('[SyncService] Reverse geocode failed for attendance sync:', e.message);
            }
          }
        }
      }

      // --- Step 2: Fetch emp_pkey ---
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

      // --- Step 3: Build payload ---
      const login_auditor_array = items.map(item => {
        // Evaluate the flag to determine suffix exclusively for the backend payload
        const punchTypeSuffix = parseInt(item.is_offline) === 1 ? '(Offline Punch)' : '(Online Punch)';
        const apiLocationName = `${punchTypeSuffix} ${item.address || 'Location Attached'}`;

        return {
          auditor_pkey: empPkey,
          latitude: parseFloat(item.latitude) || 0,
          longitude: parseFloat(item.longitude) || 0,
          user_id: item.user_id,
          time_check: formatTime(item.punch_time),
          in_out: item.type, // 'IN' or 'OUT'
          accuracy: "20",
          loc_sourse: "fused-android",
          locationName: apiLocationName
        };
      });

      // --- Step 4: Call API ---
      try {
        await axios.post(API_ENDPOINTS.SWIPE, {
          user_id: userId,
          login_auditor: JSON.stringify(login_auditor_array)
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

        for (const item of items) {
          await db.runAsync("UPDATE attendance SET sync_status = 'SYNCED' WHERE id = ?", [item.id]);
        }
        console.log(`[SyncService] Synced ${items.length} punch(es) for user ${userId}`);
      } catch (e) {
        console.log(`[SyncService] Attendance sync failed for user ${userId}:`, e.message);
      }
    }
  },

  syncVisits: async (db) => {
    const pending = await db.getAllAsync("SELECT * FROM client_visits WHERE sync_status = 'PENDING'");
    if (pending.length === 0) return;

    const resolveAddress = async (lat, lng, existingAddr) => {
      if (!existingAddr || existingAddr === 'Unable to fetch location' || existingAddr === 'Unknown Location' || existingAddr.startsWith('Lat:')) {
        if (Math.abs(lat) > 0.01) {
          try {
            const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (geo && geo.length > 0) {
              const r = geo[0];
              const parts = [r.name, r.street, r.district || r.subregion, r.city || r.locality, r.region, r.postalCode].filter(Boolean);
              if (parts.length > 0) return [...new Set(parts)].join(', ');
            }
          } catch (e) {
            console.log('[SyncService] Reverse geocode failed during sync:', e.message);
          }
        }
      }
      return existingAddr;
    };

    for (const item of pending) {
      try {
        // Resolve all possible addresses
        const finalMainLoc = await resolveAddress(parseFloat(item.latitude) || 0, parseFloat(item.longitude) || 0, item.location);
        const finalStepInAddr = await resolveAddress(parseFloat(item.step_in_lat) || 0, parseFloat(item.step_in_lng) || 0, item.step_in_address || item.location);
        const finalEndAddr = await resolveAddress(parseFloat(item.end_lat) || 0, parseFloat(item.end_lng) || 0, item.end_address || item.location);

        // Update local DB with resolved addresses if they changed
        if (finalMainLoc !== item.location || finalStepInAddr !== item.step_in_address || finalEndAddr !== item.end_address) {
          await db.runAsync(
            "UPDATE client_visits SET location = ?, step_in_address = ?, end_address = ? WHERE id = ?",
            [finalMainLoc, finalStepInAddr, finalEndAddr, item.id]
          );
        }

        const formatSyncTime = (iso) => {
           if (!iso) return "";
           const d = new Date(iso);
           const pad = (n) => n.toString().padStart(2, '0');
           return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const postVisit = async (stepType, timeStr, lat, lng, addr) => {
            const payload = {
              stepinout: stepType,
              customer_name: item.client_name,
              purpose: item.purpose,
              latitude: `${lat || 0}`,
              longitude: `${lng || 0}`,
              accuracy: 20,
              location: (addr || finalMainLoc || '').slice(0, 250),
              contact_person: item.contact_person,
              contact_number: item.contact_number,
              created_time: formatSyncTime(timeStr)
            };
            const url = `${API_ENDPOINTS.VISIT_SYNC}?user_id=${item.user_id}`;
            await axios.post(url, payload, { 
              headers: { 'Content-Type': 'application/json' }, 
              timeout: 10000 
            });
        };

        // If it got to REACHED or beyond, we post Step In
        if (item.step_in_time || item.start_time) {
             const sLat = item.step_in_lat || item.latitude || 0;
             const sLng = item.step_in_lng || item.longitude || 0;
             await postVisit("Step In", item.step_in_time || item.start_time, sLat, sLng, finalStepInAddr);
        }
        // If it was fully COMPLETED, we additionally post Step Out
        if (item.status === 'COMPLETED' && item.end_time) {
             const eLat = item.end_lat || item.latitude || 0;
             const eLng = item.end_lng || item.longitude || 0;
             await postVisit("Step Out", item.end_time, eLat, eLng, finalEndAddr);
        }
        
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
