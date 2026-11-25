import axios from 'axios';
import * as Network from 'expo-network';
import { initDB } from './LocalDB';
import { API_ENDPOINTS } from '../constants/Config';
import * as Location from 'expo-location';
import NotificationManager from './NotificationManager';
import { syncPunchSelfies } from './PunchSelfie';
import { createAddressResolver, isUnresolvedAddress } from './AddressResolver';

// reverseGeocodeAsync has no built-in timeout and can hang far longer than the sync should wait
const reverseGeocodeWithTimeout = (coords) => Promise.race([
  Location.reverseGeocodeAsync(coords),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
]);

// Retries (HomeScreen retries every 30 s) a punch may wait for a throttled address lookup
const MAX_ADDRESS_HOLDS = 5;
const SWIPE_BATCH_SIZE = 50;
const addressHolds = {}; // punch id -> times held back
// How long a visit step may wait for its address before it goes with the Lat/Lng text
const VISIT_HOLD_MS = 150000;
const VISIT_HOLD_MAX_MS = 15 * 60000;
const visitHoldSince = {}; // "visit id:step" -> when its lookup first failed
let lastAddressFoundAt = 0; // the last lookup that worked (punches and visits)
// The steps of a customer visit, in the order they are sent, and the client_visits columns each one uses
const VISIT_STEPS = [
  { type: 'Start From', time: 'start_time', lat: 'latitude', lng: 'longitude', address: 'location', offline: 'start_offline', sent: 'start_synced' },
  { type: 'in', time: 'step_in_time', lat: 'step_in_lat', lng: 'step_in_lng', address: 'step_in_address', offline: 'step_in_offline', sent: 'step_in_synced' },
  { type: 'out', time: 'end_time', lat: 'end_lat', lng: 'end_lng', address: 'end_address', offline: 'end_offline', sent: 'end_synced' },
];

// Did the server take what was sent? It answers 200 with success 0 when it could not store it (e.g. the punch queue is
// unreachable) and expects the app to keep it and send it again. An error page or an empty body is a "no" too. A reply
// that is text but holds "success":1 (a PHP notice printed before the JSON) is a "yes": sending it again would duplicate.
const serverAccepted = (reply) => {
  if (typeof reply === 'string') return /"success"\s*:\s*("1"|1|true)/.test(reply);
  if (!reply || typeof reply !== 'object') return false;
  return !(reply.success === 0 || reply.success === '0' || reply.success === false);
};

// Which of the `count` punches of a batch the server took (positions). Its reply lists one entry per punch taken:
//   - as many entries as were sent: all of them;
//   - entries by position ({ "0": …, "2": … }): those positions;
//   - a shorter plain list (the queue took only some): no telling which, so none — they are sent again one by one
//     (punchBatches) and the queue drops the punches it already has.
const acceptedIndexes = (reply, count) => {
  if (!serverAccepted(reply)) return [];
  const all = Array.from({ length: count }, (_, i) => i);
  const data = typeof reply === 'object' ? reply.data : null;
  if (Array.isArray(data)) return data.length > 0 && data.length < count ? [] : all;
  if (data && typeof data === 'object') {
    const positions = Object.keys(data).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < count);
    return positions.length > 0 ? positions : all;
  }
  return all;
};

// Punches in order, SWIPE_BATCH_SIZE at a time; one that came back in an unclear reply goes alone
const sendAlone = new Set(); // punch ids
const punchBatches = (items) => {
  const batches = [];
  let current = [];
  for (const item of items) {
    const alone = sendAlone.has(item.id);
    if (current.length > 0 && (alone || current.length === SWIPE_BATCH_SIZE)) { batches.push(current); current = []; }
    if (alone) batches.push([item]);
    else current.push(item);
  }
  if (current.length > 0) batches.push(current);
  return batches;
};

const flushCallbacks = (list) => list.splice(0).forEach((cb) => {
  try { cb(); } catch (_) {}
});

const SyncService = {
  isSyncing: false,
  // Callbacks for the re-run queued behind the sync in progress (null = none queued)
  queuedCallbacks: null,

  /**
   * Main sync function - pushes all pending data to cloud.
   * onAttendanceSynced / onVisitsSynced fire as soon as that step is done,
   * before the slower later steps. They always fire — offline or on failure
   * too — so callers awaiting them never hang.
   */
  syncAll: async ({ onAttendanceSynced, onVisitsSynced } = {}) => {
    const callbacks = { attendance: [], visits: [] };
    if (onAttendanceSynced) callbacks.attendance.push(onAttendanceSynced);
    if (onVisitsSynced) callbacks.visits.push(onVisitsSynced);

    if (SyncService.isSyncing) {
      // Data saved mid-sync may be missed by the run in progress — queue a
      // re-run right after it (instead of waiting for the next retry tick)
      // and hand these callbacks to that re-run
      const queued = SyncService.queuedCallbacks || (SyncService.queuedCallbacks = { attendance: [], visits: [] });
      queued.attendance.push(...callbacks.attendance);
      queued.visits.push(...callbacks.visits);
      return;
    }
    return SyncService.runSync(callbacks);
  },

  runSync: async (callbacks) => {
    SyncService.isSyncing = true;
    try {
      const state = await Network.getNetworkStateAsync().catch(() => null);
      if (!state?.isConnected) {
        console.log('[SyncService] No internet connection, skipping sync.');
        return;
      }

      console.log('[SyncService] Starting background sync...');
      const db = await initDB();

      // One address lookup per place for the whole run (punches and visits share it and its throttle state)
      const addressResolver = createAddressResolver(reverseGeocodeWithTimeout);

      // 1. Sync Attendance
      await SyncService.syncAttendance(db, addressResolver);
      flushCallbacks(callbacks.attendance);

      // 1b. Selfies of "Mobile with selfie" punches (after the punches they belong to)
      await syncPunchSelfies().catch((e) => console.log('[SyncService] Selfie sync failed:', e?.message));

      // 2. Sync Visits
      await SyncService.syncVisits(db, addressResolver);
      flushCallbacks(callbacks.visits);

      // 3. Sync Leaves
      await SyncService.syncLeaves(db);

      console.log('[SyncService] Sync cycle complete ✅');
      NotificationManager.checkStatusChanges().catch(() => {});
    } catch (error) {
      console.error('[SyncService] Sync failed:', error.message);
    } finally {
      flushCallbacks(callbacks.attendance);
      flushCallbacks(callbacks.visits);
      SyncService.isSyncing = false;
      const queued = SyncService.queuedCallbacks;
      if (queued) {
        SyncService.queuedCallbacks = null;
        SyncService.runSync(queued);
      }
    }
  },

  syncAttendance: async (db, addressResolver = createAddressResolver(reverseGeocodeWithTimeout)) => {
    // In tap order (rowid): the server decides IN / OUT from the order it receives them
    const pending = await db.getAllAsync("SELECT * FROM attendance WHERE sync_status = 'PENDING' ORDER BY rowid");
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
              const { status: locPerm } = await Location.getForegroundPermissionsAsync();
              if (locPerm !== 'granted') {
                console.log('[SyncService] Location permission not granted, skipping location resolution.');
                fetchedFreshLoc = true;
                continue;
              }
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
                const geo = await reverseGeocodeWithTimeout({ latitude: freshLat, longitude: freshLng });
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
        } else if (isUnresolvedAddress(item.address)) {
          // We have coords but no real address (punched offline). Looked up once
          // per place; stops early if the geocoder is throttled (iOS ~50/min).
          const newAddress = await addressResolver.resolve(storedLat, storedLng);
          if (newAddress) {
            lastAddressFoundAt = Date.now();
            item.address = newAddress;
            // Save the newly resolved address in DB for later use
            await db.runAsync("UPDATE attendance SET address = ? WHERE id = ?", [newAddress, item.id]);
          } else {
            item.addressPending = true;
          }
        }
      }

      // Punches whose address could not be looked up yet (geocoder throttled):
      // hold them (and everything after them, to keep IN/OUT order) for the next
      // retry. After MAX_ADDRESS_HOLDS tries they go with the Lat/Lng text so a
      // geocoder that never works can't block attendance.
      let sendItems = items;
      items.forEach((item) => {
        if (item.addressPending) addressHolds[item.id] = (addressHolds[item.id] || 0) + 1;
      });
      const firstHeld = items.findIndex((item) => item.addressPending && addressHolds[item.id] <= MAX_ADDRESS_HOLDS);
      if (firstHeld !== -1) {
        sendItems = items.slice(0, firstHeld);
        console.log(`[SyncService] Address lookup throttled — sending ${sendItems.length}, holding ${items.length - sendItems.length} for retry`);
        if (sendItems.length === 0) continue;
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
      const buildPayload = (list) => list.map(item => {
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
      // Sent in order, SWIPE_BATCH_SIZE at a time, so a big offline backlog
      // (200+) isn't one huge request that times out. Each batch is marked
      // SYNCED as it lands; if one fails the rest stay PENDING for the retry.
      for (const batch of punchBatches(sendItems)) {
        const login_auditor_array = buildPayload(batch);
        try {
          console.log('[SyncService] SWIPE request in_out sequence:', login_auditor_array.map(x => `${x.in_out}@${x.time_check}`));
          const swipeRes = await axios.post(API_ENDPOINTS.SWIPE, {
            user_id: userId,
            login_auditor: JSON.stringify(login_auditor_array)
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
          console.log('[SyncService] SWIPE response:', JSON.stringify(swipeRes.data));

          // Only the punches the server says it took are synced; the others stay PENDING for the next sync
          const accepted = acceptedIndexes(swipeRes.data, batch.length);
          for (const index of accepted) {
            await db.runAsync("UPDATE attendance SET sync_status = 'SYNCED' WHERE id = ?", [batch[index].id]);
            delete addressHolds[batch[index].id];
            sendAlone.delete(batch[index].id);
          }
          // Accepted, but with a list that doesn't say which ones: next time one by one, so every answer is clear
          if (accepted.length === 0 && serverAccepted(swipeRes.data)) batch.forEach((item) => sendAlone.add(item.id));
          console.log(`[SyncService] Synced ${accepted.length} of ${batch.length} punch(es) for user ${userId}`);
          if (accepted.length < batch.length) throw new Error(swipeRes.data?.message || 'the server did not accept every punch');
        } catch (e) {
          console.log(`[SyncService] Attendance sync failed for user ${userId}:`, e.message);
          break; // keep order: don't send later batches past a failed one
        }
      }
    }
  },

  // Customer visits go up one STEP at a time (Start, then Step In, then Step Out), online or from an offline backlog:
  // each step is sent as soon as it exists and its own address is known — never waiting for the visit to be completed.
  // One visit failing or waiting never stops the other visits (the server orders steps by their tap time).
  syncVisits: async (db, addressResolver = createAddressResolver(reverseGeocodeWithTimeout)) => {
    const pending = await db.getAllAsync("SELECT id FROM client_visits WHERE sync_status = 'PENDING'");
    for (const { id } of pending) {
      try {
        await SyncService.syncVisitSteps(db, id, addressResolver);
      } catch (e) {
        console.log(`[SyncService] Visit ${id} sync failed:`, e.message);
      }
    }
  },

  // Sends every step of one visit that has not reached the server yet, in order.
  syncVisitSteps: async (db, id, addressResolver) => {
    for (const step of VISIT_STEPS) {
      // Read again before EVERY step: the person may have tapped the next one while the last was being sent
      const v = await db.getFirstAsync('SELECT * FROM client_visits WHERE id = ?', [id]);
      if (!v) return;
      if (!v[step.time] || v[step.sent]) continue; // not tapped yet, or already on the server
      if (step.type === 'out' && v.status !== 'COMPLETED') continue;

      const lat = parseFloat(v[step.lat]) || 0;
      const lng = parseFloat(v[step.lng]) || 0;
      let address = v[step.address];
      const holdKey = `${id}:${step.type}`;
      if (Math.abs(lat) > 0.01 && isUnresolvedAddress(address)) {
        // Looked up from THIS step's coordinates; only this step's address is saved, and only while it is still
        // the same tap — a sync must never overwrite what a newer tap wrote
        const found = await addressResolver.resolve(lat, lng);
        if (found) {
          address = found;
          lastAddressFoundAt = Date.now();
          await db.runAsync(`UPDATE client_visits SET ${step.address} = ? WHERE id = ? AND ${step.time} = ?`, [found, id, v[step.time]]);
        } else {
          // Lookup not possible yet (iOS throttling / weak network): this step and the ones after it wait for the next
          // sync; steps already sent stay sent. Counted in time, not tries: several triggers (tap, Home timer, Visits
          // timer) can fire within a minute. Lookups that still succeed elsewhere mean it is only throttling, so keep
          // waiting; none for VISIT_HOLD_MS (or VISIT_HOLD_MAX_MS in all) and it goes with the Lat/Lng text.
          const now = Date.now();
          VISIT_STEPS.forEach((s) => {
            const key = `${id}:${s.type}`;
            if (v[s.time] && !v[s.sent] && !visitHoldSince[key]) visitHoldSince[key] = now; // the later steps wait alongside
          });
          const since = visitHoldSince[holdKey];
          if (now - Math.max(since, lastAddressFoundAt) < VISIT_HOLD_MS && now - since < VISIT_HOLD_MAX_MS) {
            console.log(`[SyncService] Visit ${id}: ${step.type} waits for its address`);
            return;
          }
        }
      }

      await SyncService.postVisitStep(v, step, lat, lng, address);
      await db.runAsync(`UPDATE client_visits SET ${step.sent} = 1 WHERE id = ?`, [id]);
      delete visitHoldSince[holdKey];
    }

    // "Synced" only when every step tapped so far is on the server. Checked by the database in the same statement, so a
    // step tapped while the last one was being sent keeps the visit PENDING instead of being lost.
    await db.runAsync(
      `UPDATE client_visits SET sync_status = 'SYNCED' WHERE id = ?
         AND (start_time IS NULL OR start_synced = 1)
         AND (step_in_time IS NULL OR step_in_synced = 1)
         AND (end_time IS NULL OR status <> 'COMPLETED' OR end_synced = 1)`,
      [id]
    );
  },

  postVisitStep: async (v, step, lat, lng, address) => {
    const text = address || v.location || '';
    // The tag follows whether the step was made offline (saved at tap time), NOT whether the address is still Lat/Lng
    // text. Rows from before the flag existed (null) keep the old rule.
    const flag = v[step.offline];
    const hasFlag = flag !== null && flag !== undefined && flag !== '';
    const isOffline = hasFlag ? parseInt(flag, 10) === 1 : text.startsWith('Lat:');
    const d = new Date(v[step.time]);
    const pad = (n) => n.toString().padStart(2, '0');
    const res = await axios.post(`${API_ENDPOINTS.VISIT_SYNC}?user_id=${v.user_id}`, {
      stepinout: step.type,
      customer_name: v.client_name,
      purpose: v.purpose,
      latitude: `${lat || v.latitude || 0}`,
      longitude: `${lng || v.longitude || 0}`,
      accuracy: 20,
      location: `${isOffline ? '(Offline)' : '(Online)'} ${text}`.slice(0, 250),
      contact_person: v.contact_person,
      contact_number: v.contact_number,
      created_time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    if (!serverAccepted(res?.data)) throw new Error(res?.data?.message || 'the server did not accept the step');
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
  }
};

export default SyncService;
