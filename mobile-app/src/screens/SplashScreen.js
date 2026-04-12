import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLoggedUser } from '../services/LocalDB';

const { width } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  const rY = useRef(new Animated.Value(50)).current;
  const rOp = useRef(new Animated.Value(0)).current;

  const iY = useRef(new Animated.Value(50)).current;
  const iOp = useRef(new Animated.Value(0)).current;

  const zY = useRef(new Animated.Value(50)).current;
  const zOp = useRef(new Animated.Value(0)).current;

  const oScale = useRef(new Animated.Value(0.5)).current;
  const oRotate = useRef(new Animated.Value(-180)).current;
  const oOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // r (delay 300ms, duration 800ms)
    Animated.parallel([
      Animated.timing(rY, { toValue: 0, delay: 300, duration: 800, useNativeDriver: true }),
      Animated.timing(rOp, { toValue: 1, delay: 300, duration: 800, useNativeDriver: true }),
    ]).start();

    // i (delay 800ms, duration 800ms)
    Animated.parallel([
      Animated.timing(iY, { toValue: 0, delay: 800, duration: 800, useNativeDriver: true }),
      Animated.timing(iOp, { toValue: 1, delay: 800, duration: 800, useNativeDriver: true }),
    ]).start();

    // z (delay 1300ms, duration 800ms)
    Animated.parallel([
      Animated.timing(zY, { toValue: 0, delay: 1300, duration: 800, useNativeDriver: true }),
      Animated.timing(zOp, { toValue: 1, delay: 1300, duration: 800, useNativeDriver: true }),
    ]).start();

    // O (delay 1800ms, duration 1500ms)
    Animated.parallel([
      Animated.timing(oScale, { toValue: 1, delay: 1800, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(oRotate, { toValue: 0, delay: 1800, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(oOp, { toValue: 1, delay: 1800, duration: 1500, useNativeDriver: true }),
    ]).start(() => {
      // Endless spin
      Animated.loop(
        Animated.timing(oRotate, { toValue: 360, duration: 6000, easing: Easing.linear, useNativeDriver: true })
      ).start();

      // Navigation check after animation finishes
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
      }, 500); 
    });
  }, []);

  const spin = oRotate.interpolate({
    inputRange: [-180, 0, 360],
    outputRange: ['-180deg', '0deg', '360deg']
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={styles.logoRow}>
        <View style={styles.rizContainer}>
          <Animated.Text style={[styles.letter, { opacity: rOp, transform: [{ translateY: rY }] }]}>r</Animated.Text>
          <Animated.Text style={[styles.letter, { opacity: iOp, transform: [{ translateY: iY }] }]}>i</Animated.Text>
          <Animated.Text style={[styles.letter, { opacity: zOp, transform: [{ translateY: zY }] }]}>z</Animated.Text>
        </View>
        <Animated.View style={[
          styles.oContainer, 
          { 
            opacity: oOp,
            transform: [
              { scale: oScale },
              { rotate: spin }
            ]
          }
        ]}>
          <Image 
            source={require('../../assets/logo_with_margin.png')} 
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
    gap: 4,
  },
  rizContainer: {
    flexDirection: 'row',
  },
  letter: {
    fontSize: 80,
    fontWeight: '900',
    color: '#000',
  },
  oContainer: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    overflow: 'hidden',
    marginTop: 8,
    marginLeft: 6,
  },
  oImage: {
    width: '100%',
    height: '100%',
  }
});

export default SplashScreen;
