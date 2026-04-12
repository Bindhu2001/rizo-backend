import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  const oMove = useRef(new Animated.Value(-width * 0.5)).current; // Start off-screen left
  const oRotate = useRef(new Animated.Value(0)).current; 
  const rAlpha = useRef(new Animated.Value(0)).current;
  const iAlpha = useRef(new Animated.Value(0)).current;
  const zAlpha = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Stage 1: O rolls in from left to center-right
    // While rolling, R, I, Z appear one by one
    Animated.parallel([
      // O Movement
      Animated.timing(oMove, {
        toValue: 50, 
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // O Rotation
      Animated.timing(oRotate, {
        toValue: 1, 
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Letter Apparition Sequence (overlapping with the roll)
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(rAlpha, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(100),
        Animated.timing(iAlpha, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(100),
        Animated.timing(zAlpha, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ]).start(() => {
        setTimeout(() => {
            navigation.replace('MainTabs');
        }, 800);
    });
  }, []);

  const spin = oRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg']
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={styles.logoRow}>
        <View style={styles.rizContainer}>
          <Animated.Text style={[styles.letter, { opacity: rAlpha }]}>R</Animated.Text>
          <Animated.Text style={[styles.letter, { opacity: iAlpha }]}>I</Animated.Text>
          <Animated.Text style={[styles.letter, { opacity: zAlpha }]}>Z</Animated.Text>
        </View>
        <Animated.View style={[
          styles.oContainer, 
          { 
            transform: [
              { translateX: oMove },
              { rotate: spin }
            ]
          }
        ]}>
          <Image 
            source={require('../../assets/rizo logo.png')} 
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
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  rizContainer: {
    flexDirection: 'row',
    position: 'absolute',
    left: width * 0.5 - 65, // Adjust based on total logo width
  },
  letter: {
    fontSize: 50,
    fontWeight: '900',
    color: '#000',
    letterSpacing: -2,
  },
  oContainer: {
    width: 60,
    height: 60,
  },
  oImage: {
    width: '100%',
    height: '100%',
  }
});

export default SplashScreen;
