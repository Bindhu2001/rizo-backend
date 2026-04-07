import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator
} from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { COLORS, SHADOWS } from './Theme';

const SwipeToPunch = ({
  onSwipeComplete,
  isPunchedIn = false,
  loading = false,
  trackHeight = 68,
  padding = 5,
  resetTrigger = 0
}) => {
  const [swipeWidth, setSwipeWidth] = useState(0);
  const buttonWidth = trackHeight - padding * 2;
  const maxSlide = Math.max(0, swipeWidth - buttonWidth - padding * 2);

  const pan = useRef(new Animated.Value(0)).current; 
  const isPunchedInRef = useRef(isPunchedIn);
  const maxSlideRef = useRef(maxSlide);
  const loadingRef = useRef(loading);
  const swipeWidthRef = useRef(swipeWidth);

  // Always reset to left when state changes or reset is triggered
  useEffect(() => {
    isPunchedInRef.current = isPunchedIn;
    maxSlideRef.current = maxSlide;
    loadingRef.current = loading;
    swipeWidthRef.current = swipeWidth;

    Animated.spring(pan, {
        toValue: 0,
        useNativeDriver: false,
        tension: 50,
        friction: 8
    }).start();
  }, [isPunchedIn, resetTrigger, swipeWidth, loading]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (loadingRef.current) return false;
        // Only allow Rightward movement
        return gs.dx > 5 && Math.abs(gs.dx) > Math.abs(gs.dy);
      },

      onPanResponderMove: (_, gs) => {
        if (swipeWidthRef.current === 0 || loadingRef.current) return;
        // Button always starts at 0 and slides to maxSlide
        const clampedX = Math.max(0, Math.min(gs.dx, maxSlideRef.current));
        pan.setValue(clampedX);
      },

      onPanResponderRelease: (_, gs) => {
        if (swipeWidthRef.current === 0 || loadingRef.current) return;
        const mSlide = maxSlideRef.current;
        const threshold = mSlide * 0.6; 
        
        if (gs.dx >= threshold) {
          Animated.timing(pan, {
            toValue: mSlide,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
             onSwipeComplete();
          });
        } else {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
            tension: 40,
            friction: 7,
          }).start();
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  const trackColor = isPunchedIn ? '#FFEBEB' : '#E8F5E9';
  const buttonColor = isPunchedIn ? COLORS.danger : '#2ECC71';
  const textColor = isPunchedIn ? COLORS.danger : '#2ECC71';

  let textVal = isPunchedIn ? 'SWIPE RIGHT TO OUT' : 'SWIPE RIGHT TO IN';
  if (loading) {
    textVal = isPunchedIn ? 'Punching Out...' : 'Punching In...';
  }

  return (
    <View
      style={[
        styles.swipeTrack,
        { backgroundColor: trackColor, height: trackHeight, borderRadius: trackHeight / 2 },
      ]}
      onLayout={(e) => setSwipeWidth(e.nativeEvent.layout.width)}
    >
      <Text style={[styles.swipeText, { color: textColor }]}>{textVal}</Text>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.swipeButton,
          {
            backgroundColor: buttonColor,
            width: buttonWidth,
            height: buttonWidth,
            borderRadius: buttonWidth / 2,
            left: padding,
            transform: [{ translateX: pan }],
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Fingerprint color="#FFF" size={26} />
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  swipeTrack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    ...SHADOWS.light,
  },
  swipeButton: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...SHADOWS.medium,
  },
  swipeText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default SwipeToPunch;
