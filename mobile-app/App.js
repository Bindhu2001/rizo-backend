import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, Clock, Calendar, FileText, User } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import LeaveScreen from './src/screens/LeaveScreen';
import ExpenseScreen from './src/screens/ExpenseScreen';
import VisitsScreen from './src/screens/VisitsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import SplashScreen from './src/screens/SplashScreen';
import AttendanceRegScreen from './src/screens/AttendanceRegScreen';

import { COLORS, SHADOWS } from './src/components/Theme';
import { initDB } from './src/services/LocalDB';
import * as SQLite from 'expo-sqlite';
import NotificationManager from './src/services/NotificationManager';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Tab Navigator (Main App) ──────────────────────────────────────────────
function TabNavigator({ route }) {
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primaryDeep,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom || 12,
          paddingTop: 12,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          ...SHADOWS.medium,
          elevation: 15,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        initialParams={{ user: route.params?.user }}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Home color={color} size={24} strokeWidth={2.5} />,
        }}
      />

      <Tab.Screen
        name="LeaveTab"
        component={LeaveScreen}
        initialParams={{ user: route.params?.user }}
        options={{
          tabBarLabel: 'Leave',
          tabBarIcon: ({ color }) => <Calendar color={color} size={24} strokeWidth={2.5} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        initialParams={{ user: route.params?.user }}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={24} strokeWidth={2.5} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    NotificationManager.setup();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen name="Attendance" component={AttendanceScreen} />
          <Stack.Screen name="Leave" component={LeaveScreen} />
          <Stack.Screen name="Expense" component={ExpenseScreen} />
          <Stack.Screen name="Visits" component={VisitsScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Salary" component={SalaryScreen} />
          <Stack.Screen name="AttendanceReg" component={AttendanceRegScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
