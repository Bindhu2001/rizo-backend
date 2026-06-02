import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MapPin, Shield } from 'lucide-react-native';
import { useTheme } from './ThemeContext';
import { COLORS, SHADOWS, moderateScale } from './Theme';

export default function LocationDisclosureModal({ visible, onAccept, onDecline }) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card }, SHADOWS.large]}>
          <View style={[styles.iconWrap, { backgroundColor: '#EEF2FF' }]}>
            <MapPin color={theme.primaryDeep} size={28} strokeWidth={2} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Location Access Required</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.body, { color: theme.textLight }]}>
              Rizo collects your device's precise location data to enable the following features:
            </Text>

            <View style={styles.bullet}>
              <View style={[styles.dot, { backgroundColor: theme.primaryDeep }]} />
              <Text style={[styles.bulletText, { color: theme.textLight }]}>
                <Text style={{ fontWeight: '700' }}>Attendance Punching</Text> — your GPS coordinates are recorded when you punch in or out to verify you are at an authorised office location.
              </Text>
            </View>

            <View style={styles.bullet}>
              <View style={[styles.dot, { backgroundColor: theme.primaryDeep }]} />
              <Text style={[styles.bulletText, { color: theme.textLight }]}>
                <Text style={{ fontWeight: '700' }}>Visit Tracking</Text> — your location is captured when you log a client visit so the visit record includes an accurate address.
              </Text>
            </View>

            <View style={[styles.notice, { backgroundColor: '#EEF2FF' }]}>
              <Shield color={theme.primaryDeep} size={14} strokeWidth={2} style={{ marginTop: 2 }} />
              <Text style={[styles.noticeText, { color: theme.primaryDeep }]}>
                Location is only accessed while the app is open. Data is transmitted securely to your organisation's server and is never sold or shared with third parties.
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.btnAccept, { backgroundColor: theme.primaryDeep }]}
            onPress={onAccept}
            activeOpacity={0.85}
          >
            <Text style={styles.btnAcceptText}>Allow Location Access</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnDecline, { borderColor: theme.border }]}
            onPress={onDecline}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnDeclineText, { color: theme.textMuted }]}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxHeight: '85%',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  scroll: {
    width: '100%',
    marginBottom: 20,
  },
  body: {
    fontSize: moderateScale(13),
    lineHeight: 20,
    marginBottom: 14,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: moderateScale(13),
    lineHeight: 20,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: moderateScale(12),
    lineHeight: 18,
  },
  btnAccept: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnAcceptText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
  btnDecline: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnDeclineText: {
    fontWeight: '600',
    fontSize: moderateScale(14),
  },
});
