import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, StatusBar } from 'react-native';
import { COLORS, SHADOWS } from '../components/Theme';

const { width } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      <View style={styles.content}>
        {/* TOP LOGO (The Ring) */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/rizo logo.png')} 
            style={styles.logoO}
            resizeMode="contain"
          />
        </View>

        {/* BRAND NAME */}
        <Text style={styles.brandName}>RIZO</Text>

        {/* ACTION BUTTON */}
        <View style={styles.buttonWrapper}>
          <TouchableOpacity 
            style={styles.loginBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>LOGIN</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>POWERED BY RIZO SOLUTIONS</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 30,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoO: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontSize: 50,
    fontWeight: '900',
    color: '#000',
    letterSpacing: -2,
    marginBottom: 80,
  },
  buttonWrapper: {
    width: '100%',
    paddingHorizontal: 20,
  },
  loginBtn: {
    backgroundColor: COLORS.primaryDeep || '#4A148C',
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  loginBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 2,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});

export default WelcomeScreen;
