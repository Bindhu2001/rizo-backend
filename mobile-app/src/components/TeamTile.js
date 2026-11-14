import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './AppText';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Users, ChevronRight } from 'lucide-react-native';
import { SHADOWS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { TeamApi, PunchSelfieApi } from '../services/RevampApi';
import { SelfiePhoto, latestSelfieByEmp } from './TeamSelfie';

// Selfie faces shown on the tile before "+N"
const TILE_SELFIES = 4;

// Home "My Team" tile (rizo-revamp /api/mobile/team-today): full width like the Client Visit tile, but shorter.
// Shows how many people are in the team the employee authorises / approves and how many are in / on leave /
// not punched in / off for their current shift (each person once, even when in both teams);
// tapping opens the My Team page. Nothing at all when the employee has no team. GRTL / MYPY: today's punch
// selfies of the team as small faces next to the arrow (components/TeamSelfie.js).

// Unique people across the "authorise" and "approve" teams (a reportee can be in both)
export const teamSummary = (data) => {
  const groups = ['authorise', 'approve'].map((k) => data?.[k]).filter(Boolean);
  if (!groups.length) return null;
  const members = new Set();
  const out = new Set();
  const status = new Map(); // empPkey → IN / NOT_IN / WEEK_OFF / HOLIDAY / LEAVE (newer server only)
  groups.forEach((g) => {
    (g.members || []).forEach((m) => {
      members.add(m.empPkey);
      if (m.status) status.set(m.empPkey, m.status);
    });
    (g.onLeave || []).forEach((p) => out.add(p.empPkey));
  });
  const total = members.size || Math.max(...groups.map((g) => g.size || 0));
  if (!status.size) return { total, onLeave: out.size, counts: null };
  const counts = { in: 0, notIn: 0, weekOff: 0, holiday: 0 };
  status.forEach((st, key) => {
    if (out.has(key) || st === 'LEAVE') return;
    if (st === 'IN') counts.in += 1;
    else if (st === 'WEEK_OFF') counts.weekOff += 1;
    else if (st === 'HOLIDAY') counts.holiday += 1;
    else counts.notIn += 1;
  });
  return { total, onLeave: out.size, counts };
};

// "3 in · 1 on leave · 1 not in · 1 week off · 1 holiday" (newer server); older server: "1 on leave today" /
// "everyone is in today"
const subText = (sum) => {
  const head = `${sum.total} ${sum.total === 1 ? 'member' : 'members'}`;
  if (!sum.counts) return `${head} · ${sum.onLeave > 0 ? `${sum.onLeave} on leave today` : 'everyone is in today'}`;
  const parts = [];
  if (sum.counts.in) parts.push(`${sum.counts.in} in`);
  if (sum.onLeave) parts.push(`${sum.onLeave} on leave`);
  if (sum.counts.notIn) parts.push(`${sum.counts.notIn} not in`);
  if (sum.counts.weekOff) parts.push(`${sum.counts.weekOff} week off`);
  if (sum.counts.holiday) parts.push(`${sum.counts.holiday} holiday`);
  return [head, ...parts].join(' · ');
};

// Last answers, so returning to Home never makes the tile jump
let cached = null;
let cachedSelfies = [];

const TeamTile = ({ user }) => {
  const theme = useTheme();
  const navigation = useNavigation();
  const [data, setData] = useState(cached);
  const [selfies, setSelfies] = useState(cachedSelfies);

  useFocusEffect(useCallback(() => {
    let alive = true;
    TeamApi.today()
      .then((res) => { cached = res || null; if (alive) setData(cached); })
      .catch(() => {});
    // Today's team punch selfies (GRTL / MYPY): each person's latest, newest first
    PunchSelfieApi.teamToday()
      .then((rows) => { cachedSelfies = [...latestSelfieByEmp(rows).values()]; if (alive) setSelfies(cachedSelfies); })
      .catch(() => {});
    return () => { alive = false; };
  }, []));

  const sum = teamSummary(data);
  if (!sum) return null;
  const faceSize = moderateScale(30);

  return (
    <TouchableOpacity
      style={[s.tile, { backgroundColor: theme.card }]}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('MyTeam', { user })}
    >
      <View style={s.left}>
        <View style={s.iconBox}>
          <Users color="#FFF" size={18} />
        </View>
        <View style={s.textBox}>
          <Text style={[s.title, { color: theme.text }]}>My Team</Text>
          <Text style={[s.sub, { color: theme.textLight }]} numberOfLines={2}>{subText(sum)}</Text>
        </View>
      </View>
      {selfies.length > 0 && (
        <View style={s.faces} accessibilityLabel={`${selfies.length} punch ${selfies.length === 1 ? 'selfie' : 'selfies'} today`}>
          {selfies.slice(0, TILE_SELFIES).map((sf, i) => (
            <SelfiePhoto
              key={sf.id}
              selfie={sf}
              size={faceSize}
              round
              hideTag
              style={[s.face, { borderColor: theme.card, marginLeft: i ? -faceSize * 0.35 : 0 }]}
            />
          ))}
          {selfies.length > TILE_SELFIES && (
            <View style={[s.face, s.more, { width: faceSize, height: faceSize, borderRadius: faceSize / 2, borderColor: theme.card, marginLeft: -faceSize * 0.35 }]}>
              <Text style={s.moreText}>+{selfies.length - TILE_SELFIES}</Text>
            </View>
          )}
        </View>
      )}
      <ChevronRight color={theme.textLight} size={20} />
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  tile: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: moderateScale(20), paddingVertical: moderateScale(12), paddingHorizontal: moderateScale(16),
    marginBottom: moderateScale(16), ...SHADOWS.light,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  // Takes the room left of the arrow, so a long summary wraps to a second line instead of running under it
  textBox: { flex: 1, marginRight: moderateScale(8) },
  iconBox: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(12), backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(14) },
  title: { fontSize: moderateScale(15), fontWeight: '900', marginBottom: 1 },
  sub: { fontSize: moderateScale(11.5), fontWeight: '600' },
  // Today's punch selfies, overlapping faces left of the arrow
  faces: { flexDirection: 'row', alignItems: 'center', marginRight: moderateScale(6) },
  face: { borderWidth: 2 },
  more: { backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#FFF', fontSize: moderateScale(10), fontWeight: '800' },
});

export default TeamTile;
