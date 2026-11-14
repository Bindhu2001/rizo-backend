import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { initDB } from './LocalDB';
import { PunchSelfieApi } from './RevampApi';

// Selfie punch — Access page Punch Type "Mobile with selfie" (punchtype F, GRTL / MYPY only; rizo-revamp
// lib/punchSelfie.ts). Each punch takes a front-camera photo (components/SelfieCameraModal.js). The photo is kept in
// the app's own folder and queued in LocalDB punch_selfies with the punch's time, then uploaded by SyncService after
// the punches — so an offline punch's selfie goes up once the phone is back online (the server takes up to 8 days).

export const SELFIE_PUNCH_TYPE = 'F';

// Whether this employee punches with a selfie: punch type F, or rizo-revamp says so (GET /api/mobile/punch-selfie —
// also true for an older Mobile / office-only employee with "Selfie required at punch" ticked). The server's
// answer is kept per user for offline punching; asked again whenever online (at most 4 s, else the kept answer).
const requiredKey = (userId) => `selfie_required_${userId}`;
const SERVER_WAIT_MS = 4000;

export const cachedSelfieRequired = async (userId) => {
  try { return (await AsyncStorage.getItem(requiredKey(userId))) === '1'; } catch (_) { return false; }
};

export const selfieNeededFor = async (userId, punchtype) => {
  if (String(punchtype || '').toUpperCase() === SELFIE_PUNCH_TYPE) return true;
  if (!userId) return false;
  try {
    const required = await Promise.race([
      PunchSelfieApi.required(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), SERVER_WAIT_MS)),
    ]);
    try { await AsyncStorage.setItem(requiredKey(userId), required ? '1' : '0'); } catch (_) {}
    return !!required;
  } catch (_) {
    return cachedSelfieRequired(userId);
  }
};

const SELFIE_DIR = `${FileSystem.documentDirectory}punch-selfies/`;

// The camera's photo (a few MB) is cut down on the phone before it is kept and uploaded: 360 px wide, JPEG 0.6 —
// about 15–30 KB. The server re-encodes it smaller again for storage (lib/punchSelfie.ts).
const SELFIE_WIDTH = 360;
const SELFIE_COMPRESS = 0.6;

// The shrunk copy's uri (the camera's file is deleted), or the camera's own file when shrinking fails
const shrinkSelfie = async (photoUri) => {
  try {
    const context = ImageManipulator.manipulate(photoUri);
    context.resize({ width: SELFIE_WIDTH });
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: SELFIE_COMPRESS, format: SaveFormat.JPEG });
    await FileSystem.deleteAsync(photoUri, { idempotent: true }).catch(() => {});
    return result.uri;
  } catch (e) {
    console.log('[PunchSelfie] could not shrink the photo, keeping the original', e?.message);
    return photoUri;
  }
};

// The punch's time as SyncService sends it to the server (phone clock, 'YYYY-MM-DD HH:MM:SS')
export const selfiePunchTime = (isoString) => {
  const d = new Date(isoString);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * The camera's photo shrunk and moved into the app's own folder (so it survives until uploaded), before the punch
 * is saved — returns its uri. Throws when it can't be kept (e.g. the phone is full): the punch is then not made,
 * since a selfie employee's punch needs its photo.
 */
export const keepSelfiePhoto = async (photoUri) => {
  if (!photoUri) throw new Error('No photo');
  const small = await shrinkSelfie(photoUri);
  await FileSystem.makeDirectoryAsync(SELFIE_DIR, { intermediates: true }).catch(() => {});
  const keptUri = `${SELFIE_DIR}selfie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.moveAsync({ from: small, to: keptUri });
  return keptUri;
};

/** Queues one punch's selfie for upload: keptUri from keepSelfiePhoto, with the punch's own time */
export const queuePunchSelfie = async ({ userId, direction, punchTime, keptUri }) => {
  const id = `selfie_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const database = await initDB();
  await database.runAsync(
    `INSERT INTO punch_selfies (id, user_id, direction, punch_time, photo_uri, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, direction, selfiePunchTime(punchTime), keptUri, null, new Date().toISOString()]
  );
  return id;
};

const removeQueued = async (database, row) => {
  await database.runAsync('DELETE FROM punch_selfies WHERE id = ?', [row.id]);
  if (row.photo_uri) await FileSystem.deleteAsync(row.photo_uri, { idempotent: true }).catch(() => {});
};

/** Uploads every queued selfie (called by SyncService once online). A failed one stays for the next sync. */
export const syncPunchSelfies = async () => {
  const database = await initDB();
  const rows = await database.getAllAsync('SELECT * FROM punch_selfies ORDER BY created_at');
  for (const row of rows) {
    const form = new FormData();
    form.append('direction', row.direction);
    form.append('punch_time', row.punch_time);
    if (row.photo_uri) {
      form.append('photo', { uri: row.photo_uri, name: `${row.id}.jpg`, type: 'image/jpeg' });
    } else {
      form.append('no_selfie_reason', row.reason || 'Camera not available');
    }
    try {
      await PunchSelfieApi.upload(form);
      await removeQueued(database, row);
      console.log(`[PunchSelfie] uploaded ${row.direction} ${row.punch_time}`);
    } catch (e) {
      const status = e?.response?.status;
      // The server refused this one for good (bad photo, too old, selfie punch not offered) — retrying won't help
      if (status === 400 || status === 403) {
        console.log(`[PunchSelfie] dropped ${row.id}: ${e?.response?.data?.error || status}`);
        await removeQueued(database, row);
      } else {
        console.log('[PunchSelfie] upload failed, will retry', e?.message);
      }
    }
  }
};
