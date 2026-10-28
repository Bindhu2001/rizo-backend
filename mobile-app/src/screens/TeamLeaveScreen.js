import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CalendarX2, CalendarClock, UserCheck } from 'lucide-react-native';
import { format } from 'date-fns';
import { moderateScale, SHADOWS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { TeamApi, apiErrorMessage } from '../services/RevampApi';
import { TeamAvatar } from '../components/TeamTodayCard';

// From Home "Team today": who of the team this person authorises / approves is on leave today.

const TITLES = { authorise: 'You authorise', approve: 'You approve' };

const TeamLeaveScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const role = route?.params?.role === 'approve' ? 'approve' : 'authorise';
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await TeamApi.today();
      setGroup(res?.[role] || { size: 0, onLeave: [] });
    } catch (e) {
      setError(apiErrorMessage(e, 'Please check your connection and pull to retry.'));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [role])); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const people = group?.onLeave || [];

  const renderItem = ({ item }) => {
    const half = item.session !== 'Full day';
    return (
      <View style={[s.card, { backgroundColor: theme.card }]}>
        <TeamAvatar person={item} size={moderateScale(44)} />
        <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
          {!!item.empId && <Text style={[s.sub, { color: theme.textMuted }]}>{item.empId}</Text>}
          {!!item.leaveType && <Text style={[s.sub, { color: theme.textLight }]} numberOfLines={1}>{item.leaveType}</Text>}
        </View>
        <View style={[s.badge, { backgroundColor: half ? '#FEF3C7' : '#FFEDD5' }]}>
          {half ? <CalendarClock color="#D97706" size={13} /> : <CalendarX2 color="#EA580C" size={13} />}
          <Text style={[s.badgeText, { color: half ? '#B45309' : '#C2410C' }]}>{item.session}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>On Leave Today</Text>
        <View style={{ width: moderateScale(44) }} />
      </View>

      <View style={s.summary}>
        <Text style={[s.summaryTitle, { color: theme.text }]}>{TITLES[role]}</Text>
        <Text style={[s.summarySub, { color: theme.textLight }]}>
          {format(new Date(), 'EEEE, dd MMM yyyy')}
          {group ? ` · ${people.length} of ${group.size} on leave` : ''}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={theme.primaryDeep} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => String(p.empPkey)}
          renderItem={renderItem}
          contentContainerStyle={[s.list, people.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <UserCheck color={error ? theme.textMuted : '#16A34A'} size={44} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>{error ? 'Could not load' : 'Everyone is in today'}</Text>
              <Text style={[s.emptySub, { color: theme.textLight }]}>{error || 'Nobody in this team is on leave today.'}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800' },
  summary: { paddingHorizontal: moderateScale(20), marginBottom: moderateScale(8) },
  summaryTitle: { fontSize: moderateScale(16), fontWeight: '900' },
  summarySub: { fontSize: moderateScale(12.5), marginTop: 2 },
  list: { padding: moderateScale(16), paddingBottom: moderateScale(32) },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(16), padding: moderateScale(12), marginBottom: moderateScale(10), ...SHADOWS.light },
  name: { fontSize: moderateScale(15), fontWeight: '800' },
  sub: { fontSize: moderateScale(12), marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(10), paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(4), gap: 4 },
  badgeText: { fontSize: moderateScale(11), fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6) },
});

export default TeamLeaveScreen;
