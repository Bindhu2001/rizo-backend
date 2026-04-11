import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image } from 'react-native';
import { initDB } from '../services/LocalDB';
import * as SQLite from 'expo-sqlite';
import { COLORS } from '../components/Theme';

const SplashScreen = ({ navigation }) => {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reveal Animation
    Animated.parallel([
      Animated.spring(scale, { toValue: 1.1, tension: 20, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true })
    ]).start();

    // Database & Auth Verification
    const checkAuth = async () => {
      try {
        await initDB();
        const db = await SQLite.openDatabaseAsync('rizo_local.db');
        const row = await db.getFirstAsync(`SELECT * FROM user_profile LIMIT 1`);
        
        // Wait at least 1800ms before routing so animation can finish playing gracefully
        setTimeout(() => {
            // Pulse out animation
            Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
                if (row && row.user_id) {
                  navigation.replace('Main', { user: row });
                } else {
                  navigation.replace('Login');
                }
            });
        }, 1800); 
      } catch (e) {
        setTimeout(() => navigation.replace('Login'), 1800);
      }
    };
    
    checkAuth();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image 
        source={require('../../assets/logo.png')} 
        style={[styles.logo, { transform: [{ scale }], opacity }]} 
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  logo: { width: 220, height: 100 }
});

export default SplashScreen;
