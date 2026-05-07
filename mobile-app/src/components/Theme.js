import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');
const BASE_W = 390; // iPhone 14 base
const BASE_H = 844;

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

