// Which shift date a punch belongs to, and whether the next punch is IN or OUT — a copy of the
// server's device_attandance BEFORE INSERT trigger, so the Check In / Check Out button, the shift
// reminders and the short-hours alert agree with what the server records:
//   - a night shift (isnextday = 1) keeps early-morning punches on the previous day's shift date,
//     within off_duty ± max_in_time (default 60) / max_out_time (default 120) minutes;
//   - mobile/web punches alternate within a shift date: the first is IN, then OUT, IN, ...
// Shift data per date comes from the shift_schedule API (planner shift, else the standing shift).

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
// Local time on a date: '2026-10-28' + '06:00' → Date
const at = (dateStr, hhmm) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = String(hhmm || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0, 0, 0);
};
const minutesToMidnight = (hhmm) => {
  const [h, mi] = String(hhmm || '00:00').split(':').map(Number);
  return 24 * 60 - ((h || 0) * 60 + (mi || 0));
};

// A date with no schedule row behaves like a normal day shift → punches stay on their calendar date
const DEFAULT_SHIFT = { on_duty: '09:00', off_duty: '18:00', isnextday: 0, max_in_time: null, max_out_time: null };

const shiftOn = (schedule, dateStr) => {
  const row = (schedule || []).find((r) => r.date === dateStr);
  if (!row || !row.off_duty) return DEFAULT_SHIFT;
  return {
    on_duty: row.on_duty || row.shift_start || DEFAULT_SHIFT.on_duty,
    off_duty: row.off_duty,
    isnextday: Number(row.isnextday ?? (row.crosses_midnight ? 1 : 0)) === 1 ? 1 : 0,
    max_in_time: row.max_in_time,
    max_out_time: row.max_out_time,
  };
};

// Direction of the last earlier punch on a given shift date ('in' / 'out' / null)
const lastDirOn = (prior, shiftDate) => {
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i].shiftDate === shiftDate) return String(prior[i].type).toLowerCase();
  }
  return null;
};

/** Shift date ('YYYY-MM-DD') for a punch at `time`, given the earlier punches (with shiftDate). */
export const resolveShiftDate = (time, prior, schedule) => {
  const T = time.getTime();
  const D = ymd(time);
  const prevDate = addDays(D, -1);
  const nextDate = addDays(D, 1);
  const prev = shiftOn(schedule, prevDate);
  const cur = shiftOn(schedule, D);
  const next = shiftOn(schedule, nextDate);

  const curMaxIn = cur.max_in_time ?? 60;
  const curOff = at(cur.isnextday ? nextDate : D, cur.off_duty).getTime();
  const curMaxOut = cur.isnextday ? (cur.max_out_time ?? 120) : minutesToMidnight(cur.off_duty);

  const currentDayRule = () => {
    if (T > curOff + curMaxOut * MIN) return nextDate;
    if (T <= curOff - curMaxIn * MIN) return D;
    if (lastDirOn(prior, D) === 'in') return D;
    if (T > at(nextDate, next.on_duty).getTime() - 120 * MIN) return nextDate;
    return D;
  };

  if (prev.isnextday === 1) {
    // Yesterday's night shift ends today
    const prevOff = at(D, prev.off_duty).getTime();
    const prevMaxIn = prev.max_in_time ?? 60;
    const prevMaxOut = prev.max_out_time ?? 120;
    if (T > prevOff + prevMaxOut * MIN) return currentDayRule();
    if (T <= prevOff - prevMaxIn * MIN) return prevDate;
    if (lastDirOn(prior, prevDate) === 'in') return prevDate;
    return currentDayRule();
  }
  return currentDayRule();
};

/**
 * Punches (any order; { punch_time, type, ... }) → sorted by time, each with shiftDate.
 * Uses the punch's own IN/OUT for the "last direction" checks, like the trigger reads C1.
 */
export const assignShiftDates = (punches, schedule) => {
  const sorted = [...(punches || [])]
    .map((p) => ({ ...p, time: new Date(p.punch_time) }))
    .filter((p) => !isNaN(p.time.getTime()))
    .sort((a, b) => a.time - b.time);
  const out = [];
  for (const p of sorted) out.push({ ...p, shiftDate: resolveShiftDate(p.time, out, schedule) });
  return out;
};

/**
 * What the next punch at `now` would be: its shift date and IN/OUT (first punch of a shift date is
 * IN, then alternating), plus that shift date's punches so far.
 */
export const nextPunch = (now, punches, schedule) => {
  const assigned = assignShiftDates(punches, schedule);
  const shiftDate = resolveShiftDate(now, assigned, schedule);
  const onShift = assigned.filter((p) => p.shiftDate === shiftDate);
  const last = onShift[onShift.length - 1];
  const direction = !last ? 'IN' : (String(last.type).toUpperCase() === 'IN' ? 'OUT' : 'IN');
  return { shiftDate, direction, onShift };
};

export const SHIFT_DATE_LOOKBACK_MS = 3 * DAY;
