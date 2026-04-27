import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator
} from 'react-native';
import { Fingerprint, MapPin } from 'lucide-react-native';
import { COLORS, SHADOWS } from './Theme';

const SwipeToPunch = ({
  onSwipeComplete,
  isPunchedIn = false,
  loading = false,
  trackHeight = 48,
  padding = 4,
  resetTrigger = 0,
  locationName = '',
  punchTime = null,
}) => {
  const [swipeWidth, setSwipeWidth] = useState(0);
  const buttonWidth = trackHeight - padding * 2;
  const maxSlide = Math.max(0, swipeWidth - buttonWidth - padding * 2);

  const pan = useRef(new Animated.Value(0)).current;
  const isPunchedInRef = useRef(isPunchedIn);
  const maxSlideRef = useRef(maxSlide);
  const loadingRef = useRef(loading);
  const swipeWidthRef = useRef(swipeWidth);
  const onSwipeCompleteRef = useRef(onSwipeComplete);

  useEffect(() => {
    isPunchedInRef.current = isPunchedIn;
    maxSlideRef.current = maxSlide;
    loadingRef.current = loading;
    swipeWidthRef.current = swipeWidth;
    onSwipeCompleteRef.current = onSwipeComplete;
  });

  useEffect(() => {
    Animated.spring(pan, {
      toValue: 0,
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
  }, [isPunchedIn, resetTrigger]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (loadingRef.current) return false;
        return gs.dx > 5 && Math.abs(gs.dx) > Math.abs(gs.dy);
      },

      onPanResponderMove: (_, gs) => {
        if (swipeWidthRef.current === 0 || loadingRef.current) return;
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
            onSwipeCompleteRef.current();
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

  let textVal = isPunchedIn ? 'SWIPE TO OUT' : 'SWIPE TO IN';
  if (loading) {
    textVal = isPunchedIn ? 'Punching Out...' : 'Punching In...';
  }

  return (
    <View
      style={[
        styles.swipeTrack,
        { 
          backgroundColor: trackColor, 
          height: trackHeight, 
          borderRadius: trackHeight / 2,
          width: isPunchedIn ? '100%' : '100%',
          alignSelf: 'center'
        },
      ]}
      onLayout={(e) => setSwipeWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.textBlock}>
        <Text style={[styles.swipeText, { color: textColor }]}>{textVal}</Text>
        
        {isPunchedIn && !loading && !!locationName && (
          <View style={styles.locRow}>
            <MapPin color={textColor} size={10} />
            <Text style={[styles.locText, { color: textColor }]} numberOfLines={1}>
              {locationName}
            </Text>
          </View>
        )}
      </View>

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
          <Fingerprint color="#FFF" size={20} />
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
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  textBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    maxWidth: 200,
  },
  locText: {
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 3,
    opacity: 0.8,
    flexShrink: 1,
  },
});

export default SwipeToPunch;
