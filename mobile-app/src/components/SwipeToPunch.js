import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { COLORS, SHADOWS } from './Theme';

const SwipeToPunch = ({
  onSwipeComplete,
  isPunchedIn = false,
  loading = false,
  trackHeight = 68,
  padding = 5
}) => {
  const pan = useRef(new Animated.Value(0)).current;
  const [swipeWidth, setSwipeWidth] = useState(0);
  const buttonWidth = trackHeight - padding * 2;
  const maxSlide = swipeWidth - buttonWidth - padding * 2;

  const panResponder = useRef(
    PanResponder.create({
      // Only activate if gesture is more horizontal than vertical
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 8,
      onStartShouldSetPanResponder: () => false,

      onPanResponderMove: (_, gs) => {
        const clampedX = Math.max(0, Math.min(gs.dx, maxSlide));
        pan.setValue(clampedX);
      },

      onPanResponderRelease: (_, gs) => {
        const threshold = maxSlide * 0.75;
        if (gs.dx >= threshold) {
          Animated.timing(pan, {
            toValue: maxSlide,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            onSwipeComplete();
            setTimeout(() => {
              Animated.spring(pan, {
                toValue: 0,
                useNativeDriver: false,
                tension: 40,
                friction: 7,
              }).start();
            }, 600);
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
  const textVal = loading
    ? isPunchedIn
      ? 'Punching Out...'
      : 'Punching In...'
    : isPunchedIn
    ? '← SWIPE TO PUNCH OUT'
    : 'SWIPE TO PUNCH IN →';

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
