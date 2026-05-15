import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';
import { clearUserSession, updateUserProfileLocal } from './LocalDB';

const DEVICE_IMEI_KEY = 'DEVICE_IMEI';

const safeJson = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };

// Fetches the latest employee record from the server.
// Always returns full profile data (name, designation, etc.).
// If skipImeiCheck is false (default), also validates the IMEI:
//   - If IMEI mismatches → clears session and redirects to Login.
//
// Returns:
//   updated user object on success (even if IMEI check is skipped)
//   null on network failure
//   null after triggering a forced logout on IMEI mismatch
export const syncEmployeeDetails = async (user, navigation, skipImeiCheck = false) => {
  if (!user?.user_id) return null;
  try {
    const res = await axios.get(
      `${API_ENDPOINTS.GET_EMPLOYEE_FULL_DETAILS}?user_id=${encodeURIComponent(user.user_id)}`,
      { timeout: 8000 }
    );
    const body = typeof res.data === 'string' ? safeJson(res.data) : res.data;
    const s = body?.success ?? body?.status;
    const ok = s === 1 || s === true || s === '1' || s === 'true';
    // Accept body.data OR fall back to body itself if name lives at the root.
    const data = (body?.data && typeof body.data === 'object') ? body.data
                 : (body?.name ? body : null);
    if (!ok || !data) {
      console.log('[Sync] get_employee_full_details rejected', {
        success: s,
        keys: body ? Object.keys(body).slice(0, 10) : null,
        raw: typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data).slice(0, 200),
      });
      return null;
    }
    console.log('[Sync] got details for', user.user_id, '→ name:', data.name, 'joining:', data.joining_date);

    // ── IMEI check (only when not skipped, e.g. on HomeScreen) ──────────────
    if (!skipImeiCheck) {
      const deviceImei = await AsyncStorage.getItem(DEVICE_IMEI_KEY);
      const rawImei = data.imei;
      let serverImei = null;
      if (rawImei != null) {
        if (typeof rawImei === 'object' && rawImei.imei_number) {
          serverImei = String(rawImei.imei_number);
        } else if (typeof rawImei === 'string' || typeof rawImei === 'number') {
          serverImei = String(rawImei);
        }
      }
      if (serverImei === '') serverImei = null;

      console.log(`[Sync] Device ID: ${deviceImei} | Server ID: ${serverImei}`);

      if (deviceImei && serverImei && deviceImei !== serverImei) {
        console.log('[Sync] IMEI mismatch — forcing logout');
        await clearUserSession();
        // Walk up to the root navigator so 'Login' (in root stack) is reachable
        // from screens inside the Tab navigator.
        let root = navigation;
        while (root?.getParent?.()) root = root.getParent();
        try {
          root?.reset?.({ index: 0, routes: [{ name: 'Login' }] });
        } catch (err) {
          console.log('[Sync] reset to Login failed:', err?.message);
        }
        return null;
      }
    }

    // ── Build updated user object ────────────────────────────────────────────
    const updatedUser = {
      ...user,
      ...data,
      name: data.name || user.name,
      employee_name: data.name || data.employee_name || user.employee_name,
    };

    // Persist to local SQLite so offline and other screens get fresh data
    try {
      await updateUserProfileLocal(user.user_id, updatedUser);
    } catch (e) {
      console.log('[Sync] Local DB update skipped:', e.message);
    }

    return updatedUser;
  } catch (e) {
    console.log('[Sync] Network error:', e.message);
    return null;
  }
};

