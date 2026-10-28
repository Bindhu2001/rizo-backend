import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, CalendarX2 } from 'lucide-react-native';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, isSameDay, parse } from 'date-fns';
import { moderateScale, SHADOWS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { fetchMonthEvents, eventsOnDay, eventMeta, EVENT_COLORS } from '../services/UpcomingEvents';

// "View full month list" from the Home calendar: every event of the month, one card per date,
// latest date at the top. Same data and date matching as the calendar (services/UpcomingEvents).

const LEGEND = [
  { label: 'Birthday', color: EVENT_COLORS.BIR },
  { label: 'Anniv.', color: EVENT_COLORS.JOIN },
  { label: 'Holiday', color: EVENT_COLORS.HO },
  { label: 'Week Off', color: EVENT_COLORS.WO },
];

const EventsListScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const userId = route?.params?.userId;
  const [month, setMonth] = useState(() => {
    const m = route?.params?.month;
    return m ? parse(m, 'yyyy-MM', new Date()) : new Date();
  });
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = async (date) => {
    setError(false);
    try {
      const events = await fetchMonthEvents(userId, date);
      const grouped = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) })
        .map((day) => ({ day, events: eventsOnDay(events, day) }))
        .filter((d) => d.events.length > 0)
        .reverse();
      setDays(grouped);
    } catch (e) {
      setDays([]);
      setError(true);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load(month).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => { setRefreshing(true); await load(month); setRefreshing(false); };

  const total = days.reduce((n, d) => n + d.events.length, 0);

  const renderDay = ({ item }) => {
    const today = isSameDay(item.day, new Date());
    return (
      <View style={[s.card, { backgroundColor: theme.card }, today && { borderColor: theme.primaryDeep, borderWidth: 1.5 }]}>
        <View style={s.dateCol}>
          <Text style={[s.dateNum, { color: today ? theme.primaryDeep : theme.text }]}>{format(item.day, 'dd')}</Text>
          <Text style={[s.dateMon, { color: theme.textLight }]}>{format(item.day, 'MMM')}</Text>
          <Text style={[s.dateDow, { color: theme.textMuted }]}>{format(item.day, 'EEE')}</Text>
          {today && <Text style={[s.todayTag, { color: theme.primaryDeep }]}>TODAY</Text>}
        </View>
        <View style={[s.divider, { backgroundColor: theme.border }]} />
        <View style={{ flex: 1 }}>
          {item.events.map((e, i) => {
            const meta = eventMeta(e);
            return (
              <View key={i} style={[s.eventRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={[s.dot, { backgroundColor: meta.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.eventName, { color: theme.text }]} numberOfLines={2}>{meta.name}</Text>
                  <Text style={[s.eventType, { color: theme.textLight }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
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
        <Text style={[s.headerTitle, { color: theme.text }]}>Upcoming Events</Text>
        <View style={{ width: moderateScale(44) }} />
      </View>

      <View style={s.monthBar}>
        <TouchableOpacity onPress={() => setMonth((m) => addMonths(m, -1))} style={[s.monthBtn, { backgroundColor: theme.cardSoft }]}>
          <ChevronLeft color={theme.primaryDeep} size={20} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[s.monthTitle, { color: theme.text }]}>{format(month, 'MMMM yyyy')}</Text>
          {!loading && !error && <Text style={[s.monthSub, { color: theme.textMuted }]}>{total} {total === 1 ? 'event' : 'events'}</Text>}
        </View>
        <TouchableOpacity onPress={() => setMonth((m) => addMonths(m, 1))} style={[s.monthBtn, { backgroundColor: theme.cardSoft }]}>
          <ChevronRight color={theme.primaryDeep} size={20} />
        </TouchableOpacity>
      </View>

      <View style={s.legend}>
        {LEGEND.map((l) => (
          <View key={l.label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: l.color }]} />
            <Text style={[s.legendText, { color: theme.textLight }]}>{l.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={theme.primaryDeep} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(d) => d.day.toISOString()}
          renderItem={renderDay}
          contentContainerStyle={[s.list, days.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <CalendarX2 color={theme.textMuted} size={44} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>{error ? 'Could not load events' : 'No events this month'}</Text>
              <Text style={[s.emptySub, { color: theme.textLight }]}>{error ? 'Please check your connection and pull to retry.' : 'Try another month with the arrows above.'}</Text>
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
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(16), marginBottom: moderateScale(10) },
  monthBtn: { padding: moderateScale(8), borderRadius: moderateScale(12) },
  monthTitle: { fontSize: moderateScale(17), fontWeight: '900' },
  monthSub: { fontSize: moderateScale(12), marginTop: 2 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginBottom: moderateScale(8) },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginHorizontal: moderateScale(8), marginBottom: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: moderateScale(12), fontWeight: '600' },
  list: { padding: moderateScale(16), paddingTop: moderateScale(6), paddingBottom: moderateScale(32) },
  card: { flexDirection: 'row', borderRadius: moderateScale(16), padding: moderateScale(12), marginBottom: moderateScale(12), borderWidth: 1.5, borderColor: 'transparent', ...SHADOWS.light },
  dateCol: { width: moderateScale(54), alignItems: 'center', justifyContent: 'center' },
  dateNum: { fontSize: moderateScale(22), fontWeight: '900' },
  dateMon: { fontSize: moderateScale(12), fontWeight: '700', textTransform: 'uppercase' },
  dateDow: { fontSize: moderateScale(11), marginTop: 1 },
  todayTag: { fontSize: moderateScale(9), fontWeight: '900', marginTop: 3, letterSpacing: 0.5 },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: moderateScale(12) },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(8) },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: moderateScale(10) },
  eventName: { fontSize: moderateScale(14), fontWeight: '800' },
  eventType: { fontSize: moderateScale(12), fontWeight: '600', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6) },
});

export default EventsListScreen;
