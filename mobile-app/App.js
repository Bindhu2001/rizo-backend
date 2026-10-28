import React, { useEffect, useState, createContext } from 'react';

export const OfflineBarContext = createContext(false);
import { View, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
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
import HrConnectScreen from './src/screens/HrConnectScreen';
import HrQueryThreadScreen from './src/screens/HrQueryThreadScreen';
import EventsListScreen from './src/screens/EventsListScreen';
import AnnouncementsScreen from './src/screens/AnnouncementsScreen';
import MyTeamScreen from './src/screens/MyTeamScreen';
import HrFloatingButton from './src/components/HrFloatingButton';

import OfflineBanner from './src/components/OfflineBanner';
import { SHADOWS, LARGE_SCREEN_BREAKPOINT, LARGE_SCREEN_CAPPED_WIDTH } from './src/components/Theme';
import { ThemeProvider, useTheme } from './src/components/ThemeContext';
import { initDB, getLoggedUser } from './src/services/LocalDB';
import * as SQLite from 'expo-sqlite';
import NotificationManager from './src/services/NotificationManager';
import * as Notifications from 'expo-notifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Every screen in this app is designed for phone-width layouts. On a tablet
// (iPad), rather than stretching that phone design across the full screen,
// cap the content to a phone-like width and center it — the same visual
// result iOS gives non-tablet-optimized apps natively, but under our own
// control so the surrounding fill matches the current theme. Theme.js's
// moderateScale/wp/hp helpers clamp to this same width so components size
// correctly for the capped container, not the device's full width.

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

// ─── Inner app tree — has access to useTheme (it's inside ThemeProvider) ───
function AppContent() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= LARGE_SCREEN_BREAKPOINT;
  const [currentRoute, setCurrentRoute] = useState('Splash');
  const [offlineBarVisible, setOfflineBarVisible] = useState(false);
  const navigationRef = React.useRef(null);

  const lastNotifResponse = Notifications.useLastNotificationResponse();

  // Short-hours alert → Regularisation, HR query → its thread, announcement → Announcements,
  // shift reminder → just opens the app,
  // anything else → Notifications.
  // On a cold start the tap arrives while Splash is still up, so wait until it has moved on.
  const openFromNotification = async (response) => {
    const type = response?.notification?.request?.content?.data?.type;
    for (let i = 0; i < 20; i++) {
      const route = navigationRef.current?.getCurrentRoute?.()?.name;
      if (navigationRef.current?.isReady?.() && route && route !== 'Splash') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    try {
      const data = response?.notification?.request?.content?.data || {};
      if (type === 'SHORT_HOURS') {
        const user = await getLoggedUser();
        if (user?.user_id) navigationRef.current?.navigate('AttendanceReg', { user, initialTab: 'LOG' });
      } else if (type === 'HR_QUERY' && data.id) {
        // HR replied / changed status in rizo-revamp → open that Connect to HR thread
        const user = await getLoggedUser();
        if (user?.user_id) navigationRef.current?.navigate('HrQueryThread', { user, id: Number(data.id) });
      } else if (type === 'ANNOUNCEMENT') {
        // New company announcement → open it in Announcements
        const user = await getLoggedUser();
        if (user?.user_id) navigationRef.current?.navigate('Announcements', { user, openId: Number(data.id) || null });
      } else if (type === 'SHIFT_REMINDER') {
        // Just open the app — it lands on Home after Splash. Navigating to 'Main'
        // with new params would replace its { user } params.
      } else {
        navigationRef.current?.navigate('Notifications');
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (lastNotifResponse) openFromNotification(lastNotifResponse);
  }, [lastNotifResponse]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      NotificationManager.recordPush(notification);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      NotificationManager.recordPush(response?.notification);
      openFromNotification(response);
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  const content = (
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
          <Stack.Screen name="HrConnect" component={HrConnectScreen} />
          <Stack.Screen name="HrQueryThread" component={HrQueryThreadScreen} />
          <Stack.Screen name="EventsList" component={EventsListScreen} />
          <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
          <Stack.Screen name="MyTeam" component={MyTeamScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <HrFloatingButton currentRoute={currentRoute} navigationRef={navigationRef} />
      <OfflineBanner currentRoute={currentRoute} navigationRef={navigationRef} onBarVisibleChange={setOfflineBarVisible} />
    </OfflineBarContext.Provider>
  );

  if (!isLargeScreen) return content;

  // Tablet: cap to a phone-like width and center it, rather than stretching
  // every phone-designed screen across the full iPad width.
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: LARGE_SCREEN_CAPPED_WIDTH }}>
        {content}
      </View>
    </View>
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
