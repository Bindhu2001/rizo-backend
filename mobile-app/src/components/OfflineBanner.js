import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import * as Network from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const OfflineBanner = () => {
  const [status, setStatus] = useState('online'); // 'online', 'offline', 'restored'
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const isActuallyOffline = !state.isConnected || !state.isInternetReachable;
        
        if (isActuallyOffline && status !== 'offline') {
          // Transition to Offline
          setStatus('offline');
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8
          }).start();
        } else if (!isActuallyOffline && status === 'offline') {
          // Transition back to Online (Show green restored state first)
          setStatus('restored');
          setTimeout(() => {
            Animated.timing(slideAnim, {
              toValue: -100,
              duration: 500,
              useNativeDriver: true,
            }).start(() => setStatus('online'));
          }, 2500);
        }
      } catch (e) {
        console.log('Network check error', e);
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 4000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'online') return null;

  const isRestored = status === 'restored';

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          transform: [{ translateY: slideAnim }],
          paddingTop: insets.top > 0 ? insets.top : 10,
          backgroundColor: isRestored ? '#10B981' : '#EF4444'
        }
      ]}
    >
      <Text style={styles.text}>
        {isRestored ? 'Back Online' : 'Connection Lost. Try reconnecting...'}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF0000',
    zIndex: 9999,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default OfflineBanner;
