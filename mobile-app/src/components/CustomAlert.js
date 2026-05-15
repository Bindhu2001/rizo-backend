import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react-native';
import { SHADOWS, moderateScale } from './Theme';

const TYPE_CONFIG = {
  success: {
    outerBg: '#ECFDF5',
    innerBg: '#D1FAE5',
    iconColor: '#059669',
    Icon: CheckCircle,
    titleColor: '#065F46',
  },
  error: {
    outerBg: '#FEF2F2',
    innerBg: '#FEE2E2',
    iconColor: '#DC2626',
    Icon: XCircle,
    titleColor: '#991B1B',
  },
  warning: {
    outerBg: '#FFFBEB',
    innerBg: '#FEF3C7',
    iconColor: '#D97706',
    Icon: AlertTriangle,
    titleColor: '#92400E',
  },
  info: {
    outerBg: '#EFF6FF',
    innerBg: '#DBEAFE',
    iconColor: '#2563EB',
    Icon: Info,
    titleColor: '#1E3A8A',
  },
};

/**
 * CustomAlert — drop-in replacement for Alert.alert()
 *
 * Usage:
 *   const [alert, setAlert] = useState(null);
 *   const showAlert = (type, title, message, buttons) => setAlert({ type, title, message, buttons });
 *
 *   <CustomAlert config={alert} onClose={() => setAlert(null)} />
 *
 * Buttons default to a single "OK" if not provided.
 * Button shape: { text: 'OK', style: 'default' | 'cancel' | 'destructive', onPress: () => {} }
 */
const CustomAlert = ({ config, onClose }) => {
  if (!config) return null;

  const { type = 'info', title, message, buttons } = config;
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const { Icon, outerBg, innerBg, iconColor, titleColor } = cfg;

  const resolvedButtons = buttons && buttons.length > 0
    ? buttons
    : [{ text: 'OK', style: 'default' }];

  const handlePress = (btn) => {
    onClose?.();
    btn.onPress?.();
  };

  return (
    <Modal
      visible={!!config}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Icon ring */}
          <View style={[s.iconOuter, { backgroundColor: outerBg }]}>
            <View style={[s.iconInner, { backgroundColor: innerBg }]}>
              <Icon color={iconColor} size={34} strokeWidth={1.8} />
            </View>
          </View>

          {/* Title */}
          <Text style={[s.title, { color: titleColor }]}>{title}</Text>

          {/* Message */}
          {!!message && <Text style={s.message}>{message}</Text>}

          {/* Buttons */}
          <View style={[s.btnRow, resolvedButtons.length === 1 && { justifyContent: 'center' }]}>
            {resolvedButtons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  style={[
                    s.btn,
                    resolvedButtons.length === 1 && { flex: 0, minWidth: 140 },
                    i > 0 && { marginLeft: 10 },
                    isDestructive && s.btnDestructive,
                    isCancel && s.btnCancel,
                    !isDestructive && !isCancel && s.btnPrimary,
                  ]}
                  onPress={() => handlePress(btn)}
                >
                  <Text
                    style={[
                      s.btnText,
                      isDestructive && s.btnTextWhite,
                      isCancel && s.btnTextGray,
                      !isDestructive && !isCancel && s.btnTextWhite,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 28,
    alignItems: 'center',
    ...SHADOWS.medium,
  },

  // Icon
  iconOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Text
  title: {
    fontSize: moderateScale(20),
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: moderateScale(14),
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 4,
  },

  // Buttons
  btnRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 4,
  },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#4A148C',
  },
  btnDestructive: {
    backgroundColor: '#DC2626',
  },
  btnCancel: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  btnText: {
    fontSize: moderateScale(15),
    fontWeight: '700',
  },
  btnTextWhite: { color: '#FFF' },
  btnTextGray: { color: '#374151' },
});

export default CustomAlert;
