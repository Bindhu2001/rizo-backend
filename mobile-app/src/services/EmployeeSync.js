import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';
import { clearUserSession, updateUserProfileLocal } from './LocalDB';

const DEVICE_IMEI_KEY = 'DEVICE_IMEI';

// Pulls the latest employee record from the server and validates that the
// imei stored against the user still matches this device. If the imei has
// been re-registered on another device, force a logout.
//
// Returns:
//   updated user object on success
//   null on network failure (caller keeps existing user)
//   null after triggering a forced logout on imei mismatch
export const syncEmployeeDetails = async (user, navigation) => {
  if (!user?.user_id) return null;
  try {
    const res = await axios.get(
      `${API_ENDPOINTS.GET_EMPLOYEE_FULL_DETAILS}?user_id=${encodeURIComponent(user.user_id)}`,
      { timeout: 8000 }
    );
    const ok = res.data?.success === 1 || res.data?.success === true;
    if (!ok || !res.data?.data) return null;
    const data = res.data.data;

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

    console.log(`[Sync] Comparing Device ID: ${deviceImei} with Server ID: ${serverImei}`);

    if (deviceImei && serverImei && deviceImei !== serverImei) {
      console.log('[Sync] Device ID mismatch! Triggering forced logout...');
      await clearUserSession();
      navigation?.reset?.({ index: 0, routes: [{ name: 'Login' }] });
      return null;
    }

    const updatedUser = {
      ...user,
      ...data,
      name: data.name || user.name,
      employee_name: data.name || data.employee_name || user.employee_name,
    };

    // PERSIST to local SQLite so that other screens loading from DB get the fresh name
    try {
      await updateUserProfileLocal(user.user_id, updatedUser);
    } catch (e) {
      console.log('[Sync] Local DB update skipped', e.message);
    }

    return updatedUser;
  } catch (_) {
    return null;
  }
};
