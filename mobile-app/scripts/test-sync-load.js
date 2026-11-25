// Load test for SyncService.syncAttendance: 200+ punches queued offline, then synced.
// Runs the REAL SyncService.js with a mocked DB / server / iOS-style geocoder
// (50 lookups per rolling 60 s, then it throws). Run: node scripts/test-sync-load.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src', 'services');

// ---- virtual clock (geocoder limit is per minute; HomeScreen retries every 30 s)
let now = Date.parse('2026-11-25T10:00:00Z');
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [now])); }
  static now() { return now; }
}

// ---- scenario state
let rows, posts, geocodeCalls, geocodeTimes, geocodeMode;

const mockLocation = {
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 9.9926, longitude: 76.31503 } }),
  getLastKnownPositionAsync: async () => null,
  reverseGeocodeAsync: async ({ latitude, longitude }) => {
    geocodeCalls++;
    if (geocodeMode === 'broken') throw new Error('kCLErrorDomain error 2');
    geocodeTimes = geocodeTimes.filter((t) => now - t < 60000);
    if (geocodeMode !== 'android' && geocodeTimes.length >= 50) throw new Error('kCLErrorDomain error 2 (throttled)');
    geocodeTimes.push(now);
    return [{ name: `Plot ${latitude.toFixed(4)}`, street: 'MG Road', city: 'Kochi', region: 'Kerala' }];
  },
};

let visitRows = [], visitPosts = [];
// client_visits statements run on a real SQLite table filled from visitRows (and read back into it), so the SQL of the
// visit sync is really executed. The step-by-step scenarios are in test-visit-steps-load.js.
const { DatabaseSync } = require('node:sqlite');
const VISIT_COLS = ['id', 'user_id', 'client_name', 'contact_number', 'contact_person', 'purpose', 'location', 'latitude', 'longitude', 'start_time', 'step_in_time',
  'step_in_lat', 'step_in_lng', 'step_in_address', 'end_time', 'end_lat', 'end_lng', 'end_address', 'status', 'sync_status', 'created_at', 'start_synced', 'step_in_synced',
  'end_synced', 'start_offline', 'step_in_offline', 'end_offline'];
const visitSql = (method, sql, params = []) => {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE client_visits (${VISIT_COLS.map((c) => `${c} TEXT`).join(', ')})`);
  const ins = d.prepare(`INSERT INTO client_visits VALUES (${VISIT_COLS.map(() => '?').join(', ')})`);
  visitRows.forEach((r) => ins.run(...VISIT_COLS.map((c) => (r[c] === undefined || r[c] === null ? null : String(r[c])))));
  const result = d.prepare(sql)[method](...params);
  if (method === 'run') d.prepare('SELECT * FROM client_visits').all().forEach((r) => Object.assign(visitRows.find((v) => v.id === r.id), r));
  d.close();
  return result;
};
const mockDb = {
  getAllAsync: async (sql, params) => {
    if (/client_visits/.test(sql)) return visitSql('all', sql, params).map((r) => ({ ...r }));
    return !/FROM attendance/.test(sql) ? [] : rows.filter((r) => r.sync_status === 'PENDING').map((r) => ({ ...r }));
  },
  getFirstAsync: async (sql, params) => (/client_visits/.test(sql) ? { ...visitSql('get', sql, params) } : { emp_pkey: 7 }),
  runAsync: async (sql, params) => {
    const id = params[params.length - 1];
    if (/client_visits/.test(sql)) { visitSql('run', sql, params); return; }
    const row = rows.find((r) => r.id === id);
    if (/SET sync_status = 'SYNCED'/.test(sql)) row.sync_status = 'SYNCED';
    else if (/SET address = \?/.test(sql)) row.address = params[0];
    else if (/SET latitude/.test(sql)) { row.latitude = params[0]; row.longitude = params[1]; row.address = params[2]; }
  },
};

const mockAxios = {
  post: async (url, body) => {
    if (/^v\?/.test(url)) { visitPosts.push(body); return { data: { ok: true } }; }
    const list = JSON.parse(body.login_auditor);
    posts.push(list);
    return { data: { ok: true } };
  },
};

// ---- load the real SyncService.js (ESM -> CJS by regex; imports replaced by mocks)
const modules = {
  axios: mockAxios,
  'expo-network': { getNetworkStateAsync: async () => ({ isConnected: true }) },
  './LocalDB': { initDB: async () => mockDb },
  '../constants/Config': { API_ENDPOINTS: { SWIPE: 'swipe', VISIT_SYNC: 'v', LEAVES: 'l' } },
  'expo-location': mockLocation,
  './NotificationManager': { checkStatusChanges: async () => {} },
  './PunchSelfie': { syncPunchSelfies: async () => {} },
};
const load = () => {
  const resolverSrc = fs.readFileSync(path.join(SRC, 'AddressResolver.js'), 'utf8');
  const resolverMod = { exports: {} };
  new Function('module', 'exports', resolverSrc)(resolverMod, resolverMod.exports);
  modules['./AddressResolver'] = resolverMod.exports;

  let src = fs.readFileSync(path.join(SRC, 'SyncService.js'), 'utf8');
  src = src
    .replace(/import \* as (\w+) from '([^']+)';/g, "const $1 = __req('$2');")
    .replace(/import (\w+) from '([^']+)';/g, "const $1 = __req('$2');")
    .replace(/import \{([^}]+)\} from '([^']+)';/g, "const {$1} = __req('$2');")
    .replace('export default SyncService;', 'module.exports = SyncService;');
  const mod = { exports: {} };
  vm.runInNewContext(src, {
    module: mod, __req: (n) => modules[n], console: process.env.DBG ? console : { log() {}, error() {} },
    Promise, setTimeout, clearTimeout, Math, JSON, Date: FakeDate, parseInt, parseFloat, Object, Set, Map, Error,
  });
  return mod.exports;
};

// ---- helpers
const makePunches = (n, { distinct = 1, address = 'Lat: 9.99260, Lng: 76.31503' } = {}) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const place = i % distinct;
    out.push({
      id: `p${i}`, user_id: 'U1', type: i % 2 === 0 ? 'IN' : 'OUT',
      punch_time: new RealDate(Date.parse('2026-11-23T11:36:00Z') + i * 1000).toISOString(),
      latitude: 9.9 + place * 0.001, longitude: 76.3 + place * 0.001,
      address: typeof address === 'function' ? address(i) : address, is_offline: 1, sync_status: 'PENDING',
    });
  }
  return out;
};
const reset = (punches, mode = 'ok') => { rows = punches; visitRows = []; visitPosts = []; posts = []; geocodeCalls = 0; geocodeTimes = []; geocodeMode = mode; };
// Simulates the HomeScreen retry timer: sync every 30 s until nothing is pending
const syncUntilDone = async (maxRuns = 20) => {
  const SyncService = load();
  let runs = 0;
  while ((rows.some((r) => r.sync_status === 'PENDING') || visitRows.some((r) => r.sync_status === 'PENDING')) && runs < maxRuns) {
    await SyncService.runSync({ attendance: [], visits: [] });
    runs++;
    now += 30000;
  }
  return runs;
};
const sent = () => posts.flat();
const withAddress = () => sent().filter((x) => !/Lat:/.test(x.locationName)).length;
const assertOrder = () => {
  const t = sent().map((x) => x.time_check);
  assert.deepStrictEqual(t, [...t].sort(), 'punches must reach the server in time order');
  assert.strictEqual(new Set(t).size, t.length, 'no duplicate punches');
};

(async () => {
  const results = [];
  const run = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };

  await run('A: 250 offline punches, one location -> 1 lookup, all addresses, 5 batches', async () => {
    reset(makePunches(250));
    const runs = await syncUntilDone();
    assert.strictEqual(runs, 1);
    assert.strictEqual(geocodeCalls, 1);
    assert.strictEqual(sent().length, 250);
    assert.strictEqual(withAddress(), 250);
    assert.deepStrictEqual(posts.map((p) => p.length), [50, 50, 50, 50, 50]);
    assertOrder();
  });

  await run('B: 300 offline punches at 120 different places (iOS 50/min limit) -> all get an address', async () => {
    reset(makePunches(300, { distinct: 120 }));
    const runs = await syncUntilDone();
    assert.strictEqual(sent().length, 300, 'all synced');
    assert.strictEqual(withAddress(), 300, 'all with real address');
    assert.ok(rows.every((r) => r.sync_status === 'SYNCED'));
    assertOrder();
    console.log(`     (took ${runs} sync runs, ${geocodeCalls} geocoder calls incl. throttled)`);
  });

  await run('C: geocoder permanently broken -> after retries punches still sync (Lat/Lng text), none lost', async () => {
    reset(makePunches(220, { distinct: 60 }), 'broken');
    const runs = await syncUntilDone();
    assert.strictEqual(sent().length, 220);
    assert.ok(rows.every((r) => r.sync_status === 'SYNCED'));
    assert.strictEqual(withAddress(), 0);
    assertOrder();
    console.log(`     (took ${runs} sync runs)`);
  });

  await run('D: online punches already have address -> no geocoding, 210 sent in 5 batches', async () => {
    reset(makePunches(210, { distinct: 30, address: (i) => `Addr ${i}` }));
    const runs = await syncUntilDone();
    assert.strictEqual(runs, 1);
    assert.strictEqual(geocodeCalls, 0);
    assert.deepStrictEqual(posts.map((p) => p.length), [50, 50, 50, 50, 10]);
    assertOrder();
  });

  await run('E: "Resolving location…" placeholder with coords is looked up, not sent as address', async () => {
    reset(makePunches(40, { distinct: 3, address: 'Resolving location…' }));
    await syncUntilDone();
    assert.strictEqual(sent().filter((x) => /Resolving/.test(x.locationName)).length, 0);
    assert.strictEqual(withAddress(), 40);
  });

  await run('F: server fails mid-backlog -> later batches stay PENDING, resend later with no duplicates', async () => {
    reset(makePunches(150));
    let calls = 0;
    const realPost = mockAxios.post;
    mockAxios.post = async (u, b) => { if (++calls === 2) throw new Error('timeout'); return realPost(u, b); };
    const SyncService = load();
    await SyncService.runSync({ attendance: [], visits: [] });
    assert.strictEqual(rows.filter((r) => r.sync_status === 'SYNCED').length, 50);
    mockAxios.post = realPost;
    await SyncService.runSync({ attendance: [], visits: [] });
    assert.ok(rows.every((r) => r.sync_status === 'SYNCED'));
    assert.strictEqual(sent().length, 150);
    assertOrder();
  });

  // Real-life sequence: 1 online punch -> offline (150 punches) -> back online -> 2 more online punches
  for (const platform of ['ios', 'android']) {
    for (const distinct of [1, 40, 120]) {
      await run(`G(${platform}, ${distinct} place${distinct > 1 ? 's' : ''}): 1 online + 150 offline + 2 online, tags and addresses`, async () => {
        reset([], platform);
        const SyncService = load();
        const mk = (i, offline) => {
          const place = offline ? i % distinct : 0;
          // Online punch: address resolved at punch time. Offline punch: lookup failed -> Lat/Lng text.
          rows.push({
            id: `s${i}`, user_id: 'U1', type: i % 2 === 0 ? 'IN' : 'OUT',
            punch_time: new RealDate(now + i * 1000).toISOString(),
            latitude: 9.9 + place * 0.001, longitude: 76.3 + place * 0.001,
            address: offline ? `Lat: ${(9.9 + place * 0.001).toFixed(5)}, Lng: ${(76.3 + place * 0.001).toFixed(5)}` : 'Online Addr, Kochi',
            is_offline: offline ? 1 : 0, sync_status: 'PENDING',
          });
        };
        mk(0, false);                                            // 1 online punch
        await SyncService.runSync({ attendance: [], visits: [] });
        assert.strictEqual(sent().length, 1);
        for (let i = 1; i <= 150; i++) mk(i, true);              // offline (not synced)
        mk(151, false);                                          // back online: punch 1
        const p1 = SyncService.syncAll();                        // punch-time sync...
        mk(152, false);                                          // ...punch 2 lands mid-sync
        const p2 = SyncService.syncAll();                        // queued re-run
        await Promise.all([p1, p2]);
        while (SyncService.isSyncing) await new Promise((r) => setImmediate(r));
        let guard = 0;
        while (rows.some((r) => r.sync_status === 'PENDING') && guard++ < 20) {   // 30 s retry timer
          now += 30000;
          await SyncService.syncAll();
          while (SyncService.isSyncing) await new Promise((r) => setImmediate(r));
        }
        const all = sent();
        assert.strictEqual(all.length, 153, 'all 153 reached the server exactly once');
        assertOrder();
        all.forEach((x, i) => {
          const offline = i >= 1 && i <= 150;
          assert.ok(x.locationName.startsWith(offline ? '(Offline Punch) ' : '(Online Punch) '), `#${i} tag: ${x.locationName}`);
          assert.ok(!/Lat:|Resolving/.test(x.locationName), `#${i} should have real address: ${x.locationName}`);
          assert.ok(x.latitude !== 0 && x.longitude !== 0, `#${i} has coordinates`);
        });
        assert.strictEqual(all[0].locationName, '(Online Punch) Online Addr, Kochi');
        assert.ok(rows.every((r) => r.sync_status === 'SYNCED'));
      });
    }
  }

  // ---- Customer visits (issues 2, 4, 5): n visits x (start, step in, step out), each at its own place
  const makeVisits = (n, { flags = [1, 1, 1], addr = 'Lat', completed = true } = {}) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const lat = 9.5 + i * 0.002, lng = 76.1 + i * 0.002;
      const text = (k) => (addr === 'Lat' ? `Lat: ${(lat + k * 0.0003).toFixed(5)}, Lng: ${(lng + k * 0.0003).toFixed(5)}` : `Street ${i}-${k}, Kochi`);
      const t = (k) => new RealDate(Date.parse('2026-11-25T09:00:00Z') + (i * 3 + k) * 60000).toISOString();
      out.push({
        id: `v${i}`, user_id: 'U1', client_name: `Client ${i}`, purpose: 'p', contact_person: 'c', contact_number: '1',
        location: text(0), latitude: lat, longitude: lng, start_time: t(0),
        step_in_time: t(1), step_in_lat: lat + 0.0003, step_in_lng: lng + 0.0003, step_in_address: text(1),
        end_time: completed ? t(2) : null, end_lat: lat + 0.0006, end_lng: lng + 0.0006, end_address: completed ? text(2) : '',
        status: completed ? 'COMPLETED' : 'step_in', sync_status: 'PENDING',
        start_offline: flags[0], step_in_offline: flags[1], end_offline: flags[2],
      });
    }
    return out;
  };
  const visitsSent = () => visitPosts;
  const tagOf = (p) => (p.location.match(/^\((Online|Offline)\)/) || [])[1];

  for (const platform of ['ios', 'android']) {
    await run(`V1(${platform}): 30 offline visits (90 steps, 90 places) -> every step gets address + (Offline) tag`, async () => {
      reset([], platform);
      visitRows = makeVisits(30);
      const runs = await syncUntilDone();
      const v = visitsSent();
      assert.strictEqual(v.length, 90, `all 90 steps posted exactly once (got ${v.length})`);
      assert.ok(v.every((p) => tagOf(p) === 'Offline'), 'every step tagged Offline');
      assert.ok(v.every((p) => !/Lat:/.test(p.location)), 'no Lat/Lng text left');
      assert.ok(visitRows.every((r) => r.sync_status === 'SYNCED'));
      console.log(`     (${runs} sync runs, ${geocodeCalls} lookups)`);
    });
  }

  await run('V2: tag follows the saved flag (mixed online/offline), not whether the address got resolved', async () => {
    reset([], 'android');
    visitRows = makeVisits(6, { flags: [0, 1, 0] });   // start online, step in offline, step out online - all stored as Lat text
    await syncUntilDone();
    const v = visitsSent();
    const by = (type) => v.filter((p) => p.stepinout === type);
    assert.ok(by('Start From').every((p) => tagOf(p) === 'Online'));
    assert.ok(by('in').every((p) => tagOf(p) === 'Offline'));
    assert.ok(by('out').every((p) => tagOf(p) === 'Online'));
    assert.ok(v.every((p) => !/Lat:/.test(p.location)), 'addresses resolved');
  });

  await run('V3: geocoder broken -> visits still sync after retries (Lat text, tag from flag), none stuck', async () => {
    reset([], 'broken');
    visitRows = makeVisits(8, { flags: [1, 1, 1] });
    const runs = await syncUntilDone();
    assert.strictEqual(visitsSent().length, 24);
    assert.ok(visitsSent().every((p) => tagOf(p) === 'Offline' && /Lat:/.test(p.location)));
    assert.ok(visitRows.every((r) => r.sync_status === 'SYNCED'));
    console.log(`     (${runs} sync runs)`);
  });

  await run('V4: older rows without a flag keep the old rule (Lat text = Offline, address = Online)', async () => {
    reset([], 'android');
    visitRows = makeVisits(2, { flags: [null, null, null], addr: 'Street' });
    visitRows.push(...makeVisits(1, { flags: [null, null, null] }).map((r) => ({ ...r, id: 'old-lat', latitude: 0, longitude: 0, step_in_lat: 0, step_in_lng: 0, end_lat: 0, end_lng: 0 })));
    await syncUntilDone();
    const v = visitsSent();
    assert.ok(v.filter((p) => /Street/.test(p.location)).every((p) => tagOf(p) === 'Online'));
    assert.ok(v.filter((p) => /Lat:/.test(p.location)).every((p) => tagOf(p) === 'Offline'));
  });

  await run('V5: attendance + visits in one run share the iOS limit; 1 online + 150 offline punches and 20 visits all resolve', async () => {
    reset(makePunches(150, { distinct: 30 }), 'ios');
    visitRows = makeVisits(20);
    await syncUntilDone();
    assert.strictEqual(sent().length, 150);
    assert.strictEqual(withAddress(), 150);
    assert.strictEqual(visitsSent().length, 60);
    assert.ok(visitsSent().every((p) => tagOf(p) === 'Offline' && !/Lat:/.test(p.location)));
  });

  // ---- Visits screen display helpers (real source of VisitsScreen.js): tags kept, one lookup per place
  await run('D1: Visits screen keeps the (Offline) tag when it resolves Lat/Lng, adds tags from flags, 1 lookup per place', async () => {
    const screenSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'VisitsScreen.js'), 'utf8');
    const start = screenSrc.indexOf('const screenResolver');
    const end = screenSrc.indexOf('const getAddress = async');
    assert.ok(start > 0 && end > start);
    const snippet = screenSrc.slice(start, end);
    let lookups = 0;
    const factory = new Function('createAddressResolver', 'reverseGeocodeWithTimeout', 'Network', 'LAT_LNG_REGEX', 'Promise', 'setTimeout',
      `${snippet}\nreturn { resolveAddress, withTag };`);
    const resolverMod = { exports: {} };
    new Function('module', fs.readFileSync(path.join(SRC, 'AddressResolver.js'), 'utf8'))(resolverMod);
    const { resolveAddress, withTag } = factory(
      resolverMod.exports.createAddressResolver,
      async () => { lookups++; return [{ name: 'MG Road', city: 'Kochi', region: 'Kerala' }]; },
      { getNetworkStateAsync: async () => ({ isConnected: true }) },
      /Lat:\s*(-?\d+\.\d+),\s*Lng:\s*(-?\d+\.\d+)/i, Promise, setTimeout);
    assert.strictEqual(await resolveAddress('(Offline) Lat: 9.99260, Lng: 76.31503'), '(Offline) MG Road, Kochi, Kerala');
    assert.strictEqual(await resolveAddress('(Online) Some Road, Kochi'), '(Online) Some Road, Kochi');
    assert.strictEqual(await resolveAddress('Lat: 9.99260, Lng: 76.31503'), 'MG Road, Kochi, Kerala');
    assert.strictEqual(lookups, 1, 'same place looked up once');
    const many = await Promise.all(Array.from({ length: 40 }, () => resolveAddress('(Offline) Lat: 9.99260, Lng: 76.31503')));
    assert.ok(many.every((x) => x === '(Offline) MG Road, Kochi, Kerala') && lookups === 1);
    assert.strictEqual(withTag('MG Road', 1), '(Offline) MG Road');
    assert.strictEqual(withTag('MG Road', '0'), '(Online) MG Road');
    assert.strictEqual(withTag('MG Road', null), 'MG Road');
    assert.strictEqual(withTag('(Offline) MG Road', 0), '(Offline) MG Road');
  });

  // ---- My Customer Visits order: latest visit first (real sortVisitsNewestFirst from VisitsScreen.js)
  const screenSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'VisitsScreen.js'), 'utf8');
  await run('S1: 500 shuffled visits (local ISO + server "YYYY-MM-DD HH:mm:ss" + missing times + ties) -> latest first, stable, no-time last', async () => {
    const a = screenSource.indexOf('const visitTimeMs');
    const b = screenSource.indexOf('const normalizeVisit');
    assert.ok(a > 0 && b > a);
    const sortVisitsNewestFirst = new Function(`${screenSource.slice(a, b)}\nreturn sortVisitsNewestFirst;`)();
    const base = Date.parse('2026-11-20T04:00:00Z');
    const list = [];
    for (let i = 0; i < 500; i++) {
      const t = base + Math.floor(i / 2) * 7 * 60000;                       // pairs share a start time (ties)
      const d = new RealDate(t);
      const pad = (n) => String(n).padStart(2, '0');
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      list.push({ id: `v${String(i).padStart(4, '0')}`, start_time: i % 3 === 0 ? d.toISOString() : local, created_at: local });
    }
    list.push({ id: 'zz-no-time-1' }, { id: 'zz-no-time-2', start_time: '' });
    list.push({ id: 'only-step-in', step_in_time: new RealDate(base - 3600000).toISOString() });   // no start: uses its first step
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    const sorted = sortVisitsNewestFirst(shuffled);
    assert.strictEqual(sorted.length, 503);
    assert.strictEqual(sorted[0].id, 'v0499', 'the latest visit is first');
    const timed = sorted.slice(0, 501);
    assert.strictEqual(timed[500].id, 'only-step-in', 'earliest timed visit (falls back to its step-in time) is last of the timed ones');
    for (let i = 1; i < timed.length; i++) {
      const prev = new RealDate(timed[i - 1].start_time || timed[i - 1].step_in_time).getTime(), cur = new RealDate(timed[i].start_time || timed[i].step_in_time).getTime();
      assert.ok(prev >= cur, `latest first at ${i}`);
      if (prev === cur) assert.ok(timed[i - 1].id > timed[i].id, 'ties: newest id first');
    }
    assert.deepStrictEqual(sorted.slice(501).map((v) => v.id), ['zz-no-time-2', 'zz-no-time-1'], 'visits with no time last');
    assert.deepStrictEqual(sortVisitsNewestFirst(shuffled).map((v) => v.id), sorted.map((v) => v.id), 'same input -> same order every refresh');
    assert.strictEqual(list.length, 503); // input untouched

    // Open visits stay at the top whenever they started (an old one, a new one, one with no time), latest open first
    const open = [{ id: 'open-old', status: 'step_in', start_time: new RealDate(base - 86400000).toISOString() }, { id: 'open-new', status: 'REACHED', start_time: new RealDate(base + 1000).toISOString() }, { id: 'open-no-time', status: 'REACHED' }];
    const withOpen = sortVisitsNewestFirst([...shuffled.map((v) => ({ ...v, status: 'COMPLETED' })), ...open].sort(() => Math.random() - 0.5));
    assert.deepStrictEqual(withOpen.slice(0, 3).map((v) => v.id), ['open-new', 'open-old', 'open-no-time'], 'open visits first');
    assert.deepStrictEqual(withOpen.slice(3).map((v) => v.id), sorted.map((v) => v.id), 'the rest unchanged: latest first');
  });

  // ---- Address attached to the right step during sync
  await run('V6: a step with no address text of its own is looked up from ITS coordinates, not given the Start place', async () => {
    reset([], 'android');
    visitRows = makeVisits(20, { flags: [1, 1, 1] }).map((v) => ({ ...v, step_in_address: '', end_address: '' }));   // steps have coordinates but no address text
    await syncUntilDone();
    const v = visitsSent();
    assert.strictEqual(v.length, 60);
    for (let i = 0; i < 20; i++) {
      const own = v.filter((p) => p.customer_name === `Client ${i}`);
      const start = own.find((p) => p.stepinout === 'Start From'), inn = own.find((p) => p.stepinout === 'in'), out = own.find((p) => p.stepinout === 'out');
      assert.ok(inn.location !== start.location && out.location !== start.location, `visit ${i}: steps must not carry the Start address`);
      assert.ok(!/Lat:/.test(inn.location) && !/Lat:/.test(out.location));
    }
  });

  // ---- Pending sync -> Synced indicator (real isVisitPending), 25+ offline visits
  const chipSource = screenSource.slice(screenSource.indexOf('const isVisitPending'), screenSource.indexOf('const SyncChip'));
  const isVisitPending = new Function(`${chipSource}\nreturn isVisitPending;`)();
  await run('V7: 40 offline visits on the iOS limit: every card says "Pending sync" until its post lands, then "Synced"; never flips early', async () => {
    reset([], 'ios');
    visitRows = makeVisits(40);
    const SyncService = load();
    assert.strictEqual(visitRows.filter((r) => isVisitPending(r)).length, 40, 'all pending before the sync');
    let runs = 0, lastPending = 40;
    const postedBefore = new Set();
    while (visitRows.some((r) => isVisitPending(r)) && runs < 20) {
      await SyncService.runSync({ attendance: [], visits: [] });
      runs++; now += 30000;
      const pendingNow = visitRows.filter((r) => isVisitPending(r)).length;
      assert.ok(pendingNow <= lastPending, 'pending count never goes back up');
      lastPending = pendingNow;
      // a card is "Synced" only if the server really received all its steps
      for (const r of visitRows) {
        if (!isVisitPending(r)) {
          const got = visitPosts.filter((p) => p.customer_name === r.client_name).length;
          assert.strictEqual(got, 3, `${r.client_name} shows Synced but the server has ${got}/3 steps`);
        }
      }
    }
    assert.ok(visitRows.every((r) => !isVisitPending(r)));
    assert.strictEqual(visitPosts.length, 120);
    assert.ok(visitPosts.every((p) => !/Lat:/.test(p.location)), 'every step has a proper address by the time it is Synced');
    console.log(`     (${runs} sync runs, 40 cards Pending -> Synced)`);
  });

  // ---- The auto-sync timer logic of the Visits screen (real code sliced from VisitsScreen.js)
  await run('T1: auto-sync tick: waits while offline, syncs the moment the connection returns, retries every 30 s, stops when nothing is pending, never overlaps', async () => {
    const s = screenSource.indexOf('let wasOnline = null;');
    const e = screenSource.indexOf('const timer = setInterval(tick, 3000);');
    assert.ok(s > 0 && e > s);
    const body = screenSource.slice(s, e);
    let clock = 1000000, online = false, pendingVisits = true, fetches = [], busyRelease = null;
    const visitsRef = { get current() { return pendingVisits ? [{ sync_status: 'PENDING' }] : [{ sync_status: 'SYNCED' }]; } };
    const autoBusy = { current: false };
    const Network = { getNetworkStateAsync: async () => ({ isConnected: online }) };
    const fetchVisitsRef = { current: async (d, o) => { fetches.push({ d, o, at: clock }); if (busyRelease) await new Promise((r) => { busyRelease = r; }); } };
    const selectedDateRef = { current: '2026-11-25' };
    const FakeClock = { now: () => clock };
    const tick = new Function('stopped0', 'visitsRef', 'autoBusy', 'Network', 'fetchVisitsRef', 'selectedDateRef', 'AUTO_SYNC_RETRY_MS', 'isVisitPending', 'Date',
      `${body}\nreturn tick;`)(false, visitsRef, autoBusy, Network, fetchVisitsRef, selectedDateRef, 30000, isVisitPending, FakeClock);
    for (let i = 0; i < 5; i++) { clock += 3000; await tick(); }
    assert.strictEqual(fetches.length, 0, 'offline: no attempts');
    online = true; clock += 3000; await tick();
    assert.strictEqual(fetches.length, 1, 'connection returned: immediate attempt');
    assert.deepStrictEqual(fetches[0].o, { silent: true });
    assert.strictEqual(fetches[0].d, '2026-11-25');
    for (let i = 0; i < 8; i++) { clock += 3000; await tick(); }          // 24 s later
    assert.strictEqual(fetches.length, 1, 'no extra attempt inside 30 s');
    clock += 6000; await tick();                                          // 30 s since the attempt
    assert.strictEqual(fetches.length, 2, 'retry after 30 s while still pending');
    autoBusy.current = true; clock += 40000; await tick();
    assert.strictEqual(fetches.length, 2, 'never overlaps a refresh in progress');
    autoBusy.current = false;
    pendingVisits = false; clock += 40000; await tick();
    assert.strictEqual(fetches.length, 2, 'nothing pending: stops asking');
    // goes offline then online again with new pending visits
    pendingVisits = true; online = false; clock += 3000; await tick();
    online = true; clock += 3000; await tick();
    assert.strictEqual(fetches.length, 3, 'back online with pending visits: immediate attempt again');
  });


  console.log(`\nAll ${results.length} scenarios passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
