// Load test: attendance punches are never lost or marked "synced" unless the server really took them.
// Runs the REAL LocalDB.js + SyncService.js (and ShiftDate.js / AllPunches.js for the button) on a REAL SQLite database
// (node:sqlite in place of expo-sqlite). The server is fake, modelled on RizoController::markattendance and the punch
// queue (punch-queue/src/ingest.js + handlers.js):
//   queue company : 200 + success 0 when the queue is down; a shorter list when it took only some; resent punches
//                   (same user + time + direction) are dropped by the worker
//   direct company: stored at once, no duplicate check
// Run: node --no-warnings scripts/test-punch-sync-load.js   (Node 22.5+)
process.env.TZ = 'Asia/Kolkata';
const path = require('path');
const Module = require('module');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const APP = path.join(__dirname, '..');
const appReq = Module.createRequire(path.join(APP, 'package.json'));
const babel = appReq('@babel/core');
const compiled = {};
const compile = (file) => (compiled[file] ||= babel.transformFileSync(file, { presets: ['babel-preset-expo'], babelrc: false, configFile: false }).code);
const DOWN = { success: 0, message: 'User Checked fails', data: [] };

const build = (platform, { company = 'queue', raw = new DatabaseSync(':memory:'), server, clock } = {}) => {
  const c = clock || { now: Date.parse('2026-11-25T04:00:00Z') };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [c.now])); }
    static now() { return c.now; }
  }
  const bind = (p) => (p || []).map((x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));
  const db = {
    execAsync: async (s) => raw.exec(s),
    runAsync: async (s, p) => raw.prepare(s).run(...bind(p)),
    getAllAsync: async (s, p) => raw.prepare(s).all(...bind(p)).map((r) => ({ ...r })),
    getFirstAsync: async (s, p) => { const r = raw.prepare(s).get(...bind(p)); return r ? { ...r } : null; },
  };
  const st = server || { stored: [], requests: 0, sizes: [], reply: null };   // the server outlives an app restart
  const net = { online: true, window: [], lookups: 0 };
  const keyOf = (x) => `${x.user_id}|${x.time_check}|${x.in_out}`;
  // Stores punches as the real server would
  const store = (list) => list.forEach((x) => {
    if (company === 'queue' && st.stored.some((s) => keyOf(s) === keyOf(x))) return;  // the queue worker drops a repeat
    st.stored.push(x);
  });
  const ack = (x) => ({ auditor_pkey: x.auditor_pkey, uploaded_time: '', location: x.locationName, C1: x.in_out });
  const post = async (url, body) => {
    if (url !== 'swipe') return { data: { success: 1 } };
    const list = JSON.parse(body.login_auditor);
    st.requests++; st.sizes.push(list.length);
    await new Promise((r) => setImmediate(r));
    const custom = st.reply ? await st.reply({ list, store, ack, n: st.requests }) : null;
    if (custom) { if (custom.error) throw custom.error; return { data: custom.data }; }
    store(list);
    return { data: { success: 1, message: 'User checked successfully', data: list.map(ack) } };
  };
  const stubs = {
    'expo-sqlite': { openDatabaseAsync: async () => db },
    axios: { __esModule: true, default: { post } },
    'expo-network': { getNetworkStateAsync: async () => ({ isConnected: net.online }) },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
    '../constants/Config': { API_ENDPOINTS: { SWIPE: 'swipe', VISIT_SYNC: 'visit', LEAVES: 'leaves' } },
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      reverseGeocodeAsync: async ({ latitude }) => {
        net.lookups++; net.window = net.window.filter((t) => c.now - t < 60000);
        if (platform === 'ios' && net.window.length >= 50) throw new Error('kCLErrorDomain error 2 (throttled)');
        net.window.push(c.now); return [{ name: `Plot ${latitude.toFixed(4)}`, city: 'Kochi' }];
      },
    },
    './NotificationManager': { __esModule: true, default: { checkStatusChanges: async () => {} } },
    './PunchSelfie': { syncPunchSelfies: async () => {} },
  };
  const cache = {};
  const load = (rel) => {
    const file = path.join(APP, 'src/services', rel);
    if (cache[file]) return cache[file].exports;
    const m = (cache[file] = { exports: {} });
    new Function('module', 'exports', 'require', 'console', 'Date', 'setTimeout', compile(file))(m, m.exports,
      (n) => (n in stubs ? stubs[n] : n.startsWith('./') ? load(`${n.slice(2)}.js`) : appReq(n)), process.env.DBG ? console : { log() {}, error() {}, warn() {} }, FakeDate, () => 0);
    return m.exports;
  };
  const DB = load('LocalDB.js'), Sync = load('SyncService.js').default;
  const { nextPunch, SHIFT_DATE_LOOKBACK_MS } = load('ShiftDate.js'), { mergePunches } = load('AllPunches.js');
  const sync = async () => { await Sync.syncAll(); while (Sync.isSyncing) await new Promise((r) => setImmediate(r)); };
  const tick = (ms) => { c.now += ms; };
  // A tap on the Home button: the direction the button shows (real logic), then the real savePunchLocal
  const punch = async ({ user = 'GRTL100011', offline = false, place = 0 } = {}) => {
    tick(2000);
    const now = new FakeDate();
    const rows = await DB.getPunchesBetween(user, new FakeDate(c.now - SHIFT_DATE_LOOKBACK_MS).toISOString(), new FakeDate(c.now + 60000).toISOString());
    const { direction } = nextPunch(now, mergePunches(rows, []), []);
    const lat = 9.9 + place * 0.001;
    await DB.savePunchLocal({ userId: user, type: direction, punchTime: now.toISOString(), latitude: lat, longitude: 76.3, address: offline ? `Lat: ${lat.toFixed(5)}, Lng: 76.30000` : 'Office, Kochi', isOffline: offline });
    return direction;
  };
  const rows = () => raw.prepare('SELECT rowid, * FROM attendance ORDER BY rowid').all();
  const pending = () => rows().filter((r) => r.sync_status === 'PENDING').length;
  const pad = (n) => String(n).padStart(2, '0');
  const local = (iso) => { const d = new RealDate(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const onServer = (r) => st.stored.filter((s) => keyOf(s) === `${r.user_id}|${local(r.punch_time)}|${r.type}`).length;
  // The rule everything is about: "synced" on the phone = really on the server
  const checkTruth = () => rows().forEach((r) => { if (r.sync_status === 'SYNCED') assert.ok(onServer(r) >= 1, `punch ${local(r.punch_time)} ${r.type} is marked synced but is not on the server`); });
  // Everything arrived, exactly once, in tap order, IN OUT IN OUT per user
  const checkAll = ({ order = true, times = 1 } = {}) => {
    assert.strictEqual(pending(), 0, 'nothing left pending');
    rows().forEach((r) => assert.strictEqual(onServer(r), times, `${local(r.punch_time)} ${r.type} stored ${onServer(r)} times`));
    if (order) [...new Set(rows().map((r) => r.user_id))].forEach((u) => {
      const mine = st.stored.filter((s) => s.user_id === u);
      assert.deepStrictEqual(mine.map((s) => s.time_check), rows().filter((r) => r.user_id === u).map((r) => local(r.punch_time)), 'tap order');
      mine.forEach((s, i) => assert.strictEqual(s.in_out, i % 2 ? 'OUT' : 'IN', `punch ${i} direction`));
    });
  };
  const untilDone = async (max = 80, each = () => {}) => { let runs = 0; while (pending() && runs < max) { await sync(); runs++; each(); tick(30000); } return runs; };
  return { DB, sync, tick, punch, rows, pending, checkTruth, checkAll, untilDone, st, net, raw, clock: c };
};

(async () => {
  const results = [];
  const run = async (name, fn) => { const note = await fn(); results.push(name); console.log('PASS', name, note ? `\n       ${note}` : ''); };

  for (const os of ['ios', 'android']) {
    await run(`1 (${os}) QUEUE DOWN: 300 offline punches, the server answers "failed" to 10 syncs, then recovers -> all 300 arrive once, in order`, async () => {
      const p = build(os); await p.DB.initDB(); p.net.online = false;
      for (let i = 0; i < 300; i++) await p.punch({ offline: true, place: i % 40 });
      p.net.online = true; p.st.reply = async () => ({ data: DOWN });
      for (let i = 0; i < 10; i++) { await p.sync(); p.tick(30000); assert.strictEqual(p.pending(), 300, 'all still pending'); assert.strictEqual(p.st.stored.length, 0); }
      assert.ok(p.st.requests <= 10, 'a failed batch stops the ones after it (one request per sync)');
      p.st.reply = null; const runs = await p.untilDone(80, p.checkTruth); p.checkAll();
      assert.ok(p.st.stored.every((s) => /^\(Offline Punch\) Plot /.test(s.locationName)), 'every punch has its address and the (Offline Punch) tag');
      return `${runs} sync run(s) after recovery, batches ${[...new Set(p.st.sizes)].join('/')}`;
    });

    await run(`2 (${os}) QUEUE GOES DOWN HALFWAY: 260 punches, down after 2 batches -> 100 synced, 160 kept, then finished`, async () => {
      const p = build(os); await p.DB.initDB(); p.net.online = false;
      for (let i = 0; i < 260; i++) await p.punch({ offline: true });
      p.net.online = true; p.st.reply = async ({ n }) => (n > 2 ? { data: DOWN } : null);
      await p.sync(); p.checkTruth(); assert.strictEqual(p.pending(), 160); assert.strictEqual(p.st.stored.length, 100);
      await p.sync(); assert.strictEqual(p.pending(), 160);
      p.st.reply = null; await p.untilDone(); p.checkAll();
    });

    await run(`3 (${os}) YOUR SEQUENCE with the queue down: 1 online, 250 offline, 2 online -> button keeps alternating, tags right, nothing lost`, async () => {
      const p = build(os); await p.DB.initDB(); p.st.reply = async () => ({ data: DOWN }); const dirs = [];
      dirs.push(await p.punch()); await p.sync();
      p.net.online = false; for (let i = 0; i < 250; i++) dirs.push(await p.punch({ offline: true, place: i % 30 }));
      p.net.online = true; for (let i = 0; i < 2; i++) { dirs.push(await p.punch()); await p.sync(); }
      dirs.forEach((d, i) => assert.strictEqual(d, i % 2 ? 'OUT' : 'IN', `tap ${i}`)); assert.strictEqual(p.pending(), 253);
      p.st.reply = null; await p.untilDone(80, p.checkTruth); p.checkAll();
      p.st.stored.forEach((s, i) => assert.ok(s.locationName.startsWith(i >= 1 && i <= 250 ? '(Offline Punch) Plot ' : '(Online Punch) Office'), `${i}: ${s.locationName}`));
    });

    await run(`4 (${os}) EVERYTHING GOES WRONG: 500 punches, every other request fails in one of 10 ways -> each stored exactly once, in order`, async () => {
      const p = build(os); await p.DB.initDB(); const seen = {};
      const bad = { zero: () => ({ data: DOWN }), zeroText: () => ({ data: { success: '0' } }), no: () => ({ data: { success: false } }), http500: () => ({ error: new Error('Request failed with status code 500') }),
        timeout: () => ({ error: new Error('timeout of 30000ms exceeded') }), errorPage: () => ({ data: '<html><body>Service unavailable</body></html>' }), empty: () => ({ data: '' }), nothing: () => ({ data: null }), noBody: () => ({ data: undefined }),
        lostReply: ({ list, store }) => { store(list); return { error: new Error('timeout of 30000ms exceeded') }; } };   // stored, but the answer never came back
      const kinds = Object.keys(bad); let turn = 0;
      p.st.reply = async (a) => { if (Math.random() < 0.5) return null; const k = kinds[turn++ % kinds.length]; seen[k] = (seen[k] || 0) + 1; return bad[k](a); };   // every kind in turn
      for (let i = 0; i < 500; i++) { await p.punch({ offline: i % 3 === 0, place: i % 25 }); if (i % 7 === 0) { await p.sync(); p.checkTruth(); } }
      const runs = await p.untilDone(300, p.checkTruth); p.checkAll();
      kinds.forEach((k) => assert.ok(seen[k] > 0, `failure kind ${k} was exercised`));
      return `${p.st.requests} requests, failures seen: ${kinds.map((k) => `${k} ${seen[k] || 0}`).join(', ')}; ${runs} more runs to finish`;
    });

    await run(`5 (${os}) PARTLY ACCEPTED: the queue takes only some of a batch and lists fewer -> whole batch kept and resent, none lost, none doubled`, async () => {
      const p = build(os); await p.DB.initDB(); p.net.online = false; for (let i = 0; i < 250; i++) await p.punch({ offline: true });
      p.net.online = true; let partial = 0;
      p.st.reply = async ({ list, store, ack }) => { if (Math.random() < 0.4) return null; partial++; const some = list.filter(() => Math.random() < 0.6); store(some); return { data: some.length ? { success: 1, data: some.map(ack) } : DOWN }; };
      await p.untilDone(200, p.checkTruth); p.checkAll({ order: false }); assert.ok(partial > 0);
      return `${partial} partly accepted batches`;
    });
  }

  await run('6 DIRECT company (no queue, no duplicate check): 300 punches, failures before storing -> stored exactly once, in order', async () => {
    const p = build('android', { company: 'direct' }); await p.DB.initDB(); p.net.online = false; for (let i = 0; i < 300; i++) await p.punch({ offline: true, user: 'ABCD100011' });
    p.net.online = true; p.st.reply = async () => (Math.random() < 0.5 ? { data: DOWN } : null);
    await p.untilDone(200, p.checkTruth); p.checkAll();
  });

  await run('7 DIRECT company, reply lists positions with gaps ({ "0":…, "2":… }) -> exactly those are synced, the others resent once', async () => {
    const p = build('android', { company: 'direct' }); await p.DB.initDB(); for (let i = 0; i < 200; i++) await p.punch({ user: 'ABCD100011' });
    p.st.reply = async ({ list, store, ack }) => { const data = {}; list.forEach((x, i) => { if (Math.random() < 0.7) { store([x]); data[i] = ack(x); } }); return Object.keys(data).length ? { data: { success: 1, data } } : { data: DOWN }; };
    await p.untilDone(200, p.checkTruth); p.checkAll({ order: false });
  });

  await run('8 OTHER "yes" ANSWERS are still a yes (no endless resending): success "1", true, a PHP notice before the JSON, an object without success', async () => {
    for (const yes of [{ success: '1', data: [] }, { success: true }, '<br /><b>Notice</b>: Undefined index in x.php {"success":1,"message":"User checked successfully","data":[]}', '{"success": "1"} trailing', { ok: true }, { success: 1, data: {} }]) {
      const p = build('android', { company: 'direct' }); await p.DB.initDB(); for (let i = 0; i < 120; i++) await p.punch({ user: 'ABCD100011' });
      p.st.reply = async ({ list, store }) => { store(list); return { data: yes }; };
      await p.sync(); await p.sync(); await p.sync();
      assert.strictEqual(p.st.requests, 3, `3 batches, sent once: ${JSON.stringify(yes).slice(0, 40)}`); p.checkAll();
    }
  });

  await run('8b UNCLEAR "yes" for ever (a one-line list for any batch, server without duplicate check): stops after one resend each, never endless', async () => {
    const p = build('android', { company: 'direct' }); await p.DB.initDB(); for (let i = 0; i < 200; i++) await p.punch({ user: 'ABCD100011' });
    p.st.reply = async ({ list, store, ack }) => { store(list); return { data: { success: 1, data: [ack(list[0])] } }; };
    const runs = await p.untilDone(60, p.checkTruth); assert.strictEqual(p.pending(), 0);
    p.rows().forEach((r) => { const n = p.st.stored.filter((s) => s.in_out === r.type && s.time_check.endsWith(new Date(r.punch_time).toTimeString().slice(0, 8))).length; assert.ok(n <= 2, `stored ${n} times`); });
    const before = p.st.requests; await p.sync(); await p.sync(); assert.strictEqual(p.st.requests, before, 'nothing more is sent');
    return `${runs} sync runs, ${p.st.requests} requests`;
  });

  await run('9 TWO EMPLOYEES on one phone: one gets "failed", the other is not stopped', async () => {
    const p = build('android'); await p.DB.initDB(); for (let i = 0; i < 120; i++) { await p.punch({ user: 'GRTL100011' }); await p.punch({ user: 'GRTL100012' }); }
    p.st.reply = async ({ list }) => (list[0].user_id === 'GRTL100011' ? { data: DOWN } : null);
    await p.sync(); p.checkTruth(); assert.strictEqual(p.rows().filter((r) => r.user_id === 'GRTL100012' && r.sync_status === 'SYNCED').length, 120); assert.strictEqual(p.pending(), 120);
    p.st.reply = null; await p.untilDone(); p.checkAll();
  });

  await run('10 APP CLOSED AND REOPENED 12 times with the queue down on and off, 360 punches -> all arrive once, in order', async () => {
    let p = build('ios'); await p.DB.initDB();
    for (let r = 0; r < 12; r++) {
      for (let i = 0; i < 30; i++) await p.punch({ offline: r % 2 === 0, place: i % 5 });
      p.st.reply = r % 3 === 2 ? null : async () => ({ data: DOWN });
      await p.sync(); p.checkTruth();
      p = build('ios', { raw: p.raw, server: p.st, clock: p.clock }); await p.DB.initDB();      // same database, fresh app
    }
    p.st.reply = null; await p.untilDone(80, p.checkTruth); p.checkAll(); assert.strictEqual(p.st.stored.length, 360);
  });

  await run('11 TAPPING WHILE IT SYNCS: 300 punches made during uploads, queue failing on and off -> none lost', async () => {
    const p = build('android'); await p.DB.initDB(); let left = 300;
    p.st.reply = async ({ n }) => { if (left > 0) { left--; await p.punch(); } return n % 3 === 0 ? { data: DOWN } : null; };
    await p.punch(); left--; let guard = 0;
    while ((left > 0 || p.pending()) && guard++ < 1500) { await p.sync(); p.tick(1000); if (!p.pending() && left > 0) { await p.punch(); left--; } }
    p.checkTruth(); p.checkAll(); return `${p.st.stored.length} punches, ${p.st.requests} requests`;
  });

  await run('12 SCALE: 2000 offline punches in one go', async () => {
    const p = build('ios'); await p.DB.initDB(); p.net.online = false; const t0 = process.hrtime.bigint();
    for (let i = 0; i < 2000; i++) { p.tick(2000); await p.DB.savePunchLocal({ userId: 'GRTL100011', type: i % 2 ? 'OUT' : 'IN', punchTime: new Date(p.clock.now).toISOString(), latitude: 9.9, longitude: 76.3, address: 'Lat: 9.90000, Lng: 76.30000', isOffline: true }); }
    p.net.online = true; await p.untilDone(); p.checkAll(); assert.strictEqual(p.st.requests, 40);
    return `40 requests of 50, ${p.net.lookups} address lookup(s), ${Number((process.hrtime.bigint() - t0) / 1000000n)} ms`;
  });

  console.log(`\nAll ${results.length} punch-sync scenarios passed`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
