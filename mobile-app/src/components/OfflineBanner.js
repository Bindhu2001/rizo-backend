import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';
import * as Network from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, RefreshCcw } from 'lucide-react-native';
import { COLORS, SHADOWS } from './Theme';

const { width, height } = Dimensions.get('window');

const OfflineBanner = ({ currentRoute }) => {
  const [status, setStatus] = useState('online'); // 'online', 'offline', 'restored'
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  // Screens that are allowed to work offline (only show banner)
  const OFFLINE_ALLOWED_SCREENS = ['HomeTab', 'Visits', 'Splash'];
  const isBlockerMode = !OFFLINE_ALLOWED_SCREENS.includes(currentRoute);

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const isActuallyOffline = !state.isConnected || !state.isInternetReachable;
        
        if (isActuallyOffline && status !== 'offline') {
          setStatus('offline');
          // Banner animation
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8
          }).start();
          // Blocker animation
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        } else if (!isActuallyOffline && status === 'offline') {
          setStatus('restored');
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(slideAnim, {
                toValue: -100,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
              })
            ]).start(() => setStatus('online'));
          }, 2000);
        }
      } catch (e) {
        console.log('Network check error', e);
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 3000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'online') return null;

  const isRestored = status === 'restored';

  // 1. Full Screen Blocker UI
  if (isBlockerMode && status === 'offline') {
    return (
      <Animated.View style={[styles.blockerContainer, { opacity: fadeAnim }]}>
        <View style={styles.blockerCard}>
          <View style={styles.iconCircle}>
            <WifiOff color={COLORS.danger} size={48} strokeWidth={1.5} />
          </View>
          <Text style={styles.blockerTitle}>No Internet Connection</Text>
          <Text style={styles.blockerSub}>This page requires an active internet connection to function properly.</Text>
          <View style={styles.offlineHint}>
            <Text style={styles.hintText}>Home and Visits pages are available offline.</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  // 2. Small Pill Banner UI (for Home/Visits)
  return (
    <Animated.View 
      style={[
        styles.pillBanner, 
        { 
          transform: [{ translateY: slideAnim }],
          top: insets.top + 10,
          backgroundColor: isRestored ? '#10B981' : '#1F2937'
        }
      ]}
    >
      <View style={[styles.dot, { backgroundColor: isRestored ? '#FFF' : '#EF4444' }]} />
      <Text style={styles.pillText}>
        {isRestored ? 'Back Online' : 'Offline Mode'}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Blocker Styles
  blockerContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(249, 250, 251, 0.98)',
    zIndex: 10000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  blockerCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  blockerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  blockerSub: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  offlineHint: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },

  // Pill Banner Styles
  pillBanner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    zIndex: 9999,
    ...SHADOWS.medium,
    minWidth: 140,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

export default OfflineBanner;
