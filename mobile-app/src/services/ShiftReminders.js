import axios from 'axios';
import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { API_ENDPOINTS } from '../constants/Config';
import { getPunchesBetween } from './LocalDB';
import { assignShiftDates } from './ShiftDate';

// Shift punch reminders (10 min before/after shift start and end) and the
// short-hours alert, all scheduled on the phone so they fire with the app closed.
// Schedule comes from the shift_schedule API, cached for offline use.

export const REMINDERS_ENABLED_KEY = 'punch_reminders_enabled';
const SCHEDULE_CACHE_KEY = (userId) => `shift_schedule_${userId}`;
const SHORT_STATE_KEY = (userId) => `shift_short_state_${userId}`;
const SCHEDULE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const REMINDER_OFFSET_MS = 10 * 60 * 1000;
// Punches this far before shift start / after shift end still belong to that shift
const WINDOW_PAD_MS = 4 * 60 * 60 * 1000;
// A check-out before shift end may be a break — the short-hours alert waits until after the shift
const SHORT_ALERT_DELAY_MS = 15 * 60 * 1000;
const REMINDER_PREFIX = 'shift-r-';
const SHORT_PREFIX = 'shift-short-';
const REMIND_DAY_TYPES = new Set(['WORKING', 'HALF_DAY', 'HALF_DAY_LEAVE']);

const isoDay = (d) => format(d, 'yyyy-MM-dd');
const fmtTime = (d) => format(d, 'h:mm a');
const fmtMins = (mins) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const isRemindersEnabled = async () => {
  try { return (await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)) !== 'false'; } catch (_) { return true; }
};

export const setRemindersEnabled = async (enabled, userId) => {
  try { await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, enabled ? 'true' : 'false'); } catch (_) {}
  if (enabled) await refreshShiftReminders(userId, { forceFetch: true });
  else await clearShiftReminders();
};

const fetchSchedule = async (userId) => {
  const from = new Date();
  from.setDate(from.getDate() - 1); // yesterday too, for night shifts ending today
  // 14 days (the API's maximum) so the button and reminders keep working through a long spell offline
  const body = { user_id: userId, from_date: isoDay(from), days: 14 };
  const ok = (res) => res?.data && (res.data.success === 1 || res.data.success === true) && Array.isArray(res.data.data?.days);
  let res = await axios.post(API_ENDPOINTS.SHIFT_SCHEDULE, body, { timeout: 8000 }).catch(() => null);
  if (!ok(res)) {
    const qs = `user_id=${encodeURIComponent(userId)}&from_date=${body.from_date}&days=${body.days}`;
    res = await axios.get(`${API_ENDPOINTS.SHIFT_SCHEDULE}?${qs}`, { timeout: 8000 }).catch(() => null);
  }
  return ok(res) ? res.data.data.days : null;
};

const loadSchedule = async (userId, forceFetch) => {
  let cached = null;
  try { cached = JSON.parse(await AsyncStorage.getItem(SCHEDULE_CACHE_KEY(userId)) || 'null'); } catch (_) {}
  // Re-fetched every new day and after 3 hours (and on every punch sync, via forceFetch)
  const fresh = cached && Date.now() - cached.fetchedAt < SCHEDULE_MAX_AGE_MS
    && isoDay(new Date(cached.fetchedAt)) === isoDay(new Date());
  if (fresh && !forceFetch) return cached.days;

  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net?.isConnected) {
    const days = await fetchSchedule(userId);
    if (days) {
      try { await AsyncStorage.setItem(SCHEDULE_CACHE_KEY(userId), JSON.stringify({ fetchedAt: Date.now(), days })); } catch (_) {}
      return days;
    }
  }
  return cached?.days || [];
};

// Actual start/end Date for a schedule row, with half-day adjustments
const shiftWindow = (row) => {
  const toDate = (hhmm) => {
    const [y, mo, d] = row.date.split('-').map(Number);
    const [h, mi] = String(hhmm || '').split(':').map(Number);
    if (![y, mo, d, h, mi].every(Number.isFinite)) return null;
    return new Date(y, mo - 1, d, h, mi, 0, 0);
  };
  let start = toDate(row.shift_start);
  let end = toDate(row.shift_end);
  if (!start || !end) return null;
  if (row.crosses_midnight || end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const halfMs = (Number(row.half_day_minutes) || 0) * 60 * 1000;
  if (halfMs > 0) {
    if (row.day_type === 'HALF_DAY_LEAVE' && row.leave_session === 'FIRST_HALF') {
      start = new Date(start.getTime() + halfMs);
    } else if (row.day_type === 'HALF_DAY' || (row.day_type === 'HALF_DAY_LEAVE' && row.leave_session === 'SECOND_HALF')) {
      end = new Date(start.getTime() + halfMs);
    }
  }
  return { start, end };
};

const schedule = (identifier, title, body, date, data) =>
  Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, sound: 'default', data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'default' },
  }).catch((e) => console.log('[ShiftReminders] schedule failed', identifier, e?.message));

const cancelByPrefix = async (prefix) => {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(all
    .filter((n) => n.identifier?.startsWith(prefix))
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
};

// The saved schedule only — no network wait, so the punch button never waits on it
// (refreshShiftReminders keeps it up to date in the background)
export const getCachedShiftSchedule = async (userId) => {
  try {
    const cached = JSON.parse(await AsyncStorage.getItem(SCHEDULE_CACHE_KEY(userId)) || 'null');
    return cached?.days || [];
  } catch (_) {
    return [];
  }
};

export const clearShiftReminders = async () => {
  await cancelByPrefix(REMINDER_PREFIX);
  await cancelByPrefix(SHORT_PREFIX);
};

/**
 * Re-plans every shift notification from the schedule + this phone's punches.
 * Call on app open, after every punch, and when the switch is turned on.
 */
export const refreshShiftReminders = async (userId, { forceFetch = false } = {}) => {
  if (!userId) return;
  try {
    if (!(await isRemindersEnabled())) { await clearShiftReminders(); return; }

    const days = await loadSchedule(userId, forceFetch);
    const now = Date.now();
    const windows = days
      .filter((row) => REMIND_DAY_TYPES.has(row.day_type))
      .map((row) => ({ row, w: shiftWindow(row) }))
      .filter(({ w }) => w && w.end.getTime() + WINDOW_PAD_MS > now);

    const earliest = windows.length ? Math.min(...windows.map(({ w }) => w.start.getTime())) - WINDOW_PAD_MS : now;
    const punches = await getPunchesBetween(userId, new Date(earliest).toISOString(), new Date(now + 60000).toISOString())
      .catch(() => []);
    // Grouped by shift date the way the server's punch trigger does (night shifts included)
    const assigned = assignShiftDates(punches, days);

    let shortState = {};
    try { shortState = JSON.parse(await AsyncStorage.getItem(SHORT_STATE_KEY(userId)) || '{}'); } catch (_) {}
    const nextShortState = {};

    await cancelByPrefix(REMINDER_PREFIX);

    for (const { row, w } of windows) {
      const startMs = w.start.getTime();
      const endMs = w.end.getTime();
      const inWindow = assigned.filter((p) => p.shiftDate === row.date);
      const firstIn = inWindow.find((p) => p.type === 'IN');
      const last = inWindow[inWindow.length - 1];
      const checkedIn = !!firstIn;
      const checkedOut = checkedIn && last?.type === 'OUT';
      const startLabel = fmtTime(w.start);
      const endLabel = fmtTime(w.end);
      const id = (kind) => `${REMINDER_PREFIX}${row.date}-${kind}`;

      if (!checkedIn) {
        const before = startMs - REMINDER_OFFSET_MS;
        const after = startMs + REMINDER_OFFSET_MS;
        if (before > now) await schedule(id('start-before'), '⏰ Shift starts soon', `Your shift starts at ${startLabel}. Don't forget to check in.`, new Date(before), { type: 'SHIFT_REMINDER' });
        if (after > now) await schedule(id('start-after'), '🔔 Not checked in yet', `Your shift started at ${startLabel}. Please check in now.`, new Date(after), { type: 'SHIFT_REMINDER' });
      } else if (!checkedOut) {
        // Check-out reminders only once checked in — no "check out" nudge on a day never started
        const before = endMs - REMINDER_OFFSET_MS;
        const after = endMs + REMINDER_OFFSET_MS;
        if (before > now) await schedule(id('end-before'), '🕔 Shift ends soon', `Your shift ends at ${endLabel}. Don't forget to check out.`, new Date(before), { type: 'SHIFT_REMINDER' });
        if (after > now) await schedule(id('end-after'), '🚪 Not checked out yet', `Your shift ended at ${endLabel}. Please check out now.`, new Date(after), { type: 'SHIFT_REMINDER' });
      }

      // Short hours, same rule as the server's attendance calculation: first IN → last OUT, or the
      // last punch of any kind when the shift has include_break + first_in_last_punch; with
      // strict_monitorings, time before shift start / after shift end does not count
      const required = Number(row.required_minutes) || 0;
      const shortId = `${SHORT_PREFIX}${row.date}`;
      const lastAnyPunch = row.include_break === 'Y' && row.first_in_last_punch === 'Y';
      const outPunch = lastAnyPunch ? last : [...inWindow].reverse().find((p) => p.type === 'OUT');
      const hasOut = !!(firstIn && outPunch && outPunch.time > firstIn.time);
      if ((checkedOut || (lastAnyPunch && hasOut)) && hasOut && required > 0) {
        let inMs = firstIn.time.getTime();
        let outMs = outPunch.time.getTime();
        if (row.strict_monitorings === 'Y') {
          inMs = Math.max(inMs, startMs);
          outMs = Math.min(outMs, endMs);
        }
        const workedMins = Math.max(0, Math.floor((outMs - inMs) / 60000));
        if (workedMins < required) {
          const prev = shortState[row.date];
          if (prev && prev.worked === workedMins) {
            nextShortState[row.date] = prev; // already scheduled or shown for these punches
          } else {
            const fireAt = Math.max(now + 2000, endMs + SHORT_ALERT_DELAY_MS);
            await Notifications.cancelScheduledNotificationAsync(shortId).catch(() => {});
            await schedule(shortId, '📝 Short hours today',
              `You worked ${fmtMins(workedMins)} today; ${fmtMins(required)} is required. Tap to apply for regularisation.`,
              new Date(fireAt), { type: 'SHORT_HOURS', date: row.date });
            nextShortState[row.date] = { worked: workedMins, fireAt };
          }
          continue;
        }
      }
      // Not (or no longer) short — e.g. checked back in after a break
      if (shortState[row.date] && shortState[row.date].fireAt > now) {
        await Notifications.cancelScheduledNotificationAsync(shortId).catch(() => {});
      } else if (shortState[row.date]) {
        nextShortState[row.date] = shortState[row.date]; // already shown — keep so it never repeats
      }
    }

    try { await AsyncStorage.setItem(SHORT_STATE_KEY(userId), JSON.stringify(nextShortState)); } catch (_) {}
  } catch (e) {
    console.log('[ShiftReminders] refresh failed', e?.message);
  }
};
