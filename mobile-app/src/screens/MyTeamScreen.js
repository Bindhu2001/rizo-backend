import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '../components/AppText';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFooterPadding } from '../components/KeyboardDoneBar';
import { ChevronLeft, ChevronDown, ChevronUp, ShieldCheck, BadgeCheck, CalendarX2, CalendarClock, Users } from 'lucide-react-native';
import { format } from 'date-fns';
import { moderateScale, SHADOWS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { TeamApi, PunchSelfieApi, isNetworkError } from '../services/RevampApi';
import TeamPunchList, { canListPunches, readMemberPunches, shownShift, IN_COLOR, OUT_COLOR } from '../components/TeamPunches';
import TeamAvatar from '../components/TeamAvatar';
import { SelfieThumb, latestSelfieByEmp } from '../components/TeamSelfie';

// Home "My Team" tile → this page. The two teams the employee has (rizo-revamp /api/mobile/team-today):
//   You authorise: people whose reporting manager they are
//   You approve:   people whose leave they approve
// Each shows "N members · 3 in · 1 on leave · 1 not punched in ⌄"; the arrow opens the list — names, and per
// person: leave type + part of the day (approved leave), "In · 09:32" with "Out · 18:05" below it once their last
// punch is an OUT, "Not punched in · Shift 09:30", "Week off" or "Holiday", for their current shift. The arrow on a
// person's row opens all their punches of that shift date under the name (components/TeamPunches.js). GRTL / MYPY:
// the person's latest punch selfie today beside the status — tap for the large photo (components/TeamSelfie.js).
// An older server sends no out time: no "Out" line and no arrow on the rows.

const ROLES = [
  { key: 'authorise', title: 'You authorise', note: 'Your reporting team', Icon: ShieldCheck, color: '#2563EB', bg: '#DBEAFE' },
  { key: 'approve', title: 'You approve', note: 'People whose leave you approve', Icon: BadgeCheck, color: '#7C3AED', bg: '#EDE9FE' },
];

// Everyone in the team; an older server that sends only who is on leave still shows those people
const peopleOf = (group) => (group.members && group.members.length
  ? group.members
  : (group.onLeave || []).map((p) => ({ ...p, leave: { leaveType: p.leaveType, session: p.session } })));

const MyTeamScreen = ({ navigation }) => {
  // The screen runs to the bottom edge; this keeps the last item clear of the home bar / gesture line
  const bottomPad = useFooterPadding();
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState({});
  const [selfies, setSelfies] = useState(new Map()); // empPkey → latest selfie today
  const [openPeople, setOpenPeople] = useState({}); // `${role}-${empPkey}` → true: their punches are shown
  const [punches, setPunches] = useState({}); // empPkey → { loading } | { error } | { data }
  const openPeopleRef = useRef(openPeople);
  openPeopleRef.current = openPeople;
  const punchRound = useRef(0); // raised by every reload: an answer from before it is dropped

  const loadPunches = async (empPkey) => {
    const round = punchRound.current;
    const show = (state) => { if (round === punchRound.current) setPunches((all) => ({ ...all, [empPkey]: state })); };
    show({ loading: true });
    try {
      show({ data: readMemberPunches(await TeamApi.memberPunches(empPkey)) });
    } catch (e) {
      // A status code means the server has no such list (older) or failed; its own message otherwise
      show({ error: isNetworkError(e) ? 'No internet connection.' : e?.response ? 'Could not load the punches.' : (e?.message || 'Could not load the punches.') });
    }
  };

  // The arrow on a person's row
  const togglePerson = (key, empPkey) => {
    const opening = !openPeople[key];
    setOpenPeople((all) => ({ ...all, [key]: opening }));
    if (opening && !punches[empPkey]?.data && !punches[empPkey]?.loading) loadPunches(empPkey);
  };

  const load = async () => {
    setError(false);
    // Lists already open are read again (their new punches), the others when they are opened
    punchRound.current += 1;
    setPunches({});
    const openIds = Object.keys(openPeopleRef.current).filter((k) => openPeopleRef.current[k]).map((k) => Number(k.slice(k.indexOf('-') + 1)));
    [...new Set(openIds)].forEach((id) => loadPunches(id));
    // The team list doesn't wait for the selfies (and a selfie failure never hides the team)
    PunchSelfieApi.teamToday().then((rows) => setSelfies(latestSelfieByEmp(rows))).catch(() => {});
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

  // "In · 09:32" and, once their last punch is an OUT, "Out · 18:05" below it
  const renderTimes = (shift, style) => {
    const otherDay = shift.inDate && shift.inDate !== format(new Date(), 'yyyy-MM-dd');
    const inDay = otherDay ? format(new Date(`${shift.inDate}T00:00:00`), 'dd MMM') : null;
    return (
      <View style={[s.statusBox, style]}>
        <Text style={[s.statusText, { color: IN_COLOR }]} numberOfLines={1}>{`In · ${shift.inTime}${inDay && shift.outTime ? ` (${inDay})` : ''}`}</Text>
        {shift.outTime
          ? <Text style={[s.statusText, s.outText, { color: OUT_COLOR }]} numberOfLines={1}>{`Out · ${shift.outTime}`}</Text>
          : !!inDay && <Text style={[s.statusSub, { color: theme.textMuted }]} numberOfLines={1}>{`since ${inDay}`}</Text>}
      </View>
    );
  };

  // Status for the member's current shift (server decides it like the Check In / Check Out button — a night
  // shift that started yesterday still counts). An older server sends no status: "In today" as before.
  const renderStatus = (p) => {
    const line = (text, color, sub) => (
      <View style={s.statusBox}>
        <Text style={[s.statusText, { color }]} numberOfLines={1}>{text}</Text>
        {!!sub && <Text style={[s.statusSub, { color: theme.textMuted }]} numberOfLines={1}>{sub}</Text>}
      </View>
    );
    const shift = shownShift(p);
    if (shift) return renderTimes(shift);
    switch (p.status) {
      case 'IN':
        return line('In', IN_COLOR, null);
      case 'NOT_IN':
        return line('Not punched in', '#DC2626', p.shiftStart ? `Shift ${p.shiftStart}` : null);
      case 'WEEK_OFF':
        return line('Week off', theme.textMuted, null);
      case 'HOLIDAY':
        return line('Holiday', '#7C3AED', p.holidayName || null);
      default:
        return <Text style={[s.inText, { color: theme.textMuted }]}>In today</Text>;
    }
  };

  // "3 in · 1 on leave · 1 not punched in · 1 week off · 1 holiday" (from each member's status);
  // older server (no status): "N on leave" / "all in today"
  const summaryParts = (group, out) => {
    const people = group.members || [];
    if (!people.some((m) => m.status)) {
      return [{ text: out > 0 ? `${out} on leave` : 'all in today', color: out > 0 ? '#EA580C' : '#16A34A' }];
    }
    const c = { in: 0, leave: 0, notIn: 0, weekOff: 0, holiday: 0 };
    people.forEach((m) => {
      if (m.leave || m.status === 'LEAVE') c.leave += 1;
      else if (m.status === 'IN' || m.lastShift) c.in += 1; // a finished night shift counts like a finished day shift
      else if (m.status === 'WEEK_OFF') c.weekOff += 1;
      else if (m.status === 'HOLIDAY') c.holiday += 1;
      else c.notIn += 1;
    });
    const parts = [];
    if (c.in) parts.push({ text: `${c.in} in`, color: '#16A34A' });
    if (c.leave) parts.push({ text: `${c.leave} on leave`, color: '#EA580C' });
    if (c.notIn) parts.push({ text: `${c.notIn} not punched in`, color: '#DC2626' });
    if (c.weekOff) parts.push({ text: `${c.weekOff} week off`, color: theme.textMuted });
    if (c.holiday) parts.push({ text: `${c.holiday} holiday`, color: '#7C3AED' });
    return parts;
  };

  const renderPerson = (p, role) => {
    const half = p.leave && p.leave.session !== 'Full day';
    const selfie = selfies.get(Number(p.empPkey));
    const key = `${role}-${p.empPkey}`;
    const listable = canListPunches(p);
    const times = listable ? shownShift(p) : null; // an older server: the leave badge alone, as before
    const shown = listable && !!openPeople[key];
    const Row = listable ? TouchableOpacity : View;
    const rowProps = listable ? {
      activeOpacity: 0.7,
      onPress: () => togglePerson(key, Number(p.empPkey)),
      accessibilityLabel: `${shown ? 'Hide' : 'Show'} punches of ${p.name}`,
    } : {};
    return (
      <View key={p.empPkey} style={[s.personWrap, { borderTopColor: theme.border }]}>
      <Row style={s.person} {...rowProps}>
        <TeamAvatar person={p} size={moderateScale(38)} />
        <View style={{ flex: 1, marginLeft: moderateScale(12) }}>
          <Text style={[s.name, { color: theme.text }]} numberOfLines={1}>{p.name}</Text>
          {!!p.empId && <Text style={[s.empId, { color: theme.textMuted }]}>{p.empId}</Text>}
        </View>
        {p.leave ? (
          <View style={s.leaveBox}>
            <View style={[s.badge, { backgroundColor: half ? '#FEF3C7' : '#FFEDD5' }]}>
              {half ? <CalendarClock color="#D97706" size={13} /> : <CalendarX2 color="#EA580C" size={13} />}
              <View>
                <Text style={[s.badgeType, { color: half ? '#B45309' : '#C2410C' }]} numberOfLines={1}>{p.leave.leaveType || 'On leave'}</Text>
                <Text style={[s.badgeSession, { color: half ? '#B45309' : '#C2410C' }]}>{p.leave.session}</Text>
              </View>
            </View>
            {/* First / second half leave: they work the other half, so their In / Out shows too (a punch on a full day's leave as well) */}
            {!!times && renderTimes(times, s.leaveTimes)}
          </View>
        ) : renderStatus(p)}
        {!!selfie && (
          <View style={{ marginLeft: moderateScale(10) }}>
            <SelfieThumb selfie={selfie} name={p.name} size={moderateScale(34)} />
          </View>
        )}
        {listable && (
          <View style={s.personArrow}>
            {shown ? <ChevronUp color={theme.textLight} size={18} /> : <ChevronDown color={theme.textLight} size={18} />}
          </View>
        )}
      </Row>
      {shown && <TeamPunchList name={p.name} state={punches[p.empPkey]} onRetry={() => loadPunches(Number(p.empPkey))} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
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
          contentContainerStyle={[s.scroll, { paddingBottom: bottomPad }, groups.length === 0 && { flexGrow: 1 }]}
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
                  <Text style={[s.summaryText, { color: theme.text, flex: 1, marginRight: moderateScale(8) }]}>
                    {group.size} {group.size === 1 ? 'member' : 'members'}
                    {summaryParts(group, out).map((part) => (
                      <Text key={part.text}> · <Text style={{ color: part.color }}>{part.text}</Text></Text>
                    ))}
                  </Text>
                  {expanded ? <ChevronUp color={theme.textLight} size={20} /> : <ChevronDown color={theme.textLight} size={20} />}
                </TouchableOpacity>

                {expanded && <View style={{ marginTop: moderateScale(4) }}>{people.map((p) => renderPerson(p, r.key))}</View>}
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
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800' },
  date: { fontSize: moderateScale(12.5), paddingHorizontal: moderateScale(20), marginBottom: moderateScale(8) },
  scroll: { padding: moderateScale(16), paddingBottom: moderateScale(32) },
  card: { borderRadius: moderateScale(20), padding: moderateScale(16), marginBottom: moderateScale(16), ...SHADOWS.light },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: moderateScale(12) },
  roleIcon: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(12), alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(12) },
  roleTitle: { fontSize: moderateScale(15), fontWeight: '900' },
  roleNote: { fontSize: moderateScale(11.5), marginTop: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(12) },
  summaryText: { fontSize: moderateScale(14), fontWeight: '800' },
  personWrap: { borderTopWidth: StyleSheet.hairlineWidth },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10) },
  personArrow: { marginLeft: moderateScale(6) },
  outText: { marginTop: 1 },
  name: { fontSize: moderateScale(14), fontWeight: '800' },
  empId: { fontSize: moderateScale(11.5), marginTop: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(10), paddingHorizontal: moderateScale(9), paddingVertical: moderateScale(5), gap: moderateScale(6) },
  leaveBox: { maxWidth: '48%', alignItems: 'flex-end' },
  leaveTimes: { maxWidth: '100%', marginLeft: 0, marginTop: moderateScale(4) },
  badgeType: { fontSize: moderateScale(11), fontWeight: '800' },
  badgeSession: { fontSize: moderateScale(10), fontWeight: '600' },
  inText: { fontSize: moderateScale(11.5), fontWeight: '600' },
  statusBox: { alignItems: 'flex-end', maxWidth: '48%', marginLeft: moderateScale(8) },
  statusText: { fontSize: moderateScale(12), fontWeight: '800' },
  statusSub: { fontSize: moderateScale(10.5), fontWeight: '600', marginTop: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6) },
});

export default MyTeamScreen;
