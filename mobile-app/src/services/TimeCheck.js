import axios from 'axios';
import { API_ENDPOINTS } from '../constants/Config';

const MAX_DRIFT_SEC = 120;

// HEAD any reachable endpoint; the HTTP `Date` response header is the
// authoritative server time. `validateStatus: () => true` so we still read
// headers even on 404/405 responses.
const fetchServerTimeMs = async () => {
  try {
    const res = await axios.head(API_ENDPOINTS.AUTH, {
      timeout: 6000,
      validateStatus: () => true,
    });
    const dateHeader = res.headers?.date || res.headers?.Date;
    const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
    return isFinite(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
};

// Returns { ok: true } if device clock is in sync (or offline — can't verify).
// Returns { ok: false, message } if drift > MAX_DRIFT_SEC vs server.
export const verifyDeviceClock = async () => {
  const serverMs = await fetchServerTimeMs();
  if (serverMs === null) return { ok: true };
  const driftSec = Math.round(Math.abs(Date.now() - serverMs) / 1000);
  if (driftSec > MAX_DRIFT_SEC) {
    return {
      ok: false,
      message: 'Please enable "Automatic date & time" in your phone Settings and try again.',
    };
  }
  return { ok: true };
};
