/**
 * LocalDB.js
 * 
 * A local SQLite database layer for offline-first operation.
 * All punches are saved here first, then synced to the Cloud.
 */

import * as SQLite from 'expo-sqlite';

let db = null;

// ─── Open / Initialize ────────────────────────────────────────────────────────
export const initDB = async () => {
  if (db) return db; // Already open

  db = await SQLite.openDatabaseAsync('rizo_local.db');

  // Create tables if they don't exist
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS attendance (
      id          TEXT    PRIMARY KEY,
      user_id     TEXT    NOT NULL,
      type        TEXT    NOT NULL CHECK(type IN ('IN', 'OUT')),
      punch_time  TEXT    NOT NULL,
      latitude    REAL    DEFAULT 0,
      longitude   REAL    DEFAULT 0,
      address     TEXT,
      sync_status TEXT    NOT NULL DEFAULT 'PENDING' CHECK(sync_status IN ('PENDING', 'SYNCED', 'FAILED'))
    );

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

    CREATE TABLE IF NOT EXISTS client_visits (
      id            TEXT    PRIMARY KEY,
      user_id       TEXT    NOT NULL,
      client_name   TEXT    NOT NULL,
      location      TEXT,
      latitude      REAL,
      longitude     REAL,
      start_time    TEXT,
      end_time      TEXT,
      status        TEXT    DEFAULT 'SCHEDULED',
      sync_status   TEXT    DEFAULT 'PENDING'
    );

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

  console.log('[LocalDB] Database initialized ✅');
  return db;
};

// ─── Save a new punch ─────────────────────────────────────────────────────────
export const savePunchLocal = async ({ userId, type, punchTime, latitude = 0, longitude = 0, address = null }) => {
  const database = await initDB();
  const lastTypeRow = await database.getFirstAsync(
    `SELECT type FROM attendance WHERE user_id = ? ORDER BY punch_time DESC LIMIT 1`,
    [userId]
  );
  if (lastTypeRow && lastTypeRow.type === type.toUpperCase()) {
    return null;
  }
  const id = `${Date.now()}`;
  await database.runAsync(
    `INSERT INTO attendance (id, user_id, type, punch_time, latitude, longitude, address, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [id, userId, type.toUpperCase(), punchTime, latitude, longitude, address]
  );
  return id;
};

export const getPendingPunches = async () => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM attendance WHERE sync_status = 'PENDING' ORDER BY punch_time ASC`);
};

export const markSynced = async (id) => {
  const database = await initDB();
  await database.runAsync(`UPDATE attendance SET sync_status = 'SYNCED' WHERE id = ?`, [id]);
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

export const getLastPunchType = async (userId) => {
  const database = await initDB();
  const row = await database.getFirstAsync(`SELECT type FROM attendance WHERE user_id = ? ORDER BY punch_time DESC LIMIT 1`, [userId]);
  return row ? row.type : 'NONE';
};

export const getPendingCount = async () => {
  const database = await initDB();
  const row = await database.getFirstAsync(`SELECT COUNT(*) as count FROM attendance WHERE sync_status = 'PENDING'`);
  return row ? row.count : 0;
};

// ─── User Profile ────────────────────────────────────────────────────────────
export const saveUserLocally = async (user, password) => {
  const database = await initDB();
  await database.runAsync(
    `INSERT OR REPLACE INTO user_profile (user_id, employee_name, department, joining_date, date_of_birth, designation, profile_pic, emp_pkey, password, email, phone) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.user_id, user.employee_name, user.department, user.joining_date, user.date_of_birth, user.designation, user.profile_pic, user.emp_pkey, password, user.email || '', user.phone || '']
  );
};

export const updateUserProfileLocal = async (userId, data) => {
  const database = await initDB();
  await database.runAsync(
    `UPDATE user_profile SET employee_name = ?, department = ?, designation = ?, email = ?, phone = ? WHERE user_id = ?`,
    [data.employee_name, data.department, data.designation, data.email, data.phone, userId]
  );
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

// ─── Client Visits ───────────────────────────────────────────────────────────
export const saveVisitLocal = async ({ userId, clientName, location = '' }) => {
  const database = await initDB();
  const id = `visit-${Date.now()}`;
  await database.runAsync(`INSERT INTO client_visits (id, user_id, client_name, location, status, sync_status) VALUES (?, ?, ?, ?, 'SCHEDULED', 'PENDING')`, [id, userId, clientName, location]);
  return id;
};

export const updateVisitStatus = async (id, status, details = {}) => {
  const database = await initDB();
  let query = `UPDATE client_visits SET status = ?`;
  let params = [status];
  if (details.startTime) { query += `, start_time = ?, latitude = ?, longitude = ?`; params.push(details.startTime, details.lat, details.lng); }
  if (details.endTime) { query += `, end_time = ?`; params.push(details.endTime); }
  query += ` WHERE id = ?`; params.push(id);
  await database.runAsync(query, params);
};

export const getTodayVisits = async (userId) => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM client_visits WHERE user_id = ? ORDER BY id DESC`, [userId]);
};

// ─── Leaves ──────────────────────────────────────────────────────────────────
export const saveLeaveLocal = async (leave) => {
  const database = await initDB();
  const id = `leave-${Date.now()}`;
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

// ─── Attendance Regularization ─────────────────────────────────────────────────
export const saveRegLocal = async (reg) => {
  const database = await initDB();
  const id = `reg-${Date.now()}`;
  await database.runAsync(
    `INSERT INTO attendance_reg (id, user_id, punch_date, actual_time, expected_time, type, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [id, reg.userId, reg.punchDate, reg.actualTime, reg.expectedTime, reg.type, reg.reason, new Date().toISOString()]
  );
  return id;
};

export const getRegsLocal = async (userId) => {
  const database = await initDB();
  return await database.getAllAsync(`SELECT * FROM attendance_reg WHERE user_id = ? ORDER BY created_at DESC`, [userId]);
};
