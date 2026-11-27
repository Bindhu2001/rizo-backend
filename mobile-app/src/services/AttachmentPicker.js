import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

// Attaching a picture from the Photos app (Leave / Expense "Add file").
//
// The Add file button used the Files picker only (expo-document-picker), which on iPhone shows the Files app —
// a receipt or certificate that is only in Photos could not be chosen. This opens the Photos picker instead.
// The photo is turned into a JPEG (iPhone photos are HEIC, screenshots PNG; the server takes JPG / JPEG / PDF
// only), at most MAX_WIDTH wide and compressed, so it also stays under the 5 MB limit. The result has the same
// shape DocumentPicker gives ({ uri, name, mimeType, size }) so the preview and upload work as they do for files.
// iOS 14+ and Android use the system photo picker, which needs no permission prompt.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_WIDTH = 2000;
export const JPEG_QUALITY = 0.7;

/** "IMG_1234.HEIC" -> "IMG_1234.jpg" (the content is JPEG now, the name must say so — the server checks it). */
export const toJpegName = (name) => {
  const base = String(name || 'photo').replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.jpg`;
};

/**
 * Open the Photos picker. Resolves to { file } | { canceled: true } | { error: { title, message } }.
 * `deps` lets tests pass fakes for the native modules.
 */
export const pickPhotoAttachment = async (deps = {}) => {
  const picker = deps.ImagePicker || ImagePicker;

  let result;
  try {
    result = await picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1, // the original; it is converted and compressed below
      exif: false,
    });
  } catch (_) {
    return { error: { title: 'Photos Not Available', message: 'Could not open your photos. Please allow photo access for Rizo in Settings and try again.' } };
  }
  if (!result || result.canceled || !result.assets || result.assets.length === 0) return { canceled: true };
  return prepareAttachment(result.assets[0], deps);
};

/**
 * Take a new photo with the camera (a bill / receipt). Same result shape as pickPhotoAttachment. The camera
 * permission is the one the selfie punch already uses (NSCameraUsageDescription mentions receipts).
 */
export const takePhotoAttachment = async (deps = {}) => {
  const picker = deps.ImagePicker || ImagePicker;
  try {
    const perm = await picker.requestCameraPermissionsAsync();
    if (!perm || !perm.granted) {
      return { error: { title: 'Camera Not Allowed', message: 'Please allow camera access for Rizo in Settings to take a photo.' } };
    }
  } catch (_) {
    return { error: { title: 'Camera Not Available', message: 'Could not open the camera. Please try Photo Library instead.' } };
  }
  let result;
  try {
    result = await picker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false });
  } catch (_) {
    return { error: { title: 'Camera Not Available', message: 'Could not open the camera. Please try Photo Library instead.' } };
  }
  if (!result || result.canceled || !result.assets || result.assets.length === 0) return { canceled: true };
  return prepareAttachment(result.assets[0], deps);
};

// The picture as a JPEG at most MAX_WIDTH wide, compressed: { file } | { error }
const prepareAttachment = async (asset, deps) => {
  const manipulator = deps.ImageManipulator || ImageManipulator;
  const saveFormat = deps.SaveFormat || SaveFormat;
  const fs = deps.FileSystem || FileSystem;
  try {
    const context = manipulator.manipulate(asset.uri);
    if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
    const image = await context.renderAsync();
    const out = await image.saveAsync({ compress: JPEG_QUALITY, format: saveFormat.JPEG });
    let size = null;
    try {
      const info = await fs.getInfoAsync(out.uri);
      size = info && typeof info.size === 'number' ? info.size : null;
    } catch (_) { /* size stays unknown */ }
    return { file: { uri: out.uri, name: toJpegName(asset.fileName), mimeType: 'image/jpeg', size } };
  } catch (_) {
    return { error: { title: 'Error', message: 'Could not prepare this photo. Please try another one.' } };
  }
};
