import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text, Dimensions } from 'react-native';
import { initDB } from '../services/LocalDB';
import * as SQLite from 'expo-sqlite';
import { COLORS } from '../components/Theme';

const SplashScreen = ({ navigation }) => {
  const letters = ['R', 'I', 'Z', 'O'];
  const animations = useRef(letters.map(() => new Animated.Value(0))).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // 1. Database & Auth Verification (Parallel to animation)
    const checkAuth = async () => {
      try {
        await initDB();
        const db = await SQLite.openDatabaseAsync('rizo_local.db');
        const row = await db.getFirstAsync(`SELECT * FROM user_profile LIMIT 1`);
        
        // Ensure minimum display time
        setTimeout(() => {
          if (row && row.user_id) {
            navigation.replace('Main', { user: row });
          } else {
            navigation.replace('Welcome');
          }
        }, 3000); 
      } catch (e) {
        setTimeout(() => navigation.replace('Welcome'), 3000);
      }
    };
    checkAuth();

    // 2. Sequential Letter Animation
    const animSequence = letters.map((_, i) => 
      Animated.spring(animations[i], { toValue: 1, tension: 40, friction: 7, useNativeDriver: true })
    );

    Animated.sequence([
      Animated.delay(300),
      Animated.stagger(200, animSequence),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 20, useNativeDriver: true })
      ])
    ]).start();
  }, []);

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
          
          <Animated.View style={[styles.logoContainer, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            <View style={[styles.circle, { backgroundColor: '#42A5F5', top: 0, left: 6 }]} />
            <View style={[styles.circle, { backgroundColor: '#66BB6A', bottom: 1, left: 1 }]} />
            <View style={[styles.circle, { backgroundColor: '#EC407A', bottom: 0, right: 0 }]} />
            <View style={[styles.circle, { backgroundColor: '#FFA726', top: 5, right: 0 }]} />
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
    fontSize: 60,
    fontWeight: '900',
    color: '#3B5998',
    marginRight: 2,
  },
  logoContainer: {
    width: 44,
    height: 44,
    marginLeft: 8,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  }
});

export default SplashScreen;
