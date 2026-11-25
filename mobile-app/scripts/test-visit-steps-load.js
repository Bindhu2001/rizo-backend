// Load test: customer visits sync ONE STEP AT A TIME (Start, Step In, Step Out), online and from an offline backlog,
// without waiting for the visit to be complete.
// Runs the REAL LocalDB.js + SyncService.js on a REAL SQLite database (node:sqlite in place of expo-sqlite). Only the
// server, the geocoder, the network and the clock are fake. iOS = geocoder limited to 50 lookups a minute (the assumed
// Apple limit); Android = no limit. Run: node --no-warnings scripts/test-visit-steps-load.js   (Node 22.5+)
process.env.TZ = 'Asia/Kolkata'; // the dates are checked in India time, whatever computer runs this
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const APP = path.join(__dirname, '..');
const appReq = Module.createRequire(path.join(APP, 'package.json'));
const babel = appReq('@babel/core');
const compiled = {};
const compile = (file) => (compiled[file] ||= babel.transformFileSync(file, { presets: ['babel-preset-expo'], babelrc: false, configFile: false }).code);

// One phone + one server
const build = (platform) => {
  let now = Date.parse('2026-11-25T04:00:00Z');
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const raw = new DatabaseSync(':memory:');
  const bind = (p) => (p || []).map((x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));
  const db = {
    execAsync: async (s) => raw.exec(s),
    runAsync: async (s, p) => raw.prepare(s).run(...bind(p)),
    getAllAsync: async (s, p) => raw.prepare(s).all(...bind(p)).map((r) => ({ ...r })),
    getFirstAsync: async (s, p) => {
      const r = raw.prepare(s).get(...bind(p));
      if (st.onRead && /client_visits/.test(s)) await st.onRead();   // a tap right after the sync read the visit
      return r ? { ...r } : null;
    },
  };
  const st = { online: true, steps: [], lookups: 0, window: [], broken: false, onPost: null, onLookup: null, onRead: null, inFlight: 0, maxInFlight: 0 };
  const geocode = async ({ latitude, longitude }) => {
    st.lookups++;
    if (st.onLookup) await st.onLookup();
    if (st.broken) throw new Error('geocoder down');
    st.window = st.window.filter((t) => now - t < 60000);
    if (platform === 'ios' && st.window.length >= 50) throw new Error('kCLErrorDomain error 2 (throttled)');
    st.window.push(now);
    return [{ name: `Plot ${latitude.toFixed(4)}`, street: `Road ${longitude.toFixed(4)}`, city: 'Kochi' }];
  };
  const post = async (url, body) => {
    if (!/^visit/.test(url)) return { data: { success: 1 } };
    st.inFlight++; st.maxInFlight = Math.max(st.maxInFlight, st.inFlight);
    try {
      await new Promise((r) => setImmediate(r));
      const reply = st.onPost ? await st.onPost(body) : null;      // may tap, throw, or answer something else
      if (reply) return reply;
      st.steps.push({ who: body.customer_name, type: body.stepinout, loc: body.location, at: body.created_time });
      return { data: { success: 1 } };
    } finally { st.inFlight--; }
  };
  const stubs = {
    'expo-sqlite': { openDatabaseAsync: async () => db },
    axios: { __esModule: true, default: { post } },
    'expo-network': { getNetworkStateAsync: async () => ({ isConnected: st.online }) },
    '../constants/Config': { API_ENDPOINTS: { SWIPE: 'swipe', VISIT_SYNC: 'visit', LEAVES: 'leaves' } },
    'expo-location': { reverseGeocodeAsync: geocode, getForegroundPermissionsAsync: async () => ({ status: 'granted' }) },
    './NotificationManager': { __esModule: true, default: { checkStatusChanges: async () => {} } },
    './PunchSelfie': { syncPunchSelfies: async () => {} },
  };
  const cache = {};
  const load = (rel) => {
    const file = path.join(APP, 'src/services', rel);
    if (cache[file]) return cache[file].exports;
    const m = (cache[file] = { exports: {} });
    const quiet = process.env.DBG ? console : { log() {}, error() {}, warn() {} };
    // the 5 s geocoder timeout timers would only keep node alive: never fire them
    new Function('module', 'exports', 'require', 'console', 'Date', 'setTimeout', compile(file))(m, m.exports,
      (n) => (n in stubs ? stubs[n] : n.startsWith('./') ? load(`${n.slice(2)}.js`) : appReq(n)), quiet, FakeDate, () => 0);
    return m.exports;
  };
  const DB = load('LocalDB.js');
  const Sync = load('SyncService.js').default;
  const settle = async () => { while (Sync.isSyncing) await new Promise((r) => setImmediate(r)); };
  const sync = async () => { await Sync.syncAll(); await settle(); };
  const tick = (ms) => { now += ms; };
  let n = 0;
  const tap = {
    // Every place is its own (so every step needs its own lookup)
    start: async (name, { offline = false, address } = {}) => {
      n++; tick(1000);
      const lat = 9 + n * 0.01, lng = 76 + n * 0.01;
      const location = address ?? (offline ? `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}` : `Start ${name}, Kochi`);
      const id = await DB.saveVisitLocal({ userId: 'U1', clientName: name, contactNumber: '1', contactPerson: 'c', purpose: 'p', location, lat, lng });
      await DB.updateVisitStatus(id, 'REACHED', { startTime: new FakeDate().toISOString(), lat, lng, startOffline: offline });
      return { id, name, lat, lng };
    },
    stepIn: async (v, { offline = false } = {}) => {
      tick(1000); const lat = v.lat + 0.001, lng = v.lng + 0.001;
      await DB.updateVisitStatus(v.id, 'step_in', { stepInTime: new FakeDate().toISOString(), lat, lng, offline, address: offline ? `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}` : `In ${v.name}, Kochi` });
    },
    stepOut: async (v, { offline = false } = {}) => {
      tick(1000); const lat = v.lat + 0.002, lng = v.lng + 0.002;
      await DB.updateVisitStatus(v.id, 'COMPLETED', { endTime: new FakeDate().toISOString(), lat, lng, offline, address: offline ? `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}` : `Out ${v.name}, Kochi` });
    },
  };
  const rows = () => raw.prepare('SELECT * FROM client_visits ORDER BY rowid').all();
  const of = (name) => st.steps.filter((s) => s.who === name);
  // What the card's chip says must be the truth: Synced = every step tapped so far is on the server
  const checkChips = () => rows().forEach((r) => {
    const tapped = (r.start_time ? 1 : 0) + (r.step_in_time ? 1 : 0) + (r.status === 'COMPLETED' && r.end_time ? 1 : 0);
    const got = of(r.client_name).length;
    if (r.sync_status === 'SYNCED') assert.strictEqual(got, tapped, `${r.client_name} says Synced: ${got} of ${tapped} steps on the server`);
  });
  const ORDER = ['Start From', 'in', 'out'];
  // Each visit's steps reached the server exactly once and in order
  const checkOnceInOrder = (expectedPerVisit = 3) => rows().forEach((r) => assert.deepStrictEqual(of(r.client_name).map((s) => s.type), ORDER.slice(0, expectedPerVisit), r.client_name));
  const pending = () => rows().filter((r) => r.sync_status === 'PENDING').length;
  const untilDone = async (max = 60, each = () => {}) => { let runs = 0; while (pending() && runs < max) { await sync(); runs++; each(); tick(30000); } return runs; };
  return { FakeDate, DB, sync, settle, Sync, st, tap, tick, rows, of, pending, untilDone, checkChips, checkOnceInOrder };
};
const offlineOk = (s) => /^\(Offline\) Plot /.test(s.loc);

(async () => {
  const results = [];
  const run = async (name, fn) => { const note = await fn(); results.push(name); console.log('PASS', name, note ? `\n       ${note}` : ''); };

  for (const os of ['ios', 'android']) {
    await run(`1 (${os}) ONLINE: 100 visits, each tap sends exactly that one step at once`, async () => {
      const p = build(os); await p.DB.initDB();
      for (let i = 0; i < 100; i++) {
        const before = p.st.steps.length;
        const v = await p.tap.start(`C${i}`); await p.sync();
        assert.deepStrictEqual(p.of(v.name).map((s) => s.type), ['Start From'], 'Start goes up without waiting for the visit to finish');
        await p.tap.stepIn(v); await p.sync();
        assert.deepStrictEqual(p.of(v.name).map((s) => s.type), ['Start From', 'in']);
        await p.tap.stepOut(v); await p.sync();
        assert.strictEqual(p.st.steps.length, before + 3);
        p.checkChips();
      }
      await p.sync(); await p.sync();
      assert.strictEqual(p.st.steps.length, 300, 'later syncs repeat nothing');
      p.checkOnceInOrder(); assert.strictEqual(p.pending(), 0); assert.strictEqual(p.st.maxInFlight, 1, 'one request at a time');
    });

    await run(`2 (${os}) OFFLINE: 100 complete visits (300 steps, 300 different places), then online`, async () => {
      const p = build(os); await p.DB.initDB(); p.st.online = false;
      for (let i = 0; i < 100; i++) { const v = await p.tap.start(`C${i}`, { offline: true }); await p.tap.stepIn(v, { offline: true }); await p.tap.stepOut(v, { offline: true }); }
      await p.sync(); assert.strictEqual(p.st.steps.length, 0, 'nothing leaves the phone offline');
      p.st.online = true;
      const runs = await p.untilDone(60, p.checkChips);
      p.checkOnceInOrder();
      assert.ok(p.st.steps.every(offlineOk), 'every step has its own street address and the (Offline) tag');
      assert.strictEqual(new Set(p.st.steps.map((s) => s.loc)).size, 300, 'every step carries its own place');
      assert.strictEqual(p.st.maxInFlight, 1, 'one request at a time');
      return `${runs} sync runs 30 s apart, ${p.st.lookups} lookups`;
    });

    await run(`3 (${os}) OFFLINE, visits NOT complete: 60 with Start only, 60 with Start + Step In -> sent on reconnect, finished later`, async () => {
      const p = build(os); await p.DB.initDB(); p.st.online = false;
      const a = [], b = [];
      for (let i = 0; i < 60; i++) a.push(await p.tap.start(`A${i}`, { offline: true }));
      for (let i = 0; i < 60; i++) { const v = await p.tap.start(`B${i}`, { offline: true }); await p.tap.stepIn(v, { offline: true }); b.push(v); }
      p.st.online = true; await p.untilDone(60, p.checkChips);
      a.forEach((v) => assert.deepStrictEqual(p.of(v.name).map((s) => s.type), ['Start From']));
      b.forEach((v) => assert.deepStrictEqual(p.of(v.name).map((s) => s.type), ['Start From', 'in']));
      for (const v of a) { await p.tap.stepIn(v); await p.sync(); await p.tap.stepOut(v); await p.sync(); }
      for (const v of b) { await p.tap.stepOut(v); await p.sync(); }
      p.checkOnceInOrder(); p.checkChips(); assert.strictEqual(p.pending(), 0);
    });

    await run(`4 (${os}) MIXED: 120 visits, every step randomly online / offline, network going up and down -> right tag and address on each`, async () => {
      const p = build(os); await p.DB.initDB(); const want = {};
      for (let i = 0; i < 120; i++) {
        const name = `C${i}`; want[name] = []; let v;
        for (const step of ['start', 'stepIn', 'stepOut']) {
          p.st.online = Math.random() < 0.5; const offline = !p.st.online; want[name].push(offline);
          if (step === 'start') v = await p.tap.start(name, { offline }); else await p.tap[step](v, { offline });
          await p.sync(); p.checkChips();
        }
      }
      p.st.online = true; await p.untilDone(); p.checkOnceInOrder();
      Object.entries(want).forEach(([name, flags]) => p.of(name).forEach((s, i) => {
        assert.ok(s.loc.startsWith(flags[i] ? '(Offline) Plot ' : `(Online) ${['Start', 'In', 'Out'][i]} ${name}`), `${name} ${s.type}: ${s.loc}`);
      }));
    });

    await run(`5 (${os}) TAPPING WHILE IT SYNCS: 300 visits, the next tap lands during the upload, the address lookup or right after the sync read the visit -> no step lost`, async () => {
      const p = build(os); await p.DB.initDB(); let during = 0;
      for (let i = 0; i < 300; i++) {
        const offline = i % 3 === 0;
        const v = await p.tap.start(`C${i}`, { offline });
        let next = 0; const todo = [() => p.tap.stepIn(v, { offline: i % 2 === 0 }), () => p.tap.stepOut(v, { offline: i % 5 === 0 })];
        const maybe = async () => { if (next < 2 && Math.random() < 0.35) { during++; await todo[next++](); } };
        p.st.onPost = async () => { await maybe(); return null; }; p.st.onLookup = maybe; p.st.onRead = maybe;
        await p.sync(); p.st.onPost = null; p.st.onLookup = null; p.st.onRead = null;
        p.checkChips();
        while (next < 2) await todo[next++]();
        await p.sync(); p.checkChips(); p.tick(5000);
      }
      await p.untilDone(); p.checkOnceInOrder(); p.checkChips(); assert.strictEqual(p.pending(), 0);
      assert.ok(p.st.steps.every((s) => !/Lat:/.test(s.loc)));
      p.st.steps.forEach((s) => { if (s.loc.startsWith('(Online)')) assert.ok(s.loc.includes({ 'Start From': 'Start ', in: 'In ', out: 'Out ' }[s.type] + s.who), `${s.who} ${s.type} carries its own address: ${s.loc}`); });
      return `${during} taps landed in the middle of a sync`;
    });
  }

  await run('6 ONE SLOW ADDRESS holds only that step: Start and Step In go, Step Out waits, other visits are not stopped', async () => {
    const p = build('android'); await p.DB.initDB(); p.st.online = false;
    for (let i = 0; i < 40; i++) { const v = await p.tap.start(`C${i}`, { offline: true }); await p.tap.stepIn(v, { offline: true }); await p.tap.stepOut(v, { offline: true }); }
    p.st.online = true; let n = 0;
    p.st.onLookup = async () => { n++; if (n % 3 === 0) throw new Error('no answer'); };   // every third lookup (the Step Outs) fails
    await p.sync();
    assert.ok(p.st.steps.filter((s) => s.type === 'Start From').length >= 1 && p.st.steps.filter((s) => s.type === 'in').length >= 1, 'the ready steps went up');
    p.rows().forEach((r) => { const got = p.of(r.client_name).map((s) => s.type); assert.deepStrictEqual(got, ['Start From', 'in', 'out'].slice(0, got.length), 'never out of order'); });
    p.checkChips(); p.st.onLookup = null;
    await p.untilDone(); p.checkOnceInOrder(); assert.ok(p.st.steps.every(offlineOk));
  });

  await run('7 QUEUE DOWN: server answers 200 + success 0 -> nothing is marked sent, everything goes up when it recovers', async () => {
    const p = build('android'); await p.DB.initDB();
    for (const bad of [0, '0', false]) p.st.onPost = async () => ({ data: { success: bad, message: 'Customer Visit Updated Failed', data: [] } });
    const vs = [];
    for (let i = 0; i < 50; i++) { const v = await p.tap.start(`C${i}`); await p.tap.stepIn(v); await p.tap.stepOut(v); vs.push(v); }
    for (const bad of [0, '0', false]) { p.st.onPost = async () => ({ data: { success: bad } }); await p.sync(); p.tick(30000); assert.strictEqual(p.pending(), 50, `success ${JSON.stringify(bad)} keeps all 50 visits pending`); }
    p.st.onPost = null; await p.untilDone(); p.checkOnceInOrder(); p.checkChips();
  });

  await run('8 FLAKY SERVER: 40% of the requests fail, 100 visits -> every step exactly once, in order', async () => {
    const p = build('ios'); await p.DB.initDB(); p.st.onPost = async () => { if (Math.random() < 0.4) throw new Error('timeout'); return null; };
    for (let i = 0; i < 100; i++) { const v = await p.tap.start(`C${i}`); await p.tap.stepIn(v); await p.tap.stepOut(v); if (i % 10 === 0) { await p.sync(); p.checkChips(); } }
    const runs = await p.untilDone(200, p.checkChips); p.checkOnceInOrder(); assert.strictEqual(p.pending(), 0);
    return `${runs} sync runs`;
  });

  await run('9 GEOCODER DEAD for good: 30 offline visits still go up, with Lat/Lng and the (Offline) tag, none stuck', async () => {
    const p = build('ios'); await p.DB.initDB(); p.st.online = false; p.st.broken = true;
    for (let i = 0; i < 30; i++) { const v = await p.tap.start(`C${i}`, { offline: true }); await p.tap.stepIn(v, { offline: true }); await p.tap.stepOut(v, { offline: true }); }
    p.st.online = true; const runs = await p.untilDone(60, p.checkChips); p.checkOnceInOrder();
    assert.ok(p.st.steps.every((s) => /^\(Offline\) Lat: /.test(s.loc)));
    return `${runs} sync runs`;
  });

  await run('10 A visit from an OLDER app version (no flags, Start and Step In already sent) only sends its Step Out', async () => {
    const p = build('android'); await p.DB.initDB(); const v = await p.tap.start('Old'); await p.sync(); await p.tap.stepIn(v); await p.sync(); await p.tap.stepOut(v);
    assert.strictEqual(p.rows()[0].end_synced, null); await p.sync();
    p.checkOnceInOrder(); p.checkChips(); assert.strictEqual(p.pending(), 0);
  });

  // ---- Which date a visit is listed under (its START date) and the order of the list: the REAL fetchVisits,
  // normalizeVisit and sortVisitsNewestFirst from VisitsScreen.js, against a server that groups and filters like
  // RizoController::customer_visit_history (a visit starts at 'Start From' and belongs to that punch's date)
  const screen = (p) => {
    const src = fs.readFileSync(path.join(APP, 'src/screens/VisitsScreen.js'), 'utf8');
    const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a > 0 && b > a, from); return src.slice(a, b); };
    const code = `${cut('const todayStr', 'const fmtDateStr')}\n${cut('const visitTimeMs', '// While a visit is')}\n${cut('const normalizeVisit', '// Detect if a location')}\n${cut('const fetchVisits = async', '  fetchVisitsRef.current = fetchVisits')}\nreturn { fetchVisits, sortVisitsNewestFirst, todayStr };`;
    const history = (date) => {
      const visits = []; let cur = null;
      [...p.st.steps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).forEach((s) => {
        const punch = { stepinout: s.type, created_time: s.at, location: s.loc, mob_user_locations_pkey: `${s.who}-${s.type}` };
        if (s.type === 'Start From') { cur = { visit_date: s.at.slice(0, 10), customer_name: s.who, punches: [punch] }; visits.push(cur); } else if (cur) cur.punches.push(punch);
      });
      return visits.filter((v) => v.visit_date === date);
    };
    const ui = { visits: [] };
    const deps = { selectedDate: null, fetchSeq: { current: 0 }, setVisits: (l) => { ui.visits = l; }, setLoading: () => {}, user: { user_id: 'U1' },
      Network: { getNetworkStateAsync: async () => ({ isConnected: p.st.online }) }, SyncService: p.Sync, API_ENDPOINTS: { CUSTOMER_VISIT_HISTORY: 'history' },
      axios: { post: async (_u, b) => ({ data: { data: history(b.selected_date) } }) }, getLiveVisits: p.DB.getLiveVisits, getVisitsByDate: p.DB.getVisitsByDate, visitStartDate: p.DB.visitStartDate, console: { log() {} }, Date: p.FakeDate };
    const api = new Function(...Object.keys(deps), code)(...Object.values(deps));
    const list = async (date, opts) => { await api.fetchVisits(date, opts); await p.settle(); return api.sortVisitsNewestFirst(ui.visits).map((v) => v.client_name); };
    const day = (n) => { const d = new p.FakeDate(p.FakeDate.now() + n * 86400000); const pad = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    return { list, day };
  };
  const DAY = 86400000;

  for (const os of ['ios', 'android']) {
    for (const net of ['online', 'offline']) {
      await run(`11 (${os}, ${net}) START DATE: 30 days, each evening a visit is started and left open, finished the next morning -> always listed under the day it started`, async () => {
        const p = build(os); await p.DB.initDB(); const s = screen(p); const offline = net === 'offline'; p.st.online = !offline;
        const first = s.day(0), byDay = {}; let open = null;                       // one open visit at a time, as the app allows

        for (let d = 0; d < 30; d++) {
          const today = s.day(0); byDay[today] = [];
          if (open) {
            assert.strictEqual((await s.list(today))[0], open.name, 'the open visit from yesterday is on top of Today');
            await p.tap.stepIn(open, { offline }); await p.sync(); assert.strictEqual((await s.list(today))[0], open.name, 'and stays there after Step In');
            await p.tap.stepOut(open, { offline }); await p.sync();
            assert.deepStrictEqual(await s.list(today), [], 'stepped out: it leaves Today');
            assert.strictEqual((await s.list(s.day(-1)))[0], open.name, 'and is listed first under the day it started');
          }
          for (let i = 0; i < 2; i++) { const v = await p.tap.start(`D${d}-${i}`, { offline }); await p.tap.stepIn(v, { offline }); await p.tap.stepOut(v, { offline }); byDay[today].unshift(v.name); await p.sync(); }
          open = await p.tap.start(`D${d}-evening`, { offline }); byDay[today].unshift(open.name); await p.sync();
          assert.deepStrictEqual(await s.list(today), byDay[today], 'Today: open visit on top, then latest first');
          p.tick(DAY - 8000);
        }
        await p.tap.stepIn(open, { offline }); await p.tap.stepOut(open, { offline });
        const checkAll = async (when) => { for (const [date, names] of Object.entries(byDay)) assert.deepStrictEqual(await s.list(date), names, `${when}: ${date}`); };
        assert.strictEqual(Object.keys(byDay)[0], first); assert.strictEqual(Object.keys(byDay).length, 30);
        if (offline) { await checkAll('still offline'); p.st.online = true; await p.sync(); await checkAll('sync under way'); }
        await p.untilDone(); await checkAll('synced'); p.checkOnceInOrder(); p.checkChips();
        return `${p.st.steps.length} steps, 30 dates`;
      });
    }
  }

  await run('12 A day with 200 finished visits and one still open -> the open one is on top, the 200 below it latest first, online and offline', async () => {
    const p = build('android'); await p.DB.initDB(); const s = screen(p); const names = [];
    for (let i = 0; i < 200; i++) { const v = await p.tap.start(`T${i}`); await p.tap.stepIn(v); await p.tap.stepOut(v); names.unshift(v.name); if (i % 20 === 0) await p.sync(); }
    const open = await p.tap.start('OPEN'); await p.sync();
    for (const online of [true, false, true]) { p.st.online = online; assert.deepStrictEqual(await s.list(s.day(0)), ['OPEN', ...names], online ? 'online' : 'offline'); }
    await p.tap.stepIn(open); await p.tap.stepOut(open); await p.sync();
    assert.deepStrictEqual(await s.list(s.day(0)), ['OPEN', ...names], 'finished: first because it is the latest');
  });

  await run('13 MIDNIGHT (India time): visits started at 00:05, 05:29, 05:31, 12:00 and 23:55 are all listed under that day, offline and online', async () => {
    const p = build('android'); await p.DB.initDB(); const s = screen(p); p.st.online = false;
    const base = new Date(2026, 10, 26, 0, 0, 0).getTime();
    for (const [h, m] of [[0, 5], [5, 29], [5, 31], [12, 0], [23, 55]]) { p.tick(base + (h * 60 + m) * 60000 - p.FakeDate.now() - 1000); const v = await p.tap.start(`${h}:${m}`, { offline: true }); await p.tap.stepIn(v, { offline: true }); await p.tap.stepOut(v, { offline: true }); }
    const want = ['23:55', '12:0', '5:31', '5:29', '0:5'];
    assert.deepStrictEqual(await s.list('2026-11-26'), want, 'offline'); assert.deepStrictEqual(await s.list('2026-11-25'), [], 'nothing on the day before');
    p.st.online = true; await p.untilDone(); assert.deepStrictEqual(await s.list('2026-11-26'), want, 'online'); assert.deepStrictEqual(await s.list('2026-11-25'), []);
  });

  console.log(`\nAll ${results.length} visit-step scenarios passed`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
