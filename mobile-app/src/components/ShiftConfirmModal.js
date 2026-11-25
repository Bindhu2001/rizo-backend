import React from 'react';
import { View, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Power, Fingerprint } from 'lucide-react-native';
import { Text } from './AppText';
import { COLORS, moderateScale } from './Theme';

// "Attendance direction is decided by your shift policy" — shown before every punch.
// Its own memoised component (was inline in the very large HomeScreen): opening it
// re-renders only this, so on iOS the buttons answer at once instead of waiting
// for the whole Home screen to re-render. No fade animation for the same reason.
// onShow / onConfirmTap are timing hooks for the punch-latency log.
const ShiftConfirmModal = ({ visible, type, punching, onCancel, onConfirm, onShow }) => {
  const isOut = type === 'OUT';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      onShow={onShow}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={[styles.modalPowerCircle, {
            backgroundColor: isOut ? '#FFF0F0' : '#EEF2FF',
            borderColor: isOut ? '#FFE4E4' : '#C7D2FE',
          }]}>
            {isOut
              ? <Power color={COLORS.danger} size={32} />
              : <Fingerprint color={COLORS.primaryDeep} size={32} />}
          </View>
          <Text style={styles.modalTitle}>Attendance</Text>
          <Text style={styles.modalSub}>Attendance direction is decided by your shift policy</Text>
          <View style={styles.modalBtns}>
            <TouchableOpacity style={styles.cancelBtn} disabled={punching} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.okBtn, { backgroundColor: isOut ? COLORS.danger : COLORS.primaryDeep }, punching && { opacity: 0.6 }]}
              disabled={punching}
              onPress={onConfirm}
            >
              {punching ? <ActivityIndicator color="#FFF" /> : <Text style={styles.okBtnText}>OK</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: moderateScale(20) },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: moderateScale(32), padding: moderateScale(24), alignItems: 'center' },
  modalPowerCircle: { width: moderateScale(80), height: moderateScale(80), borderRadius: moderateScale(40), justifyContent: 'center', alignItems: 'center', marginBottom: moderateScale(20), borderWidth: 1 },
  modalTitle: { fontSize: moderateScale(22), fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: moderateScale(10) },
  modalSub: { fontSize: moderateScale(14), color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: moderateScale(32) },
  modalBtns: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, paddingVertical: moderateScale(16), marginRight: moderateScale(12), borderRadius: moderateScale(16), borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: 'transparent' },
  cancelBtnText: { color: COLORS.text, fontWeight: '700' },
  okBtn: { flex: 1, paddingVertical: moderateScale(16), borderRadius: moderateScale(16), alignItems: 'center' },
  okBtnText: { color: '#FFF', fontWeight: '800' },
});

export default React.memo(ShiftConfirmModal);
