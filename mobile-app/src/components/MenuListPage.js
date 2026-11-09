import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Text } from './AppText';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Lock } from 'lucide-react-native';
import { moderateScale, SHADOWS } from './Theme';
import { useTheme } from './ThemeContext';
import CustomAlert from './CustomAlert';
import { loadMenuAccess, useMenuAccess, menuStatus, BLURRED_MESSAGE } from '../services/MenuAccess';

// A Requests / Approvals tab: every menu of the section is listed. One this employee has opens its screen; one
// they don't have (switched off, not on their company's server, or not in this app version yet) is blurred with
// a lock, and a tap says why. Items: { key, title, note, route, params, Icon, color, bg }.

const MenuListPage = ({ title, subtitle, items, user, navigation }) => {
  const theme = useTheme();
  const menus = useMenuAccess(user?.user_id);
  const [refreshing, setRefreshing] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  useFocusEffect(useCallback(() => { loadMenuAccess(user?.user_id); }, [user?.user_id]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMenuAccess(user?.user_id);
    setRefreshing(false);
  };

  const open = (item, status) => {
    if (status === 'on') {
      navigation.navigate(item.route, { user, ...(item.params || {}) });
      return;
    }
    setAlertCfg({ type: 'info', ...BLURRED_MESSAGE[status] });
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: theme.text }]}>{title}</Text>
        {!!subtitle && <Text style={[s.headerSub, { color: theme.textLight }]}>{subtitle}</Text>}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {items.map((item) => {
          const status = menuStatus(menus, item);
          const blurred = status !== 'on';
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.7}
              onPress={() => open(item, status)}
              style={[s.card, { backgroundColor: theme.card }, blurred && s.blurred]}
            >
              <View style={[s.iconBox, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : item.bg }]}>
                <item.Icon color={item.color} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, { color: theme.text }]}>{item.title}</Text>
                <Text style={[s.note, { color: theme.textLight }]} numberOfLines={2}>
                  {status === 'soon' ? 'Coming in the next version' : status === 'off' ? 'Not enabled for you' : item.note}
                </Text>
              </View>
              {blurred ? <Lock color={theme.textMuted} size={18} /> : <ChevronRight color={theme.textLight} size={20} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: moderateScale(20), paddingTop: moderateScale(12), paddingBottom: moderateScale(8) },
  headerTitle: { fontSize: moderateScale(22), fontWeight: '900' },
  headerSub: { fontSize: moderateScale(13), marginTop: moderateScale(2) },
  scroll: { padding: moderateScale(16), paddingBottom: moderateScale(120) },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(20), padding: moderateScale(16), marginBottom: moderateScale(12), ...SHADOWS.light },
  blurred: { opacity: 0.45 },
  iconBox: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(14), alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(14) },
  title: { fontSize: moderateScale(15), fontWeight: '800' },
  note: { fontSize: moderateScale(12), marginTop: moderateScale(2) },
});

export default MenuListPage;
