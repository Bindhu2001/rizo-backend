import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Users, ChevronRight } from 'lucide-react-native';
import { SHADOWS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { TeamApi } from '../services/RevampApi';

// Home "My Team" tile (rizo-revamp /api/mobile/team-today): full width like the Client Visit tile, but shorter.
// Shows how many people are in the team the employee authorises / approves and how many are on leave today;
// tapping opens the My Team page. Nothing at all when the employee has no team.

// Unique people across the "authorise" and "approve" teams (a reportee can be in both)
export const teamSummary = (data) => {
  const groups = ['authorise', 'approve'].map((k) => data?.[k]).filter(Boolean);
  if (!groups.length) return null;
  const members = new Set();
  const out = new Set();
  groups.forEach((g) => {
    (g.members || []).forEach((m) => members.add(m.empPkey));
    (g.onLeave || []).forEach((p) => out.add(p.empPkey));
  });
  const total = members.size || Math.max(...groups.map((g) => g.size || 0));
  return { total, onLeave: out.size };
};

// Last answer, so returning to Home never makes the tile jump
let cached = null;

const TeamTile = ({ user }) => {
  const theme = useTheme();
  const navigation = useNavigation();
  const [data, setData] = useState(cached);

  useFocusEffect(useCallback(() => {
    let alive = true;
    TeamApi.today()
      .then((res) => { cached = res || null; if (alive) setData(cached); })
      .catch(() => {});
    return () => { alive = false; };
  }, []));

  const sum = teamSummary(data);
  if (!sum) return null;

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
        <View>
          <Text style={[s.title, { color: theme.text }]}>My Team</Text>
          <Text style={[s.sub, { color: theme.textLight }]}>
            {sum.total} {sum.total === 1 ? 'member' : 'members'} · {sum.onLeave > 0 ? `${sum.onLeave} on leave today` : 'everyone is in today'}
          </Text>
        </View>
      </View>
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
  iconBox: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(12), backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(14) },
  title: { fontSize: moderateScale(15), fontWeight: '900', marginBottom: 1 },
  sub: { fontSize: moderateScale(11.5), fontWeight: '600' },
});

export default TeamTile;
