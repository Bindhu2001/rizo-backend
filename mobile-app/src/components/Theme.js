import { Dimensions, Platform } from 'react-native';

// On tablets, App.js caps rendered content to LARGE_SCREEN_CAPPED_WIDTH instead
// of stretching phone-designed screens across the full device width — these
// scaling helpers must size against that same effective width, or components
// sized for a full iPad width would overflow the narrower capped container.
export const LARGE_SCREEN_BREAKPOINT = 600;
export const LARGE_SCREEN_CAPPED_WIDTH = 500;

const { width: rawW, height: H } = Dimensions.get('window');
const W = rawW >= LARGE_SCREEN_BREAKPOINT ? LARGE_SCREEN_CAPPED_WIDTH : rawW;
const BASE_W = 390; // iPhone 14 base
const BASE_H = 844;

/** Effective screen width — capped on tablets to match App.js's rendered container width. Use this instead of Dimensions.get('window') directly. */
export const SCREEN_WIDTH = W;

/** Scales a size linearly with screen width */
export const scale = (size) => Math.round((W / BASE_W) * size);

/** Scales a size linearly with screen height */
export const verticalScale = (size) => Math.round((H / BASE_H) * size);

/**
 * Scales fonts/spacing moderately — won't grow/shrink as aggressively as full scale.
 * factor 0 = no scaling, factor 1 = full linear scale. Default 0.45.
 */
export const moderateScale = (size, factor = 0.45) =>
  Math.round(size + (scale(size) - size) * factor);

/** Percentage of screen width */
export const wp = (pct) => Math.round((W * pct) / 100);

/** Percentage of screen height */
export const hp = (pct) => Math.round((H * pct) / 100);

export const COLORS = {
  primary: '#E91E63', // Vibrant Pink from screenshot
  primaryLight: '#FCE4EC',
  primaryDark: '#AD1457',
  primaryDeep: '#4A148C', // Dark Purple used for buttons

  attendance: '#2ECC71',
  salary: '#F1C40F',
  expense: '#E74C3C',
  visit: '#3498DB',
  leave: '#9B59B6',

  background: '#F8F9FA',
  cardBackground: '#FFFFFF',
  cardSoft: '#F3F4F6',

  text: '#111827', // Darker text for readability
  textLight: '#6B7280',
  textMuted: '#9CA3AF',

  white: '#FFFFFF',
  danger: '#EF4444',
  success: '#10B981',

  border: '#E5E7EB',
  inputBackground: '#F3F4F6',
};

// ─── Semantic theme palettes (light + dark) ──────────────────────────────────
// Consume via useTheme() — see ThemeContext.js.
export const lightTheme = {
  isDark: false,
  bg: '#F8F9FA',
  card: '#FFFFFF',
  cardSoft: '#F3F4F6',
  surface: '#FFFFFF',
  inputBg: '#F9FAFB',
  inputBorder: '#E5E7EB',
  border: '#E5E7EB',
  divider: '#F3F4F6',
  text: '#111827',
  textLight: '#6B7280',
  textMuted: '#9CA3AF',
  primary: '#E91E63',
  primaryLight: '#FCE4EC',
  primaryDeep: '#4A148C',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F97316',
  info: '#3B82F6',
  modalOverlay: 'rgba(0,0,0,0.4)',
  statusBarStyle: 'dark-content',
  statusBarBg: '#FFFFFF',
  tabBarBg: '#FFFFFF',
};

export const darkTheme = {
  isDark: true,
  bg: '#0F172A',
  card: '#1E293B',
  cardSoft: '#0B1220',
  surface: '#1E293B',
  inputBg: '#1E293B',
  inputBorder: '#475569',
  border: '#334155',
  divider: '#1E293B',
  text: '#F1F5F9',
  textLight: '#CBD5E1',
  textMuted: '#94A3B8',
  primary: '#F472B6',
  primaryLight: '#312E81',
  primaryDeep: '#A78BFA',
  danger: '#F87171',
  success: '#34D399',
  warning: '#FB923C',
  info: '#60A5FA',
  modalOverlay: 'rgba(0,0,0,0.7)',
  statusBarStyle: 'light-content',
  statusBarBg: '#0F172A',
  tabBarBg: '#1E293B',
};


export const SIZES = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  
  radius: 16,
  radiusLg: 24,
  radiusFull: 99,
};

export const SHADOWS = {
  light: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
};

// KeyboardAvoidingView behaviour. The Android window already pans for the keyboard (app.json
// softwareKeyboardLayoutMode "pan") and RN Modal windows resize by themselves, so padding on top of
// that pushed content up twice (a gap that vanished once typing started). Only iOS needs the padding.
export const KEYBOARD_AVOID_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : undefined;
