import React, { useEffect, useState, createContext } from 'react';

export const OfflineBarContext = createContext(false);
import { View, ActivityIndicator, Platform } from 'react-native';
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
import RegularisationApprovalScreen from './src/screens/RegularisationApprovalScreen';
import LeaveApprovalScreen from './src/screens/LeaveApprovalScreen';

import OfflineBanner from './src/components/OfflineBanner';
import { SHADOWS } from './src/components/Theme';
import { ThemeProvider, useTheme } from './src/components/ThemeContext';
import { initDB } from './src/services/LocalDB';
import * as SQLite from 'expo-sqlite';
import NotificationManager from './src/services/NotificationManager';
import * as Notifications from 'expo-notifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Tab Navigator (Main App) ──────────────────────────────────────────────
function TabNavigator({ route }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primaryDeep,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 64 + insets.bottom : 68,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : 12,
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

// ─── Inner app tree — has access to useTheme (it's inside ThemeProvider) ───
function AppContent() {
  const theme = useTheme();
  const [currentRoute, setCurrentRoute] = useState('Splash');
  const [offlineBarVisible, setOfflineBarVisible] = useState(false);
  const navigationRef = React.useRef(null);

  const lastNotifResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (lastNotifResponse) {
      try { navigationRef.current?.navigate('Notifications'); } catch (_) {}
    }
  }, [lastNotifResponse]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {});
    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      try { navigationRef.current?.navigate('Notifications'); } catch (_) {}
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <OfflineBarContext.Provider value={offlineBarVisible}>
      <NavigationContainer
        ref={navigationRef}
        onStateChange={(state) => {
          const route = state?.routes[state.index];
          let currentName = route?.name;
          let currentState = route?.state;
          while (currentState) {
            const nestedRoute = currentState.routes[currentState.index];
            currentName = nestedRoute.name;
            currentState = nestedRoute.state;
          }
          setCurrentRoute(currentName);
        }}
      >
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}
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
          <Stack.Screen name="RegularisationApproval" component={RegularisationApprovalScreen} />
          <Stack.Screen name="LeaveApproval" component={LeaveApprovalScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <OfflineBanner currentRoute={currentRoute} navigationRef={navigationRef} onBarVisibleChange={setOfflineBarVisible} />
    </OfflineBarContext.Provider>
  );
}

// ─── Root App ──────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    NotificationManager.setup();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
