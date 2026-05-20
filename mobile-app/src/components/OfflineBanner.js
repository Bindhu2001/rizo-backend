import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform, TouchableOpacity } from 'react-native';
import * as Network from 'expo-network';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Home } from 'lucide-react-native';
import { COLORS, SHADOWS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { getLoggedUser } from '../services/LocalDB';
import SyncService from '../services/SyncService';

const { width, height } = Dimensions.get('window');

const OfflineBanner = ({ currentRoute, navigationRef, onBarVisibleChange }) => {
  const theme = useTheme();
  const [status, setStatus] = useState('online'); // 'online', 'offline', 'restored'
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(-100)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const BAR_SCREENS = ['HomeTab'];
  const SILENT_SCREENS = ['Visits', 'Splash'];

  useEffect(() => {
    const isBar = BAR_SCREENS.includes(currentRoute);
    const isSilent = SILENT_SCREENS.includes(currentRoute);
    onBarVisibleChange?.(status !== 'online' && isBar && !isSilent);
  }, [status, currentRoute]);

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
          SyncService.syncAll().catch(() => {});
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

  // Visits and Splash: show nothing
  if (SILENT_SCREENS.includes(currentRoute)) return null;

  const isRestored = status === 'restored';
  const isBarScreen = BAR_SCREENS.includes(currentRoute);

  // 1. Full Screen Blocker UI (all pages except Home/Visits/Splash)
  if (!isBarScreen && status === 'offline') {
    return (
      <Animated.View style={[styles.blockerContainer, { opacity: fadeAnim, backgroundColor: theme.isDark ? 'rgba(15,23,42,0.98)' : 'rgba(249, 250, 251, 0.98)' }]}>
        <View style={[styles.blockerCard, { backgroundColor: theme.card }]}>
          <View style={[styles.iconCircle, { backgroundColor: theme.isDark ? '#4C1D24' : '#FEF2F2' }]}>
            <WifiOff color={COLORS.danger} size={48} strokeWidth={1.5} />
          </View>
          <Text style={[styles.blockerTitle, { color: theme.text }]}>No Internet Connection</Text>
          <Text style={[styles.blockerSub, { color: theme.textLight }]}>This page requires an active internet connection to function properly.</Text>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={async () => {
              try {
                const user = await getLoggedUser();
                navigationRef?.current?.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'Main', params: { user: user || undefined, screen: 'HomeTab' } }],
                  })
                );
              } catch (_) {
                navigationRef?.current?.dispatch(
                  CommonActions.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'HomeTab' } }] })
                );
              }
            }}
          >
            <Home size={14} color="#FFF" strokeWidth={2.5} />
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  // 2. Full-width Bar Banner UI (Home only)
  return (
    <Animated.View
      style={[
        styles.barBanner,
        {
          transform: [{ translateY: slideAnim }],
          top: insets.top,
          backgroundColor: isRestored ? '#10B981' : '#E53935',
        }
      ]}
    >
      <Text style={styles.barText}>
        {isRestored ? 'We are back !' : 'Connection Lost. Trying to reconnect...'}
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
    fontSize: moderateScale(22),
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  blockerSub: {
    fontSize: moderateScale(14),
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryDeep,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  homeButtonText: {
    color: '#FFF',
    fontSize: moderateScale(12),
    fontWeight: '700',
  },

  // Bar Banner Styles
  barBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  barText: {
    color: '#FFFFFF',
    fontSize: moderateScale(12),
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});

export default OfflineBanner;
