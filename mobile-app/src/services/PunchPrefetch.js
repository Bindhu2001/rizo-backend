import axios from 'axios';
import * as Network from 'expo-network';
import * as Location from 'expo-location';
import { API_ENDPOINTS } from '../constants/Config';
import { savePunchConfig, getPunchConfig } from './LocalDB';

// A GPS fix this recent is good enough for the 100 m office check
const RECENT_FIX_MAX_AGE_MS = 60 * 1000;

let inflightConfig = null; // shared by Splash + Home so they never fetch twice at once
let lastFix = null;

const fetchPunchConfig = async (userId) => {
  let data = null;
  let serverTimeMs = null;

  // Last config saved while online — used only when offline or the API call fails
  const loadLocal = async () => {
    try {
      const cached = await getPunchConfig(userId);
      return cached ? cached.data : null;
    } catch (_) {
      return null;
    }
  };

  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (!net?.isConnected) {
    console.log('[PunchPrefetch] offline — using LocalDB config');
    return { data: await loadLocal(), serverTimeMs };
  }

  // Online → always ask the server so an admin punch-type / office change applies at once
  try {
    const res = await axios.post(
      `${API_ENDPOINTS.EMPLOYEE_PUNCH_DETAILS}?user_id=${encodeURIComponent(userId)}`,
      null,
      { timeout: 6000 },
    );
    const dateHeader = res.headers?.date || res.headers?.Date;
    if (dateHeader) {
      const parsed = Date.parse(dateHeader);
      if (isFinite(parsed)) serverTimeMs = parsed;
    }
    const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const ok = body?.status === true || body?.status === 1 || body?.status === '1' || body?.success === 1;
    if (ok && body?.data) {
      data = body.data;
      try { await savePunchConfig(userId, data); } catch (_) {}
      console.log('[PunchPrefetch] punch config refreshed from server');
    }
  } catch (e) {
    console.log('[PunchPrefetch] fetch failed — using LocalDB config', e?.message);
  }
  if (!data) data = await loadLocal();
  return { data, serverTimeMs };
};

// Returns { data, serverTimeMs }. Online → fetched from the server every time and
// saved to LocalDB; offline (or the call fails) → the last saved LocalDB copy.
// serverTimeMs is set only when this call actually hit the server.
export const loadPunchConfig = (userId) => {
  if (!inflightConfig) {
    inflightConfig = fetchPunchConfig(userId).finally(() => { inflightConfig = null; });
  }
  return inflightConfig;
};

// Start a GPS fix early (Splash) so the office check at punch time has one ready.
// Never asks for permission — the location disclosure on Home owns that.
export const warmUpLocation = async () => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    rememberFix(loc);
  } catch (_) {}
};

export const rememberFix = (loc) => {
  if (loc?.coords) lastFix = loc;
};

// A GPS fix no older than 60 s (from the warm-up or the OS cache), or null.
export const getRecentFix = async () => {
  const isRecent = (l) => l?.coords && Math.abs(Date.now() - l.timestamp) <= RECENT_FIX_MAX_AGE_MS;
  if (isRecent(lastFix)) return lastFix;
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: RECENT_FIX_MAX_AGE_MS });
    if (isRecent(lastKnown)) return lastKnown;
  } catch (_) {}
  return null;
};
