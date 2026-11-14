import React, { useState } from 'react';
import { View, Image, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from './AppText';
import { moderateScale } from './Theme';
import { usePhotoSource, retryPhoto } from '../services/photoSource';

// Team members' punch selfies (rizo-revamp /api/mobile/team-selfies; the photo from /api/mobile/punch-selfie/<id>,
// which only the employee and their leave authoriser / approver can open). Used by the Home "My Team" tile and the
// My Team page.

/** empFkey → that person's latest selfie with a photo today (rows come newest first) */
export const latestSelfieByEmp = (rows) => {
  const map = new Map();
  (rows || []).forEach((r) => {
    if (r.hasPhoto && !map.has(r.empFkey)) map.set(r.empFkey, r);
  });
  return map;
};

const selfiePath = (selfie) => `/api/mobile/punch-selfie/${selfie.id}`;

/** A selfie in a box (round when round), with an IN / OUT tag unless hideTag; nothing if it can't load */
export const SelfiePhoto = ({ selfie, size, round, hideTag, style }) => {
  const [failed, setFailed] = useState(false);
  const source = usePhotoSource(selfiePath(selfie));
  if (failed) return null;
  const box = { width: size, height: round ? size : size * (4 / 3), borderRadius: round ? size / 2 : moderateScale(10) };
  return (
    <View style={[box, styles.frame, style]}>
      {source && (
        <Image
          source={source}
          style={box}
          onError={() => { retryPhoto(source).then((again) => { if (!again) setFailed(true); }); }}
        />
      )}
      {!hideTag && (
        <View style={[styles.tag, { backgroundColor: selfie.direction === 'OUT' ? '#E11D48' : '#059669' }]}>
          <Text style={styles.tagText}>{selfie.direction}</Text>
        </View>
      )}
    </View>
  );
};

/** Tap target for a selfie on My Team: a small photo that opens large with the name and time */
export const SelfieThumb = ({ selfie, name, size = moderateScale(40) }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityLabel={`${name}'s punch selfie`}>
        <SelfiePhoto selfie={selfie} size={size} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.viewer}>
            <SelfiePhoto selfie={selfie} size={moderateScale(260)} hideTag />
            <Text style={styles.viewerName} numberOfLines={1}>{name}</Text>
            <Text style={styles.viewerSub}>
              Check {selfie.direction === 'OUT' ? 'Out' : 'In'} · {selfie.time}{selfie.source === 'WEB' ? ' · Web' : ''}
            </Text>
          </View>
          <View style={styles.close}><X color="#FFF" size={26} /></View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#E2E8F0' },
  tag: { position: 'absolute', bottom: 2, left: 2, borderRadius: 4, paddingHorizontal: 3, paddingVertical: 0.5 },
  tagText: { color: '#FFF', fontSize: moderateScale(8), fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  viewer: { alignItems: 'center' },
  viewerName: { color: '#FFF', fontSize: moderateScale(17), fontWeight: '800', marginTop: moderateScale(14), maxWidth: moderateScale(280) },
  viewerSub: { color: 'rgba(255,255,255,0.75)', fontSize: moderateScale(13), marginTop: 4 },
  close: { position: 'absolute', top: moderateScale(48), right: moderateScale(20) },
});
