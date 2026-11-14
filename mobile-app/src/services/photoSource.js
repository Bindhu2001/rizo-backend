import { useEffect, useMemo, useState } from 'react';
import { IMAGE_ROOT, REVAMP_API_URL } from '../constants/Config';
import { getRevampToken, renewRevampToken } from './RevampApi';

// One place that turns an employee photo value into an <Image> source:
//  - a full link (https://..., data:, file:)            -> as it is
//  - a website photo '/uploads/<COMPANY>/<file>'          -> rizo-revamp /api/mobile/photo with the app's login
//    token (the website shows those files only to a signed-in user, never publicly)
//  - a rizo-revamp mobile route '/api/mobile/...'          -> that route with the login token (punch selfies)
//  - a legacy v1 file name / '/img/avatar/...'             -> the PHP server (IMAGE_ROOT)

let cachedToken = null;
let tokenRequest = null;
const listeners = new Set(); // every mounted usePhotoSource, told when the token is renewed
const setCachedToken = (t) => {
  cachedToken = t || null;
  listeners.forEach((fn) => fn(cachedToken));
  return cachedToken;
};
const loadToken = () => {
  if (cachedToken) return Promise.resolve(cachedToken);
  if (!tokenRequest) {
    tokenRequest = getRevampToken()
      .then(setCachedToken)
      .catch(() => null)
      .finally(() => { tokenRequest = null; });
  }
  return tokenRequest;
};

const isWebsitePhoto = (s) => s.startsWith('/uploads/') || s.startsWith('/api/mobile/');

/** The source for a photo value, or null when there is none (or a website photo while the token isn't known yet). */
export const photoSourceFor = (pic, token) => {
  const s = String(pic || '').trim();
  if (!s) return null;
  if (/^(https?:|data:|file:)/i.test(s)) return { uri: s };
  if (isWebsitePhoto(s)) {
    if (!token) return null;
    // k (a bit of the token, ignored by the server) changes the address when the token is renewed, so the
    // <Image> really loads again instead of keeping the failed result
    const uri = s.startsWith('/api/mobile/')
      ? `${REVAMP_API_URL}${s.slice('/api/mobile'.length)}?k=${token.slice(-8)}`
      : `${REVAMP_API_URL}/photo?src=${encodeURIComponent(s)}&k=${token.slice(-8)}`;
    return { uri, headers: { Authorization: `Bearer ${token}` } };
  }
  return { uri: `${IMAGE_ROOT}/${s.replace(/^\/+/, '')}` };
};

// The saved token lasts 30 days: when a website photo fails, sign in again once (at most every 10 minutes, so a
// photo that is really missing doesn't keep signing in) and every photo on screen retries with the new token.
let renewing = null;
let lastRenew = 0;
/**
 * Call from an <Image>'s onError with the source it used. Resolves true when the photo will load again with a
 * new token (keep waiting), false when it really failed (show the placeholder / initials).
 */
export const retryPhoto = async (source) => {
  const auth = source?.headers?.Authorization;
  if (!auth) return false; // not a website photo
  const used = auth.replace(/^Bearer /, '');
  if (!renewing) {
    if (cachedToken && used !== cachedToken) return true; // already renewed: the re-render uses the new token
    if (Date.now() - lastRenew < 10 * 60 * 1000) return false;
    lastRenew = Date.now();
    // at most 15 s: a sign-in that hangs must not leave photos waiting forever
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 15000));
    renewing = Promise.race([renewRevampToken(), timeout])
      .then((t) => (t ? setCachedToken(t) : cachedToken)) // a failed sign-in keeps the old token
      .catch(() => cachedToken)
      .finally(() => { renewing = null; });
  }
  const fresh = await renewing;
  return !!fresh && fresh !== used;
};

/** React hook: the <Image> source for a photo value (fetches the login token only when a website photo needs it). */
export const usePhotoSource = (pic) => {
  const s = String(pic || '').trim();
  const needsToken = isWebsitePhoto(s);
  const [token, setToken] = useState(cachedToken);
  useEffect(() => {
    if (!needsToken) return undefined;
    const onRenew = (t) => { if (t) setToken(t); };
    listeners.add(onRenew);
    if (!token) loadToken().then(onRenew);
    return () => { listeners.delete(onRenew); };
  }, [needsToken]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => photoSourceFor(s, token), [s, token]);
};
