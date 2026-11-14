import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, X } from 'lucide-react-native';
import { Text } from './AppText';
import { COLORS, moderateScale } from './Theme';

// Front-camera selfie for a "Mobile with selfie" punch (services/PunchSelfie.js). Front camera only — there is no
// switch to the back camera. The selfie is required: no photo, no punch. Cancel (or a camera that won't work)
// cancels the punch; the employee can try again, or ask HR (regularisation) when the phone's camera is broken.
//
//   onCapture(uri)   the photo's temporary file
//   onCancel()
export default function SelfieCameraModal({ visible, direction, onCapture, onCancel }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  // The system permission prompt is shown by itself at most once per opening
  const askedThisOpen = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setReady(false);
    setTaking(false);
    setCameraError(null);
    askedThisOpen.current = false;
  }, [visible]);

  useEffect(() => {
    if (!visible || !permission || permission.granted || !permission.canAskAgain || askedThisOpen.current) return;
    askedThisOpen.current = true;
    requestPermission();
  }, [visible, permission]);

  const takeSelfie = async () => {
    if (!cameraRef.current || !ready || taking) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, exif: false, shutterSound: false });
      if (!photo?.uri) throw new Error('No photo');
      onCapture(photo.uri);
    } catch (e) {
      console.log('[Selfie] capture failed', e?.message);
      setCameraError('The photo could not be taken.');
      setTaking(false);
    }
  };

  const denied = permission && !permission.granted;
  const label = direction === 'OUT' ? 'Check Out' : 'Check In';

  let body;
  if (!permission) {
    body = <ActivityIndicator color="#FFF" size="large" />;
  } else if (denied) {
    body = (
      <View style={styles.messageBox}>
        <Text style={styles.messageTitle}>Camera access needed</Text>
        <Text style={styles.messageText}>
          Your attendance is set to punch with a selfie. Allow camera access to {label.toLowerCase()}.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.primaryBtnText}>{permission.canAskAgain ? 'Allow camera' : 'Open Settings'}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (cameraError) {
    body = (
      <View style={styles.messageBox}>
        <Text style={styles.messageTitle}>Camera not available</Text>
        <Text style={styles.messageText}>
          {/* The camera's own error ("Requested device not found") may come without a full stop */}
          {cameraError.replace(/[.!?]?\s*$/, '.')} A selfie is needed to {label.toLowerCase()}. Please try again — if the
          camera still doesn't work, contact HR.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { setCameraError(null); setReady(false); }}>
          <Text style={styles.primaryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    body = (
      <>
        <View style={styles.previewWrap}>
          <CameraView
            ref={cameraRef}
            style={styles.preview}
            facing="front"
            mirror
            onCameraReady={() => setReady(true)}
            onMountError={(e) => setCameraError(e?.message || 'The camera could not start.')}
          />
          {!ready && <ActivityIndicator style={StyleSheet.absoluteFill} color="#FFF" size="large" />}
        </View>
        <Text style={styles.hint}>Keep your face inside the frame</Text>
        <TouchableOpacity
          style={[styles.shutter, (!ready || taking) && { opacity: 0.5 }]}
          disabled={!ready || taking}
          onPress={takeSelfie}
          accessibilityLabel={`Take selfie and ${label.toLowerCase()}`}
        >
          {taking ? <ActivityIndicator color={COLORS.primaryDeep} /> : <Camera color={COLORS.primaryDeep} size={30} />}
        </TouchableOpacity>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Selfie to {label}</Text>
          <TouchableOpacity onPress={onCancel} disabled={taking} hitSlop={12} accessibilityLabel="Cancel punch">
            <X color="#FFF" size={26} />
          </TouchableOpacity>
        </View>
        <View style={styles.body}>{body}</View>
      </View>
    </Modal>
  );
}

const PREVIEW = moderateScale(280);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1220', paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewWrap: {
    width: PREVIEW, height: PREVIEW, borderRadius: PREVIEW / 2, overflow: 'hidden',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.85)', backgroundColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  preview: { width: '100%', height: '100%' },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 18 },
  shutter: {
    marginTop: 36, width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: 'rgba(255,255,255,0.35)',
  },
  messageBox: { width: '100%', alignItems: 'center', paddingHorizontal: 8 },
  messageTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  messageText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  primaryBtn: { backgroundColor: COLORS.primaryDeep, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, minWidth: 220, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
