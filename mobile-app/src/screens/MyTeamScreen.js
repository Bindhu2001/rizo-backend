import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, ChevronUp, ShieldCheck, BadgeCheck, CalendarX2, CalendarClock, Users } from 'lucide-react-native';
import { format } from 'date-fns';
import { moderateScale, SHADOWS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { TeamApi } from '../services/RevampApi';
import TeamAvatar from '../components/TeamAvatar';

// Home "My Team" tile → this page. The two teams the employee has (rizo-revamp /api/mobile/team-today):
//   You authorise: people whose reporting manager they are
//   You approve:   people whose leave they approve
// Each shows "N members · M on leave ⌄"; the arrow opens the list — names, and for anyone on leave today the
// leave type and which part of the day.

const ROLES = [
  { key: 'authorise', title: 'You authorise', note: 'Your reporting team', Icon: ShieldCheck, color: '#2563EB', bg: '#DBEAFE' },
  { key: 'approve', title: 'You approve', note: 'People whose leave you approve', Icon: BadgeCheck, color: '#7C3AED', bg: '#EDE9FE' },
];

// Everyone in the team; an older server that sends only who is on leave still shows those people
const peopleOf = (group) => (group.members && group.members.length
  ? group.members
  : (group.onLeave || []).map((p) => ({ ...p, leave: { leaveType: p.leaveType, session: p.session } })));

const MyTeamScreen = ({ navigation }) => {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState({});

  const load = async () => {
    setError(false);
    try {
      setData(await TeamApi.today());
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const groups = ROLES.filter((r) => data?.[r.key]);

  const renderPerson = (p) => {
    const half = p.leave && p.leave.session !== 'Full day';
    return (
      <View key={p.empPkey} style={[s.person, { borderTopColor: theme.border }]}>
        <TeamAvatar person={p} size={moderateScale(38)} />
        <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{p.name}</Text>
          {!!p.empId && <Text style={[s.empId, { color: theme.textMuted }]}>{p.empId}</Text>}
        </View>
        {p.leave ? (
          <View style={[s.badge, { backgroundColor: half ? '#FEF3C7' : '#FFEDD5' }]}>
            {half ? <CalendarClock color="#D97706" size={13} /> : <CalendarX2 color="#EA580C" size={13} />}
            <View>
              <Text style={[s.badgeType, { color: half ? '#B45309' : '#C2410C' }]} numberOfLines={1}>{p.leave.leaveType || 'On leave'}</Text>
              <Text style={[s.badgeSession, { color: half ? '#B45309' : '#C2410C' }]}>{p.leave.session}</Text>
            </View>
          </View>
        ) : (
          <Text style={[s.inText, { color: theme.textMuted }]}>In today</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>My Team</Text>
        <View style={{ width: moderateScale(44) }} />
      </View>
      <Text style={[s.date, { color: theme.textLight }]}>{format(new Date(), 'EEEE, dd MMM yyyy')}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={theme.primaryDeep} />
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, groups.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {groups.length === 0 ? (
            <View style={s.empty}>
              <Users color={theme.textMuted} size={44} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>{error ? 'Could not load' : 'No team yet'}</Text>
              <Text style={[s.emptySub, { color: theme.textLight }]}>
                {error ? 'Please check your connection and pull to retry.' : 'People you authorise or approve leave for will show here.'}
              </Text>
            </View>
          ) : groups.map((r) => {
            const group = data[r.key];
            const people = peopleOf(group);
            const out = (group.onLeave || []).length;
            const expanded = !!open[r.key];
            return (
              <View key={r.key} style={[s.card, { backgroundColor: theme.card }]}>
                <View style={s.cardTop}>
                  <View style={[s.roleIcon, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : r.bg }]}>
                    <r.Icon color={r.color} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.roleTitle, { color: theme.text }]}>{r.title}</Text>
                    <Text style={[s.roleNote, { color: theme.textMuted }]}>{r.note}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))}
                  style={[s.summary, { backgroundColor: theme.cardSoft }]}
                >
                  <Text style={[s.summaryText, { color: theme.text }]}>
                    {group.size} {group.size === 1 ? 'member' : 'members'} · <Text style={{ color: out > 0 ? '#EA580C' : '#16A34A' }}>{out > 0 ? `${out} on leave` : 'all in today'}</Text>
                  </Text>
                  {expanded ? <ChevronUp color={theme.textLight} size={20} /> : <ChevronDown color={theme.textLight} size={20} />}
                </TouchableOpacity>

                {expanded && <View style={{ marginTop: moderateScale(4) }}>{people.map(renderPerson)}</View>}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800' },
  date: { fontSize: moderateScale(12.5), paddingHorizontal: moderateScale(20), marginBottom: moderateScale(8) },
  scroll: { padding: moderateScale(16), paddingBottom: moderateScale(32) },
  card: { borderRadius: moderateScale(20), padding: moderateScale(16), marginBottom: moderateScale(16), ...SHADOWS.light },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: moderateScale(12) },
  roleIcon: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(12), alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(12) },
  roleTitle: { fontSize: moderateScale(15), fontWeight: '900' },
  roleNote: { fontSize: moderateScale(11.5), marginTop: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(12) },
  summaryText: { fontSize: moderateScale(14), fontWeight: '800' },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10), borderTopWidth: StyleSheet.hairlineWidth },
  name: { fontSize: moderateScale(14), fontWeight: '800' },
  empId: { fontSize: moderateScale(11.5), marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(10), paddingHorizontal: moderateScale(9), paddingVertical: moderateScale(5), gap: moderateScale(6), maxWidth: '48%' },
  badgeType: { fontSize: moderateScale(11), fontWeight: '800' },
  badgeSession: { fontSize: moderateScale(10), fontWeight: '600' },
  inText: { fontSize: moderateScale(11.5), fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6) },
});

export default MyTeamScreen;
