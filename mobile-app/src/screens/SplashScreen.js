import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text, Dimensions } from 'react-native';
import { initDB } from '../services/LocalDB';
import * as SQLite from 'expo-sqlite';
import { COLORS } from '../components/Theme';

const SplashScreen = ({ navigation }) => {
  const letters = ['R', 'I', 'Z'];
  const animations = useRef(letters.map(() => new Animated.Value(0))).current;
  const oOpacity = useRef(new Animated.Value(0)).current;
  const oRotate = useRef(new Animated.Value(0)).current;
  const oTranslateX = useRef(new Animated.Value(50)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // 1. Database & Auth Verification
    const checkAuth = async () => {
      try {
        await initDB();
        const db = await SQLite.openDatabaseAsync('rizo_local.db');
        const row = await db.getFirstAsync(`SELECT * FROM user_profile LIMIT 1`);
        
        setTimeout(() => {
          if (row && row.user_id) {
            navigation.replace('Main', { user: row });
          } else {
            navigation.replace('Welcome');
          }
        }, 3500); 
      } catch (e) {
        setTimeout(() => navigation.replace('Welcome'), 3000);
      }
    };
    checkAuth();

    // 2. Animation Sequence
    const animSequence = letters.map((_, i) => 
      Animated.spring(animations[i], { toValue: 1, tension: 40, friction: 7, useNativeDriver: true })
    );

    Animated.sequence([
      Animated.delay(300),
      Animated.stagger(150, animSequence),
      Animated.parallel([
        Animated.timing(oOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(oTranslateX, { toValue: 0, tension: 20, friction: 6, useNativeDriver: true }),
        Animated.timing(oRotate, { toValue: 1, duration: 1000, useNativeDriver: true })
      ]),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 50, useNativeDriver: true })
      ])
    ]).start();
  }, []);

  const spin = oRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg']
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.textRow}>
          {letters.map((char, i) => (
            <Animated.Text 
              key={i} 
              style={[
                styles.letter, 
                { 
                  opacity: animations[i],
                  transform: [{ translateY: animations[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] 
                }
              ]}
            >
              {char}
            </Animated.Text>
          ))}
          
          <Animated.View style={[
            styles.oContainer, 
            { 
              opacity: oOpacity, 
              transform: [
                { translateX: oTranslateX },
                { rotate: spin }
              ] 
            }
          ]}>
            <View style={styles.oBox}>
                <View style={[styles.oSegment, { backgroundColor: '#42A5F5', top: 0, left: 0 }]} />
                <View style={[styles.oSegment, { backgroundColor: '#66BB6A', top: 0, right: 0 }]} />
                <View style={[styles.oSegment, { backgroundColor: '#EC407A', bottom: 0, left: 0 }]} />
                <View style={[styles.oSegment, { backgroundColor: '#FFA726', bottom: 0, right: 0 }]} />
                <View style={styles.oInnerWhite} />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  content: { flexDirection: 'row', alignItems: 'center' },
  textRow: { flexDirection: 'row', alignItems: 'center' },
  letter: {
    fontSize: 70,
    fontWeight: '900',
    color: '#000',
    marginRight: 2,
    letterSpacing: -2,
  },
  oContainer: {
    width: 54,
    height: 54,
    marginLeft: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  oBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 0,
  },
  oSegment: {
    position: 'absolute',
    width: '50%',
    height: '50%',
  },
  oInnerWhite: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF',
    top: 15,
    left: 15,
    zIndex: 10,
  }
});

export default SplashScreen;
