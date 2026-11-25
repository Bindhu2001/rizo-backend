// Resolves coordinates to a street address for a batch of offline punches / visits.
//
// Why: iOS reverseGeocodeAsync (CLGeocoder) allows only ~50 lookups a minute.
// Looking up every punch separately made punches after the ~50th fail and be
// posted with the "Lat:, Lng:" fallback. This resolver
//   1. looks each place up once (cache by coordinates rounded to ~11 m; lookups of
//      the same place already in flight share one request),
//   2. runs lookups one at a time (a screen full of cards can't fire 75 at once), and
//   3. stops calling the geocoder after repeated failures (throttled/offline), so
//      the caller can keep those items pending and retry later. cooldownMs > 0
//      lets a long-lived resolver (the Visits screen) try again after a pause;
//      a per-sync resolver leaves it 0 (a new one is made for the next sync).
// geocodeFn is injected so this stays unit-testable outside React Native.

const coordKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

const formatAddress = (r) => {
  const parts = [r.name, r.street, r.district || r.subregion, r.city || r.locality, r.region, r.postalCode].filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)].join(', ') : null;
};

// An address that is only a placeholder / coordinate text still needs a real lookup
const isUnresolvedAddress = (address) =>
  !address || address === 'Location Attached' || address === 'Resolving location…' || address === 'Unable to fetch location'
  || address === 'Unknown Location' || address.startsWith('Lat:');

const createAddressResolver = (geocodeFn, { maxConsecutiveFailures = 2, cooldownMs = 0, nowFn = Date.now } = {}) => {
  const cache = new Map();
  const inflight = new Map();
  let consecutiveFailures = 0;
  let lastFailureAt = 0;
  let queue = Promise.resolve();

  const isThrottled = () => {
    if (consecutiveFailures < maxConsecutiveFailures) return false;
    if (cooldownMs > 0 && nowFn() - lastFailureAt >= cooldownMs) { consecutiveFailures = 0; return false; }
    return true;
  };

  const lookup = async (lat, lng, key) => {
    if (cache.has(key)) return cache.get(key);
    if (isThrottled()) return null; // throttled — don't hammer the geocoder
    try {
      const geo = await geocodeFn({ latitude: lat, longitude: lng });
      const address = geo && geo.length > 0 ? formatAddress(geo[0]) : null;
      consecutiveFailures = 0;
      if (address) cache.set(key, address);
      return address;
    } catch (_) {
      consecutiveFailures += 1;
      lastFailureAt = nowFn();
      return null;
    }
  };

  return {
    // Returns the address string, or null if it could not be resolved (yet)
    resolve: (lat, lng) => {
      const key = coordKey(lat, lng);
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      if (inflight.has(key)) return inflight.get(key);
      const run = queue.then(() => lookup(lat, lng, key));
      queue = run.catch(() => {});
      inflight.set(key, run);
      run.finally(() => inflight.delete(key));
      return run;
    },
    get throttled() { return isThrottled(); },
  };
};

module.exports = { createAddressResolver, isUnresolvedAddress, coordKey };
