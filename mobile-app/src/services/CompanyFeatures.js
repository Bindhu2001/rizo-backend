import { useEffect, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';

// Is the signed-in user's company on the new Rizo server? The SERVER decides (v1 RizoController $doCompanyCodes,
// POST newapp/app_features → { rizo_new }); the app keeps no company list, so adding a company needs no app build.
// "Rizo new" companies get the new salary slip, approvals and Advance & Loan on rizo-revamp, the audit trail,
// bill reading, punch selfies and Assets & Documents; the others keep the app as before.
//
//   - Asked on every start (SplashScreen) and at login (LoginScreen); the answer is saved, so it works offline.
//   - The call failing (offline, server busy) keeps the last answer. No answer yet for this user = not "Rizo new"
//     (the old behaviour) until one arrives; screens using useRizoNew() then redraw.
//   - Sign-up has no login yet: it learns the same answer from newapp/countries (services/SignupScan.js).

const KEY = 'company_features';
let saved = null; // { userId (upper case), rizoNew }
let reading = null;
const listeners = new Set();
const inflight = new Map();

const norm = (id) => String(id || '').trim().toUpperCase();
const truthy = (v) => v === 1 || v === '1' || v === true || v === 'true';

const loadSaved = () => {
  if (!reading) {
    reading = AsyncStorage.getItem(KEY)
      .then((s) => {
        const v = s ? JSON.parse(s) : null;
        if (!saved && v && v.userId) saved = { userId: norm(v.userId), rizoNew: !!v.rizoNew };
      })
      .catch(() => {});
  }
  return reading;
};
loadSaved();

const publish = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* a screen gone */ } });

/** The saved answer for this user (false when there is none yet) — for render code */
export const isRizoNew = (userId) => !!saved && !!userId && saved.userId === norm(userId) && saved.rizoNew;

/** Ask the server again for this user; resolves to the answer (the last saved one when the call fails) */
export const refreshCompanyFeatures = (userId, timeoutMs = 10000) => {
  const id = norm(userId);
  if (!id) return Promise.resolve(false);
  if (inflight.has(id)) return inflight.get(id);
  const job = (async () => {
    await loadSaved();
    try {
      const res = await axios.post(API_ENDPOINTS.APP_FEATURES, { user_id: String(userId).trim() }, { timeout: timeoutMs });
      const d = res.data?.data;
      if (truthy(res.data?.success) && d && typeof d === 'object' && 'rizo_new' in d) {
        const rizoNew = truthy(d.rizo_new);
        const changed = !saved || saved.userId !== id || saved.rizoNew !== rizoNew;
        saved = { userId: id, rizoNew };
        AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => {});
        if (changed) publish();
      }
    } catch (_) { /* offline / server: keep the last answer */ }
    return isRizoNew(id);
  })();
  inflight.set(id, job);
  job.finally(() => inflight.delete(id)).catch(() => {});
  return job;
};

/** The answer for this user, waiting for the saved one (and asking the server when there is none) — for async code */
export const rizoNewFor = async (userId) => {
  if (!userId) return false;
  await loadSaved();
  if (saved && saved.userId === norm(userId)) return saved.rizoNew;
  return refreshCompanyFeatures(userId, 8000);
};

/** isRizoNew for a screen: redraws when the answer arrives or changes */
export const useRizoNew = (userId) => {
  const [, redraw] = useState(0);
  useEffect(() => {
    let live = true;
    const fn = () => { if (live) redraw((n) => n + 1); };
    listeners.add(fn);
    loadSaved().then(() => {
      fn();
      if (userId && !(saved && saved.userId === norm(userId))) refreshCompanyFeatures(userId).catch(() => {});
    });
    return () => { live = false; listeners.delete(fn); };
  }, [userId]);
  return isRizoNew(userId);
};

// Tests only
export const __resetCompanyFeatures = () => { saved = null; reading = null; inflight.clear(); listeners.clear(); };
