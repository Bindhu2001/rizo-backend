import axios from 'axios';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';

// A punch counts wherever it was made — biometric device, web or this phone. The server has all of them per shift
// date (get_device_attendance, filtered on SHIFTDATE); this phone also has its own punches that may not have reached
// the server yet. Everything that decides from punches (the Home button and worked time, shift reminders, the
// short-hours alert) uses both, merged. The server's answer is kept per shift date in AsyncStorage, so it is
// there at once — and offline — instead of only after a network round trip.

const CACHE_KEY = (userId) => `SERVER_PUNCHES_${userId}`;
const KEEP_SHIFT_DATES = 4;
// The same punch on the phone and on the server: same IN/OUT within this
const SAME_PUNCH_MS = 90 * 1000;

const inflight = new Map(); // `${userId}|${shiftDate}` → promise, so Home and the reminders never fetch twice at once

// get_device_attendance rows → punch rows like LocalDB's ({ punch_time, type, address })
const toPunchRows = (rows) => rows
  .map((p) => ({
    time: new Date(String(p.LOGDATE || '').replace(' ', 'T')),
    type: String(p.C1 || '').toUpperCase(),
    address: p.C3 || '',
  }))
  .filter((p) => !isNaN(p.time.getTime()) && (p.type === 'IN' || p.type === 'OUT'))
  .map((p) => ({ punch_time: p.time.toISOString(), type: p.type, address: p.address, sync_status: 'SERVER' }));

const readCache = async (userId) => {
  try {
    const cache = JSON.parse((await AsyncStorage.getItem(CACHE_KEY(userId))) || 'null');
    // An older app version kept a single { shiftDate, punches, durationMins }
    if (cache && cache.shiftDate) return { [cache.shiftDate]: { punches: cache.punches || [], durationMins: cache.durationMins ?? null } };
    return cache || {};
  } catch (_) {
    return {};
  }
};

const writeCache = async (userId, cache) => {
  const kept = Object.keys(cache).sort().slice(-KEEP_SHIFT_DATES);
  const out = {};
  kept.forEach((d) => { out[d] = cache[d]; });
  try { await AsyncStorage.setItem(CACHE_KEY(userId), JSON.stringify(out)); } catch (_) {}
};

/** Server punches + the phone's punches the server doesn't have yet. */
export const mergePunches = (localPunches, serverPunches) => {
  const server = serverPunches || [];
  const serverMs = server.map((p) => ({ type: p.type, ms: new Date(p.punch_time).getTime() }));
  const localOnly = (localPunches || []).filter((l) => {
    const ms = new Date(l.punch_time).getTime();
    const type = String(l.type).toUpperCase();
    return !serverMs.some((s) => s.type === type && Math.abs(s.ms - ms) <= SAME_PUNCH_MS);
  });
  return [...server, ...localOnly];
};

/** Last known server answer for one shift date: { punches, durationMins } or null. */
export const getCachedServerDay = async (userId, shiftDate) => {
  const cache = await readCache(userId);
  return cache[shiftDate] || null;
};

/** Every cached server punch (all kept shift dates). */
export const getCachedServerPunches = async (userId) => {
  const cache = await readCache(userId);
  return Object.values(cache).flatMap((d) => d.punches || []);
};

/**
 * The shift date's punches from the server (all sources) and the day's duration in minutes as the Attendance screen
 * shows it (attendance_punches; null = none yet). Saved for later; null when offline or unreachable.
 */
export const fetchServerDay = (userId, shiftDate) => {
  const key = `${userId}|${shiftDate}`;
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return null;

      const [devRes, attRes] = await Promise.all([
        axios.post(API_ENDPOINTS.DEVICE_ATTENDANCE, { user_id: userId, date: shiftDate }, { timeout: 8000 }),
        axios.post(API_ENDPOINTS.ATTENDANCE_PUNCHES, { user_id: userId, month: shiftDate.slice(0, 7) }, { timeout: 8000 }).catch(() => null),
      ]);
      if (devRes.data?.success !== 1) return null;

      const rows = Array.isArray(devRes.data.data)
        ? devRes.data.data
        : (devRes.data.data ? Object.values(devRes.data.data) : []);
      const days = Array.isArray(attRes?.data?.data) ? attRes.data.data : [];
      const day = days.find((d) => d.date === shiftDate);
      const result = {
        punches: toPunchRows(rows),
        durationMins: day && Number(day.duration) > 0 ? Number(day.duration) : null,
        fetchedAt: Date.now(),
      };

      const cache = await readCache(userId);
      cache[shiftDate] = result;
      await writeCache(userId, cache);
      return result;
    } catch (e) {
      console.log('[AllPunches] server punches fetch failed:', shiftDate, e.message);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
};
