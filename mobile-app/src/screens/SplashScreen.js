import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLoggedUser } from '../services/LocalDB';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  // Target width for the entire logo assembly (responsive)
  const LOGO_ASSEMBLY_WIDTH = SCREEN_WIDTH * 0.85;
  const ORIGINAL_CANVAS_WIDTH = 1284;
  const SCALE = LOGO_ASSEMBLY_WIDTH / ORIGINAL_CANVAS_WIDTH;
  
  // Normalized center positions (multiplied by SCALE later)
  const GEOMETRY = [
    { name: 'r', x: 69, y: 93, w: 215, h: 415 },
    { name: 'i', x: 336, y: 93, w: 109, h: 415 },
    { name: 'z', x: 479, y: 92, w: 351, h: 417 },
    { name: 'o', x: 825, y: 92, w: 421, h: 420 },
  ];

  // Animation values
  const progress = useRef(new Animated.Value(0)).current; // 0 to 1
  const rOp = useRef(new Animated.Value(0)).current;
  const iOp = useRef(new Animated.Value(0)).current;
  const zOp = useRef(new Animated.Value(0)).current;
  const oRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Play the main rolling animation
    Animated.timing(progress, {
      toValue: 1,
      duration: 2500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => {
      // 2. Continuous rotation for the O after it arrives
      Animated.loop(
        Animated.timing(oRotate, {
          toValue: 1,
          duration: 4000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      // 3. Navigate away after a short delay
      setTimeout(async () => {
        try {
          const user = await getLoggedUser();
          if (user && user.user_id) {
            navigation.replace('Main', { user });
          } else {
            navigation.replace('Login');
          }
        } catch (e) {
          navigation.replace('Login');
        }
      }, 800);
    });

    // Listeners to trigger letter reveals as O passes them
    // Thresholds based on GEOMETRY relative X positions
    const thresholds = {
      r: (GEOMETRY[0].x + GEOMETRY[0].w / 2) / ORIGINAL_CANVAS_WIDTH,
      i: (GEOMETRY[1].x + GEOMETRY[1].w / 2) / ORIGINAL_CANVAS_WIDTH,
      z: (GEOMETRY[2].x + GEOMETRY[2].w / 2) / ORIGINAL_CANVAS_WIDTH,
    };

    const listenerId = progress.addListener(({ value }) => {
      if (value >= thresholds.r) {
        Animated.timing(rOp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
      if (value >= thresholds.i) {
        Animated.timing(iOp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
      if (value >= thresholds.z) {
        Animated.timing(zOp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    });

    return () => {
      progress.removeListener(listenerId);
    };
  }, []);

  // Rolling O position (starts from left off-screen, ends at its slot)
  const oTargetX = GEOMETRY[3].x * SCALE;
  const oLeftStart = -200; // start off-screen left
  
  const moveO = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [oLeftStart, oTargetX],
  });

  const rollO = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'], // roll twice
  });

  // Infinite spin for when it stops
  const infiniteSpin = oRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderLetter = (index, opacity) => {
    const item = GEOMETRY[index];
    const source = [
      require('../../assets/letter_r.png'),
      require('../../assets/letter_i.png'),
      require('../../assets/letter_z.png'),
    ][index];

    return (
      <Animated.Image
        key={item.name}
        source={source}
        style={[
          styles.letterImage,
          {
            left: item.x * SCALE,
            top: item.y * SCALE,
            width: item.w * SCALE,
            height: item.h * SCALE,
            opacity,
          },
        ]}
        resizeMode="contain"
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={[styles.canvas, { width: LOGO_ASSEMBLY_WIDTH, height: 600 * SCALE }]}>
        
        {/* r, i, z */}
        {renderLetter(0, rOp)}
        {renderLetter(1, iOp)}
        {renderLetter(2, zOp)}

        {/* Rolling O */}
        <Animated.View
          style={[
            styles.oWrapper,
            {
              left: 0, 
              width: GEOMETRY[3].w * SCALE,
              height: GEOMETRY[3].h * SCALE,
              top: GEOMETRY[3].y * SCALE,
              transform: [
                { translateX: moveO },
                { rotate: Animated.add(rollO, infiniteSpin) }
              ],
            },
          ]}
        >
          <Image
            source={require('../../assets/letter_o.png')}
            style={styles.oImage}
            resizeMode="contain"
          />
        </Animated.View>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    position: 'relative',
  },
  letterImage: {
    position: 'absolute',
  },
  oWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  oImage: {
    width: '100%',
    height: '100%',
  },
});

export default SplashScreen;
