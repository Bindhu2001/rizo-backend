/**
 * LocalDB.js
 * 
 * Optimized local SQLite database layer for offline-first operation.
 * Refined to ensure maximum reliability during zero-connection states.
 */

import * as SQLite from 'expo-sqlite';

let db = null;
let initPromise = null;

// ─── Open / Initialize ────────────────────────────────────────────────────────
export const initDB = async () => {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      db = await SQLite.openDatabaseAsync('rizo_local.db');

    // Create tables individually to ensure one failure doesn't block the rest
    await db.execAsync('PRAGMA journal_mode = WAL;');

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS attendance (
        id          TEXT    PRIMARY KEY,
        user_id     TEXT    NOT NULL,
        type        TEXT    NOT NULL,
        punch_time  TEXT    NOT NULL,
        latitude    REAL    DEFAULT 0,
        longitude   REAL    DEFAULT 0,
        address     TEXT,
        sync_status TEXT    DEFAULT 'PENDING',
        is_offline  INTEGER DEFAULT 0
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_profile (
        user_id       TEXT PRIMARY KEY,
        employee_name TEXT,
        department    TEXT,
        joining_date  TEXT,
        date_of_birth TEXT,
        designation   TEXT,
        profile_pic   TEXT,
        emp_pkey      TEXT,
        password      TEXT NOT NULL,
        email         TEXT,
        phone         TEXT
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS client_visits (
        id              TEXT    PRIMARY KEY,
        user_id         TEXT    NOT NULL,
        client_name     TEXT    NOT NULL,
        contact_number  TEXT,
        contact_person  TEXT,
        purpose         TEXT,
        location        TEXT,
        latitude        REAL,
        longitude       REAL,
        start_time      TEXT,
        step_in_time    TEXT,
        step_in_lat     REAL,
        step_in_lng     REAL,
        step_in_address TEXT,
        end_time        TEXT,
        end_lat         REAL,
        end_lng         REAL,
        end_address     TEXT,
        status          TEXT    DEFAULT 'SCHEDULED',
        sync_status     TEXT    DEFAULT 'PENDING',
        created_at      TEXT
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS leaves (
        id            TEXT    PRIMARY KEY,
        user_id       TEXT    NOT NULL,
        leave_type    TEXT    NOT NULL,
        from_date     TEXT    NOT NULL,
        to_date       TEXT    NOT NULL,
        from_half     TEXT    DEFAULT 'Full Day',
        to_half       TEXT    DEFAULT 'Full Day',
        status        TEXT    DEFAULT 'PENDING',
        reason        TEXT,
        authorized_by TEXT,
        approved_by   TEXT,
        contact_no    TEXT,
        created_at    TEXT    NOT NULL
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS attendance_reg (
        id            TEXT    PRIMARY KEY,
        user_id       TEXT    NOT NULL,
        punch_date    TEXT    NOT NULL,
        actual_time   TEXT,
        expected_time TEXT,
        type          TEXT,
        reason        TEXT,
        status        TEXT    DEFAULT 'PENDING',
        created_at    TEXT    NOT NULL
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          TEXT    PRIMARY KEY,
        user_id     TEXT    NOT NULL,
        title       TEXT    NOT NULL,
        message     TEXT    NOT NULL,
        type        TEXT    NOT NULL,
        is_read     INTEGER DEFAULT 0,
        sync_status TEXT    DEFAULT 'SYNCED',
        created_at  TEXT    NOT NULL
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS punch_config (
        user_id    TEXT PRIMARY KEY,
        config     TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // ─── Migrations ───
    // Column additions for existing tables (won't affect new installs)
    const migrations = [
      { table: 'attendance', cols: ['address', 'sync_status', 'is_offline'] },
      { table: 'user_profile', cols: ['password', 'email', 'phone', 'emp_pkey', 'designation'] },
      { table: 'client_visits', cols: ['contact_number', 'contact_person', 'purpose', 'step_in_time', 'created_at', 'step_in_lat', 'step_in_lng', 'end_lat', 'end_lng', 'step_in_address', 'end_address', 'start_synced', 'step_in_synced'] },
      { table: 'leaves', cols: ['from_half', 'to_half', 'authorized_by', 'approved_by', 'contact_no', 'created_at'] },
      { table: 'attendance_reg', cols: ['actual_time', 'expected_time', 'reason', 'created_at'] }
    ];

    for (const m of migrations) {
      for (const col of m.cols) {
        try { await db.execAsync(`ALTER TABLE ${m.table} ADD COLUMN ${col} TEXT`); } catch (_) { }
      }
    }

    console.log('[LocalDB] Database migrations and initialization successful ✅');
    return db;
  } catch (error) {
    console.error('[LocalDB] Initialization failed:', error);
    db = null;
    initPromise = null;
    throw error;
  }
  })();

  return initPromise;
};

// ─── Attendance ──────────────────────────────────────────────────────────────
export const savePunchLocal = async ({ userId, type, punchTime, latitude = 0, longitude = 0, address = null, isOffline = 0 }) => {
  const database = await initDB();
  // Duplicate punch sequence guard removed to allow better multi-punch reliability in same session
  /*
  const lastTypeRow = await database.getFirstAsync(
    `SELECT type FROM attendance WHERE user_id = ? ORDER BY punch_time DESC LIMIT 1`,
    [userId]
  );
  if (lastTypeRow && lastTypeRow.type === type.toUpperCase()) {
    console.log('[LocalDB] Duplicate punch sequence ignored');
    return null;
  }
  */

  const id = `att_${Date.now()}`;
  try {
    await database.runAsync(
      `INSERT INTO attendance (id, user_id, type, punch_time, latitude, longitude, address, sync_status, is_offline)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, userId, type.toUpperCase(), punchTime, latitude, longitude, address, isOffline ? 1 : 0]
    );
    return id;
  } catch (e) {
    console.error('[LocalDB] Failed to insert punch:', e);
    throw e;
  }
};

export const getPendingCount = async () => {
  const database = await initDB();
  const row = await database.getFirstAsync(`SELECT COUNT(*) as count FROM attendance WHERE sync_status = 'PENDING'`);
  return row ? row.count : 0;
};

export const getLastPunchType = async (userId) => {
  const database = await initDB();
  const row = await database.getFirstAsync(`SELECT type FROM attendance WHERE user_id = ? ORDER BY punch_time DESC LIMIT 1`, [userId]);
  return row ? row.type : 'NONE';
};

// ─── User Profile ────────────────────────────────────────────────────────────
export const saveUserLocally = async (user, password) => {
  const database = await initDB();
  try {
    await database.runAsync(
      `INSERT OR REPLACE INTO user_profile (user_id, employee_name, department, joining_date, date_of_birth, designation, profile_pic, emp_pkey, password, email, phone) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.user_id, user.employee_name, user.department, (user.joining_date || ''), (user.date_of_birth || ''), (user.designation || ''), (user.profile_pic || ''), (user.emp_pkey || ''), password, (user.email || ''), (user.phone || '')]
    );
  } catch (e) {
    console.error('[LocalDB] saveUserLocally failed:', e);
    throw e;
  }
};

export const updateUserProfileLocal = async (userId, data) => {
  const database = await initDB();
  try {
    await database.runAsync(
      `UPDATE user_profile SET employee_name = ?, department = ?, designation = ?, email = ?, phone = ?, profile_pic = ?, date_of_birth = ?, joining_date = ? WHERE user_id = ?`,
      [data.employee_name || '', data.department || '', data.designation || '', data.email || '', data.phone || '', data.profile_pic || '', data.date_of_birth || '', data.joining_date || '', userId]
    );
  } catch (e) {
    console.error('[LocalDB] updateUserProfileLocal failed:', e);
    throw e;
  }
};

export const getLocalUser = async (user_id, password) => {
  const database = await initDB();
  if (password) {
    return await database.getFirstAsync(`SELECT * FROM user_profile WHERE user_id = ? AND password = ?`, [user_id, password]);
  } else {
    return await database.getFirstAsync(`SELECT * FROM user_profile WHERE user_id = ?`, [user_id]);
  }
};

export const clearUserSession = async () => {
  const database = await initDB();
  await database.runAsync(`DELETE FROM user_profile`);
};

export const getLoggedUser = async () => {
  const database = await initDB();
  try {
    return await database.getFirstAsync(`SELECT * FROM user_profile LIMIT 1`);
  } catch (e) {
    return null;
  }
};

// ─── History & Other Methods ──────────────────────────────────────────────────
export const getRawPunchesForMonth = async (userId, monthStr) => {
  const database = await initDB();
  return await database.getAllAsync(
    `SELECT * FROM attendance WHERE user_id = ? AND punch_time LIKE ? ORDER BY punch_time DESC`,
    [userId, `${monthStr}%`]
  );
};

export const getTodayLocalHistory = async (userId) => {
  const database = await initDB();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return await database.getAllAsync(
    `SELECT * FROM attendance WHERE user_id = ? AND punch_time >= ? ORDER BY punch_time DESC`,
    [userId, todayStart.toISOString()]
  );
};

export const saveVisitLocal = async ({ userId, clientName, contactNumber = '', contactPerson = '', purpose = '', location = '', lat = 0, lng = 0 }) => {
  const database = await initDB();
  const id = `visit_${Date.now()}`;
  await database.runAsync(
    `INSERT INTO client_visits (id, user_id, client_name, contact_number, contact_person, purpose, location, latitude, longitude, status, sync_status, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', 'PENDING', ?)`,
    [id, userId, clientName, contactNumber, contactPerson, purpose, location, lat, lng, new Date().toISOString()]
  );
  return id;
};

export const updateVisitStatus = async (id, status, details = {}) => {
  const database = await initDB();
  let query = `UPDATE client_visits SET status = ?, sync_status = 'PENDING'`;
  let params = [status];
  if (details.startTime) {
    query += `, start_time = ?, latitude = ?, longitude = ?`;
    params.push(details.startTime, details.lat || 0, details.lng || 0);
  }
  if (details.stepInTime) {
    query += `, step_in_time = ?, step_in_lat = ?, step_in_lng = ?, step_in_address = ?`;
    params.push(details.stepInTime, details.lat || 0, details.lng || 0, details.address || '');
  }
  if (details.endTime) {
    query += `, end_time = ?, end_lat = ?, end_lng = ?, end_address = ?`;
    params.push(details.endTime, details.lat || 0, details.lng || 0, details.address || '');
  }
  if (details.clientName !== undefined) {
    query += `, client_name = ?`;
    params.push(details.clientName);
  }
  if (details.contactNumber !== undefined) {
    query += `, contact_number = ?`;
    params.push(details.contactNumber);
  }
  if (details.contactPerson !== undefined) {
    query += `, contact_person = ?`;
    params.push(details.contactPerson);
  }
  if (details.purpose !== undefined) {
    query += `, purpose = ?`;
    params.push(details.purpose);
  }
  query += ` WHERE id = ?`;
  params.push(id);
  await database.runAsync(query, params);
};

export const getTodayVisits = async (userId) => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM client_visits WHERE user_id = ? ORDER BY id DESC`, [userId]);
};

export const getVisitsByDate = async (userId, dateStr) => {
  const database = await initDB();
  return await database.getAllAsync(
    `SELECT * FROM client_visits WHERE user_id = ? AND date(created_at) = ? ORDER BY id DESC`,
    [userId, dateStr]
  );
};

export const saveLeaveLocal = async (leave) => {
  const database = await initDB();
  const id = `leave_${Date.now()}`;
  await database.runAsync(
    `INSERT INTO leaves (id, user_id, leave_type, from_date, to_date, from_half, to_half, reason, status, authorized_by, approved_by, contact_no, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    [id, leave.userId, leave.leaveType, leave.fromDate, leave.toDate, leave.fromHalf, leave.toHalf, leave.reason, leave.authorizedBy, leave.approvedBy, leave.contactNo, new Date().toISOString()]
  );
  return id;
};

export const getLeavesLocal = async (userId) => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM leaves WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
};

export const saveRegLocal = async (reg) => {
  const database = await initDB();
  const id = `reg_${Date.now()}`;
  await database.runAsync(
    `INSERT INTO attendance_reg (id, user_id, punch_date, actual_time, expected_time, type, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [id, reg.userId, reg.punchDate, reg.actual_time, reg.expected_time, reg.type, reg.reason, new Date().toISOString()]
  );
  return id;
};

export const getRegsLocal = async (userId) => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM attendance_reg WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const saveNotificationLocal = async (notif) => {
  const database = await initDB();
  const id = `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  await database.runAsync(
    `INSERT INTO notifications (id, user_id, title, message, type, is_read, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'SYNCED', ?)`,
    [id, notif.userId, notif.title, notif.message, notif.type, new Date().toISOString()]
  );
  return id;
};

export const getNotificationsLocal = async (userId) => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
};

export const markNotificationsAsReadLocal = async (userId, id = null) => {
  const database = await initDB();
  if (id) {
    await database.runAsync(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id]);
  } else {
    await database.runAsync(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]);
  }
};

// ─── Punch Config ─────────────────────────────────────────────────────────────

export const savePunchConfig = async (userId, configData) => {
  const database = await initDB();
  await database.runAsync(
    `INSERT OR REPLACE INTO punch_config (user_id, config, updated_at) VALUES (?, ?, ?)`,
    [userId, JSON.stringify(configData), new Date().toISOString()]
  );
};

export const getPunchConfig = async (userId) => {
  const database = await initDB();
  const row = await database.getFirstAsync(`SELECT config FROM punch_config WHERE user_id = ?`, [userId]);
  if (!row) return null;
  try { return JSON.parse(row.config); } catch (_) { return null; }
};

