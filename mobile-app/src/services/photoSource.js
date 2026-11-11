import { useEffect, useMemo, useState } from 'react';
import { IMAGE_ROOT, REVAMP_API_URL } from '../constants/Config';
import { getRevampToken } from './RevampApi';

// One place that turns an employee photo value into an <Image> source:
//  - a full link (https://..., data:, file:)            -> as it is
//  - a website photo '/uploads/<COMPANY>/<file>'          -> rizo-revamp /api/mobile/photo with the app's login
//    token (the website shows those files only to a signed-in user, never publicly)
//  - a legacy v1 file name / '/img/avatar/...'             -> the PHP server (IMAGE_ROOT)

let cachedToken = null;
let tokenRequest = null;
const loadToken = () => {
  if (cachedToken) return Promise.resolve(cachedToken);
  if (!tokenRequest) {
    tokenRequest = getRevampToken()
      .then((t) => { cachedToken = t || null; return cachedToken; })
      .catch(() => null)
      .finally(() => { tokenRequest = null; });
  }
  return tokenRequest;
};

const isWebsitePhoto = (s) => s.startsWith('/uploads/');

/** The source for a photo value, or null when there is none (or a website photo while the token isn't known yet). */
export const photoSourceFor = (pic, token) => {
  const s = String(pic || '').trim();
  if (!s) return null;
  if (/^(https?:|data:|file:)/i.test(s)) return { uri: s };
  if (isWebsitePhoto(s)) {
    if (!token) return null;
    return { uri: `${REVAMP_API_URL}/photo?src=${encodeURIComponent(s)}`, headers: { Authorization: `Bearer ${token}` } };
  }
  return { uri: `${IMAGE_ROOT}/${s.replace(/^\/+/, '')}` };
};

/** React hook: the <Image> source for a photo value (fetches the login token only when a website photo needs it). */
export const usePhotoSource = (pic) => {
  const s = String(pic || '').trim();
  const needsToken = isWebsitePhoto(s);
  const [token, setToken] = useState(cachedToken);
  useEffect(() => {
    let alive = true;
    if (needsToken && !token) loadToken().then((t) => { if (alive && t) setToken(t); });
    return () => { alive = false; };
  }, [needsToken, token]);
  return useMemo(() => photoSourceFor(s, token), [s, token]);
};
