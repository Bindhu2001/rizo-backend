import axios from 'axios';
import { format, isSameDay } from 'date-fns';
import { API_ENDPOINTS } from '../constants/Config';

// Upcoming events (birthdays, work anniversaries, holidays, week offs) from the upcoming_events
// API, shared by the Home calendar and the full month list so both read the same data the same way.

export const EVENT_COLORS = { BIR: '#E91E63', JOIN: '#2196F3', HO: '#FF9800', WO: '#4CAF50' };

/** The month's events (any of the response shapes the API has returned). */
export const fetchMonthEvents = async (userId, date) => {
  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('month', format(date, 'yyyy-MM'));
  const resp = await axios.post(API_ENDPOINTS.UPCOMING_EVENTS, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 12000,
  });
  if (resp.status !== 200) return [];
  const d = resp.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.data)) return d.data;
  if (d && typeof d === 'object') {
    for (const key of Object.keys(d)) {
      if (Array.isArray(d[key])) return d[key];
    }
  }
  return [];
};

export const normStatus = (s) => {
  const v = (s || '').replace(/^\/+/, '').toUpperCase().trim();
  if (v === 'BIRTHDAY' || v === 'BDAY') return 'BIR';
  if (v === 'ANNIVERSARY' || v === 'JOINING' || v === 'WORK_ANNIVERSARY' || v === 'JOIN') return 'JOIN';
  if (v === 'HOLIDAY' || v === 'PUBLIC_HOLIDAY') return 'HO';
  if (v === 'WEEKOFF' || v === 'WEEK_OFF' || v === 'WEEK OFF' || v === 'OFF') return 'WO';
  return v;
};

/** Colour, label and display name for one event row. */
export const eventMeta = (e) => {
  const ns = normStatus(e.status || e.type || e.event_type);
  const kind = ['BIR', 'HO', 'WO'].includes(ns) ? ns : 'JOIN';
  const label = e.type || { BIR: 'Birthday', HO: 'Holiday', WO: 'Week Off', JOIN: 'Work Anniversary' }[kind];
  const name = e.name || e.employee_name || e.title || e.event_name || e.description || 'Unknown';
  return { kind, color: EVENT_COLORS[kind], label, name };
};

/** The events that fall on `day` (dates come as "May-15", "15-May", "05-15", full dates, or a day number). */
export const eventsOnDay = (events, day) => {
  if (!day) return [];
  const dayNumber = parseInt(format(day, 'd'), 10);
  const dayMonthName = format(day, 'MMMM');
  const dayMonthShort = format(day, 'MMM');
  const monthNum = parseInt(format(day, 'M'), 10);

  try {
    return events.filter(e => {
      if (!e) return false;
      const rawDate = e.date || e.event_date || e.birth_date || e.birthday_date || e.joining_date || e.anniversary_date;
      if (!rawDate) return false;

      const dm = String(rawDate).trim();

      if (dm.includes('-')) {
        const parts = dm.split('-');
        if (parts.length === 2) {
          const p0 = parts[0].trim();
          const p1 = parts[1].trim();
          // "Month-Day" e.g. "May-15"
          if (isNaN(parseInt(p0, 10))) {
            return (p0 === dayMonthName || p0 === dayMonthShort) && parseInt(p1, 10) === dayNumber;
          }
          // "Day-Month" e.g. "15-May"
          if (isNaN(parseInt(p1, 10))) {
            return (p1 === dayMonthName || p1 === dayMonthShort) && parseInt(p0, 10) === dayNumber;
          }
          // "MM-DD" e.g. "05-15"
          return parseInt(p0, 10) === monthNum && parseInt(p1, 10) === dayNumber;
        } else if (parts.length === 3) {
          // Try YYYY-MM-DD
          try {
            const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10), c = parseInt(parts[2], 10);
            if (a > 31) {
              // YYYY-MM-DD
              return isSameDay(new Date(a, b - 1, c), day);
            } else if (c > 31) {
              // DD-MM-YYYY
              return isSameDay(new Date(c, b - 1, a), day);
            } else {
              // ambiguous — try both
              try { if (isSameDay(new Date(dm), day)) return true; } catch (_) {}
              return isSameDay(new Date(c, b - 1, a), day);
            }
          } catch (_) { return false; }
        }
      }

      if (dm.includes('/')) {
        const parts = dm.split('/');
        if (parts.length === 3) {
          const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10), c = parseInt(parts[2], 10);
          if (a > 31) return isSameDay(new Date(a, b - 1, c), day); // YYYY/MM/DD
          if (c > 31) return isSameDay(new Date(c, b - 1, a), day); // DD/MM/YYYY
          // MM/DD/YYYY — ambiguous, try DD/MM first
          return isSameDay(new Date(c, b - 1, a), day) || isSameDay(new Date(c, a - 1, b), day);
        }
      }

      return parseInt(dm, 10) === dayNumber;
    });
  } catch (err) {
    console.error('[Calendar] Filter error', err);
    return [];
  }
};
