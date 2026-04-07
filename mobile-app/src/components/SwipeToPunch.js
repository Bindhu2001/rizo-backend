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

  useEffect(() => {
    isPunchedInRef.current = isPunchedIn;
    if (swipeWidth > 0 && !loading) {
      Animated.spring(pan, {
        toValue: isPunchedIn ? maxSlide : 0,
        useNativeDriver: false,
        tension: 50,
        friction: 8
      }).start();
    }
  }, [isPunchedIn, maxSlide, loading, resetTrigger, swipeWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        // Prevent accidental scrolls / button tap clicks. Only horizontal motion triggers it.
        return Math.abs(gs.dx) > 5 && Math.abs(gs.dx) > Math.abs(gs.dy);
      },

      onPanResponderMove: (_, gs) => {
        if (swipeWidth === 0 || loading) return;
        const startX = isPunchedInRef.current ? maxSlide : 0;
        const clampedX = Math.max(0, Math.min(startX + gs.dx, maxSlide));
        pan.setValue(clampedX);
      },

      onPanResponderRelease: (_, gs) => {
        if (swipeWidth === 0 || loading) return;
        const threshold = maxSlide * 0.65; // 65% dragged required for completion
        
        let shouldComplete = false;
        if (!isPunchedInRef.current && gs.dx >= threshold) shouldComplete = true; // Dragging right
        if (isPunchedInRef.current && gs.dx <= -threshold) shouldComplete = true; // Dragging left

        if (shouldComplete) {
          // Slide to the completed side to validate the visual action
          Animated.timing(pan, {
            toValue: isPunchedInRef.current ? 0 : maxSlide,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
             onSwipeComplete();
          });
        } else {
          // Snap back to the correct original side if they didn't drag it fully
          Animated.spring(pan, {
            toValue: isPunchedInRef.current ? maxSlide : 0,
            useNativeDriver: false,
            tension: 40,
            friction: 7,
          }).start();
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: isPunchedInRef.current ? maxSlide : 0,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Reactively shift layout styling based on sliding / current state
  const trackColor = isPunchedIn ? '#FFEBEB' : '#E8F5E9';
  const buttonColor = isPunchedIn ? COLORS.danger : '#2ECC71';
  const textColor = isPunchedIn ? COLORS.danger : '#2ECC71';

  let textVal = isPunchedIn ? 'SWIPE LEFT TO OUT' : 'SWIPE RIGHT TO IN';
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
