import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../components/Theme';

const { width } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primaryDeep, COLORS.primary, '#880E4F']}
        style={styles.gradient}
      >
        <View style={styles.topPattern} />
        <View style={styles.bottomPattern} />
        
        <View style={styles.content}>
          <View style={styles.logoGroup}>
            <LinearGradient
              colors={['#FFFFFF', '#FCE4EC']}
              style={styles.logoBox}
            >
               <Image 
                 source={require('../../assets/rizo logo.png')} 
                 style={{ width: 100, height: 100, resizeMode: 'contain' }}
               />
            </LinearGradient>
            <View style={styles.logoShadow} />
          </View>
          
          <View style={styles.textContainer}>
            <Text style={styles.title}>Rizo Mobile</Text>
            <Text style={styles.subtitle}>
              The next generation of workforce management. 
              Efficiency, accuracy, and elegance in one place.
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>GET STARTED</Text>
              <View style={styles.btnIconBg}>
                <ChevronRight color={COLORS.primaryDeep} size={20} strokeWidth={3} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Signup')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>Create a new account</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>POWERED BY RIZO SOLUTIONS</Text>
          <View style={styles.footerLine} />
          <Text style={styles.footerVersion}>Version 2.0.4</Text>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: {
    flex: 1,
    padding: 30,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  topPattern: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bottomPattern: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoGroup: {
    marginBottom: 50,
    alignItems: 'center',
  },
  logoBox: {
    width: 120,
    height: 120,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    ...SHADOWS.medium,
  },
  logoShadow: {
    position: 'absolute',
    bottom: -10,
    width: 100,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 50,
    filter: 'blur(10px)',
  },
  logoText: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.primaryDeep,
    letterSpacing: -2,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 70,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 16,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingHorizontal: 10,
    lineHeight: 26,
    fontWeight: '500',
  },
  buttonContainer: {
    width: '100%',
    gap: 20,
  },
  primaryBtn: {
    backgroundColor: COLORS.white,
    height: 64,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    ...SHADOWS.medium,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primaryDeep,
    letterSpacing: 1.5,
  },
  btnIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtn: {
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    textDecorationLine: 'underline',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '800',
    letterSpacing: 2,
  },
  footerLine: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 10,
    borderRadius: 1,
  },
  footerVersion: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
  },
});

export default WelcomeScreen;
