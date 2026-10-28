import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageCircle } from 'lucide-react-native';
import { moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { HrQueriesApi } from '../services/RevampApi';
import { getLoggedUser } from '../services/LocalDB';

// Connect to HR as a floating round icon, like the web employee login's chat bubble: shown on the main tab
// screens, with a badge for unread HR replies. Drag it anywhere (like the Ask RIZO logo on the web); the spot is
// remembered, and a tap (no drag) opens Connect to HR.

const TAB_SCREENS = ['HomeTab', 'LeaveTab', 'ProfileTab'];
const SIZE = moderateScale(56);
const MARGIN = 8;
const DRAG_THRESHOLD = 5;
const STORAGE_KEY = 'hr_connect_fab_pos';
const POLL_MS = 60 * 1000;

const HrFloatingButton = ({ currentRoute, navigationRef }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const visible = TAB_SCREENS.includes(currentRoute);
  const [unread, setUnread] = useState(0);

  // Keep the whole icon on screen: below the status bar, above the home bar
  const bounds = useRef({});
  bounds.current = { minX: MARGIN, maxX: W - SIZE - MARGIN, minY: insets.top + MARGIN, maxY: H - SIZE - MARGIN - insets.bottom };
  const clamp = (p) => ({
    x: Math.min(Math.max(p.x, bounds.current.minX), Math.max(bounds.current.minX, bounds.current.maxX)),
    y: Math.min(Math.max(p.y, bounds.current.minY), Math.max(bounds.current.minY, bounds.current.maxY)),
  });

  // Starts bottom right, above the tab bar
  const initial = useRef({ x: W - SIZE - 16, y: H - SIZE - insets.bottom - moderateScale(64) - 24 }).current;
  const pos = useRef(initial);
  const pan = useRef(new Animated.ValueXY(initial)).current;
  const setPos = (p) => { pos.current = p; pan.setValue(p); };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPos(clamp(saved));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A rotation / window change keeps it on screen
  useEffect(() => { setPos(clamp(pos.current)); }, [W, H, insets.top, insets.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const openHr = useCallback(async () => {
    const user = await getLoggedUser();
    if (user?.user_id) navigationRef.current?.navigate('HrConnect', { user });
  }, [navigationRef]);

  const gesture = useRef({ start: initial, moved: false });
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { gesture.current = { start: pos.current, moved: false }; },
    onPanResponderMove: (_e, g) => {
      if (!gesture.current.moved && Math.hypot(g.dx, g.dy) < DRAG_THRESHOLD) return;
      gesture.current.moved = true;
      setPos(clamp({ x: gesture.current.start.x + g.dx, y: gesture.current.start.y + g.dy }));
    },
    onPanResponderRelease: () => {
      if (!gesture.current.moved) { openHr(); return; }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pos.current)).catch(() => {});
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  // Unread HR replies for the badge: when a tab screen is shown, then every minute while the app is in front
  useEffect(() => {
    if (!visible) return undefined;
    const refresh = () => HrQueriesApi.list().then((res) => setUnread(Number(res?.unread) || 0)).catch(() => {});
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [visible, currentRoute]);

  if (!visible) return null;

  const fill = theme.isDark ? '#7C3AED' : '#4A148C';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        {...responder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Connect to HR, ${unread} unread` : 'Connect to HR'}
        style={[s.fab, { backgroundColor: fill, transform: pan.getTranslateTransform() }]}
      >
        <MessageCircle color="#FFF" size={moderateScale(26)} />
        {unread > 0 && (
          <View style={[s.badge, { borderColor: theme.bg }]}>
            <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  fab: {
    position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: moderateScale(20), height: moderateScale(20), paddingHorizontal: 4,
    borderRadius: moderateScale(10), backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { color: '#FFF', fontSize: moderateScale(10.5), fontWeight: '800' },
});

export default HrFloatingButton;
