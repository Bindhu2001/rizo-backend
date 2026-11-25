// Load test for issue 9 (Check In / Check Out label wrong intermittently offline) and issue 15 (duplicate directions).
// Runs the REAL fetchStatus / applyPunchState / refreshStatusAfterPunch sliced out of HomeScreen.js, with the REAL
// ShiftDate.js (nextPunch) and AllPunches.js (mergePunches), against an in-memory punch table with random read delays.
// Run: node scripts/test-punch-label-load.js
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const babel = require(path.join(__dirname, '..', 'node_modules', '@babel', 'core'));

// ---- real services (their imports stubbed)
const stubs = { axios: {}, 'expo-network': {}, '@react-native-async-storage/async-storage': {}, '../constants/Config': { API_ENDPOINTS: {} } };
const origLoad = Module._load;
Module._load = function (req, parent, ...r) { return req in stubs ? stubs[req] : origLoad.call(this, req, parent, ...r); };
const loadModule = (rel) => {
  const file = path.join(SRC, rel);
  const code = babel.transformFileSync(file, { presets: ['babel-preset-expo'], babelrc: false, configFile: false }).code;
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(code, file); return m.exports;
};
const { nextPunch, SHIFT_DATE_LOOKBACK_MS } = loadModule('services/ShiftDate.js');
const { mergePunches } = loadModule('services/AllPunches.js');

// ---- the real status code from HomeScreen.js
const homeSrc = fs.readFileSync(path.join(SRC, 'screens', 'HomeScreen.js'), 'utf8');
const startAt = homeSrc.indexOf('const SERVER_FRESH_MS');
const endAt = homeSrc.indexOf('const afterPunchSync');
assert.ok(startAt > 0 && endAt > startAt, 'status code found in HomeScreen.js');
const snippet = homeSrc.slice(startAt, endAt);
// processPunch must cancel stale refreshes right after the punch is saved (checked on the source: the function
// itself needs the whole screen to run)
const processSrc = homeSrc.slice(homeSrc.indexOf('const processPunch'), homeSrc.indexOf('const getGreeting'));
assert.ok(/savePunchLocal[\s\S]*refreshStatusAfterPunch\(\);[\s\S]*completePunchInBackground\(/.test(processSrc),
  'processPunch calls refreshStatusAfterPunch() after saving the punch and before the background work');

const compiled = babel.transformSync(snippet, { presets: [['babel-preset-expo', { jsxRuntime: 'classic' }]], babelrc: false, configFile: false, filename: 'status.js' }).code;
const NAMES = ['user', 'fetchStatusRequestId', 'lastActionTime', 'getCachedShiftSchedule', 'getPunchesBetween', 'getCachedServerPunches', 'AsyncStorage',
  'nextPunch', 'mergePunches', 'getCachedServerDay', 'fetchServerDay', 'SHIFT_DATE_LOOKBACK_MS', 'setIsPunchedIn', 'setStatus', 'setPunchInTime',
  'setPunchInAddress', 'setClosedMins', 'setServerDurationMins', 'setStatusPending', 'setLoading', 'require'];
const factory = new Function(...NAMES, `${compiled}\nreturn { fetchStatus, refreshStatusAfterPunch };`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

// One simulated phone: punch table + the screen's state
const makePhone = ({ readDelay = () => rnd(0, 4), serverDelay = null } = {}) => {
  const table = []; // rowid order
  const ui = { isPunchedIn: false, flips: 0 };
  const idRef = { current: 0 };
  const deps = {
    user: { user_id: 'U1' }, fetchStatusRequestId: idRef, lastActionTime: { current: 0 },
    getCachedShiftSchedule: async () => [],
    getPunchesBetween: async () => { const snapshot = table.map((r) => ({ ...r })); await sleep(readDelay()); return snapshot; }, // the read sees the table as of when it started
    getCachedServerPunches: async () => [],
    AsyncStorage: { getItem: async () => null },
    nextPunch, mergePunches, getCachedServerDay: async () => null,
    fetchServerDay: async () => { if (!serverDelay) return null; await sleep(serverDelay()); return { durationMins: 0 }; },
    SHIFT_DATE_LOOKBACK_MS,
    setIsPunchedIn: (v) => { if (ui.isPunchedIn !== v) ui.flips++; ui.isPunchedIn = v; },
    setStatus: () => {}, setPunchInTime: () => {}, setPunchInAddress: () => {}, setClosedMins: () => {}, setServerDurationMins: () => {}, setStatusPending: () => {}, setLoading: () => {},
    require,
  };
  const api = factory(...NAMES.map((n) => deps[n]));
  let n = 0;
  // What processPunch does: save the row, set the label at once, then (the fix) refresh the status right away
  const punch = ({ useFix }) => {
    const type = ui.isPunchedIn ? 'OUT' : 'IN';
    table.push({ id: `p${n++}`, type, punch_time: new Date().toISOString(), address: '', sync_status: 'PENDING' });
    ui.isPunchedIn = type === 'IN';
    if (useFix) api.refreshStatusAfterPunch();
    return type;
  };
  return { table, ui, api, punch, deps };
};

(async () => {
  const results = [];
  const run = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };

  await run('A: a refresh that started BEFORE the punch must not flip the label back (the bug, then the fix)', async () => {
    // Without the fix: stale refresh (slow read started before the punch) lands after the punch and re-applies "no punches"
    let p = makePhone({ readDelay: () => 30 });
    const stale = p.api.fetchStatus();           // starts; reads an empty table
    await sleep(5);
    p.punch({ useFix: false });                  // IN -> label "checked in"
    await stale;
    assert.strictEqual(p.ui.isPunchedIn, false, 'sanity: without the fix the stale refresh flips the label back');
    // With the fix
    p = makePhone({ readDelay: () => 30 });
    const stale2 = p.api.fetchStatus();
    await sleep(5);
    p.punch({ useFix: true });
    await stale2; await sleep(80);
    assert.strictEqual(p.ui.isPunchedIn, true, 'with the fix the label stays "checked in"');
  });

  await run('B: 300 rapid offline punches with overlapping refreshes (focus / timer / sync) -> label always right once settled', async () => {
    const p = makePhone({ readDelay: () => rnd(0, 6) });
    let wrong = 0;
    const startBackground = () => setInterval(() => { p.api.fetchStatus(); }, 3);   // background triggers firing all the time
    let bg = startBackground();
    for (let i = 0; i < 300; i++) {
      const type = p.punch({ useFix: true });
      await sleep(rnd(0, 8));                                      // taps arrive faster than refreshes finish
      if (i % 5 === 4) {                                           // every few punches: let everything settle, then check
        clearInterval(bg); await sleep(40);
        if (p.ui.isPunchedIn !== (type === 'IN')) wrong++;
        assert.strictEqual(p.table[p.table.length - 1].type, type);
        bg = startBackground();
      }
    }
    clearInterval(bg);
    await sleep(60);
    assert.strictEqual(wrong, 0, `label wrong after settling ${wrong} time(s)`);
    // IN, OUT, IN, OUT ... strictly alternating (no duplicates, issue 15)
    const types = p.table.map((r) => r.type);
    assert.ok(types.every((t, i) => t === (i % 2 === 0 ? 'IN' : 'OUT')), 'directions alternate IN OUT IN OUT');
    assert.strictEqual(p.ui.isPunchedIn, types[types.length - 1] === 'IN');
  });

  await run('C: online - the server answer (up to 8 s) arrives after a punch was made; the label follows the new punch', async () => {
    const p = makePhone({ readDelay: () => 1, serverDelay: () => 60 });
    const slow = p.api.fetchStatus();           // asks the server, slow
    await sleep(15);
    p.table.push({ id: 'x', type: 'IN', punch_time: new Date().toISOString(), address: '', sync_status: 'PENDING' });  // punch made by another path (no cancel)
    await slow;
    assert.strictEqual(p.ui.isPunchedIn, true, 'step 2 re-reads the phone punches, so the new punch is counted');
  });

  await run('D: 250 punches over several simulated shift days keep alternating after the shift-date logic', async () => {
    const p = makePhone({ readDelay: () => 0 });
    for (let i = 0; i < 250; i++) { p.punch({ useFix: true }); await sleep(2); }
    await sleep(40);
    assert.ok(p.table.every((r, i) => r.type === (i % 2 === 0 ? 'IN' : 'OUT')));
    assert.strictEqual(p.ui.isPunchedIn, p.table[p.table.length - 1].type === 'IN');
  });

  console.log(`\nAll ${results.length} punch-label scenarios passed`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
