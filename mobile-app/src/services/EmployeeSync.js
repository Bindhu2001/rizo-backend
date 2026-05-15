import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../constants/Config';
import { clearUserSession } from './LocalDB';

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
    const serverImei = data.imei != null && data.imei !== '' ? String(data.imei) : null;
    if (deviceImei && serverImei && deviceImei !== serverImei) {
      await clearUserSession();
      navigation?.reset?.({ index: 0, routes: [{ name: 'Login' }] });
      return null;
    }

    return {
      ...user,
      ...data,
      employee_name: data.name || data.employee_name || user.employee_name,
    };
  } catch (_) {
    return null;
  }
};
