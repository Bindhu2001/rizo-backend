import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Users, ShieldCheck, BadgeCheck, CalendarOff, UserCheck, ChevronRight } from 'lucide-react-native';
import { SHADOWS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { TeamApi } from '../services/RevampApi';
import { IMAGE_ROOT, REVAMP_API_URL } from '../constants/Config';

// Home "Team today" (rizo-revamp /api/mobile/team-today): the employees whose leave this person
// authorises and approves, by the leave hierarchy, and how many of them are on leave today.
// Only the roles the person has are shown; nothing at all when they authorise / approve nobody.

const REVAMP_ORIGIN = REVAMP_API_URL.replace(/\/api\/mobile\/?$/, '');
const AVATARS_SHOWN = 3;
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#0D9488', '#4F46E5'];

// rizo-revamp photos are site paths (/uploads/...), legacy ones a file name on the PHP server
export const teamPhotoUri = (pic) => {
  const s = String(pic || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith('/') ? `${REVAMP_ORIGIN}${s}` : `${IMAGE_ROOT}/${s}`;
};
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export const TeamAvatar = ({ person, size, ring }) => {
  const [failed, setFailed] = useState(false);
  const uri = !failed && teamPhotoUri(person.profilePic);
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring };
  if (uri) return <Image source={{ uri }} style={box} onError={() => setFailed(true)} />;
  const bg = AVATAR_COLORS[Number(person.empPkey || 0) % AVATAR_COLORS.length];
  return (
    <View style={[box, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#FFF', fontWeight: '800', fontSize: size * 0.36 }}>{initials(person.name)}</Text>
    </View>
  );
};

// Last answer, so returning to Home never makes the card jump
let cached = null;

const ROLES = [
  { key: 'authorise', title: 'You authorise', Icon: ShieldCheck, color: '#2563EB', bg: '#DBEAFE' },
  { key: 'approve', title: 'You approve', Icon: BadgeCheck, color: '#7C3AED', bg: '#EDE9FE' },
];

const TeamTodayCard = ({ user }) => {
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

  const rows = ROLES.filter((r) => data?.[r.key]);
  if (!rows.length) return null;

  return (
    <View style={[s.card, { backgroundColor: theme.card }]}>
      <View style={s.header}>
        <View style={[s.iconBox, { backgroundColor: theme.isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE' }]}>
          <Users color="#2563EB" size={18} />
        </View>
        <Text style={[s.title, { color: theme.text }]}>Team today</Text>
      </View>

      {rows.map((r, i) => {
        const group = data[r.key];
        const out = group.onLeave || [];
        return (
          <TouchableOpacity
            key={r.key}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('TeamLeave', { user, role: r.key })}
            style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          >
            <View style={s.roleLine}>
              <View style={[s.smallIcon, { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : r.bg }]}>
                <r.Icon color={r.color} size={14} />
              </View>
              <Text style={[s.roleText, { color: theme.text }]}>{r.title}</Text>
              <Text style={[s.members, { color: theme.textLight }]}>{group.size} {group.size === 1 ? 'member' : 'members'}</Text>
            </View>
            <View style={s.statusLine}>
              {out.length > 0 ? (
                <>
                  <View style={[s.smallIcon, { backgroundColor: theme.isDark ? 'rgba(234,88,12,0.18)' : '#FFEDD5' }]}>
                    <CalendarOff color="#EA580C" size={14} />
                  </View>
                  <Text style={[s.statusText, { color: theme.text }]}>{out.length} on leave today</Text>
                  <View style={s.avatars}>
                    {out.slice(0, AVATARS_SHOWN).map((p, j) => (
                      <View key={p.empPkey} style={{ marginLeft: j ? -8 : 0 }}>
                        <TeamAvatar person={p} size={moderateScale(26)} ring={theme.card} />
                      </View>
                    ))}
                    {out.length > AVATARS_SHOWN && (
                      <View style={[s.more, { backgroundColor: theme.cardSoft, borderColor: theme.card }]}>
                        <Text style={[s.moreText, { color: theme.textLight }]}>+{out.length - AVATARS_SHOWN}</Text>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={[s.smallIcon, { backgroundColor: theme.isDark ? 'rgba(22,163,74,0.18)' : '#DCFCE7' }]}>
                    <UserCheck color="#16A34A" size={14} />
                  </View>
                  <Text style={[s.statusText, { color: theme.text }]}>Everyone is in today</Text>
                  <View style={{ flex: 1 }} />
                </>
              )}
              <ChevronRight color={theme.textMuted} size={18} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const s = StyleSheet.create({
  card: { borderRadius: moderateScale(24), padding: moderateScale(16), marginBottom: moderateScale(24), ...SHADOWS.light },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: moderateScale(4) },
  iconBox: { width: moderateScale(36), height: moderateScale(36), borderRadius: moderateScale(12), alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(10) },
  title: { fontSize: moderateScale(15), fontWeight: '900' },
  row: { paddingVertical: moderateScale(12) },
  roleLine: { flexDirection: 'row', alignItems: 'center' },
  smallIcon: { width: moderateScale(26), height: moderateScale(26), borderRadius: moderateScale(8), alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(8) },
  roleText: { flex: 1, fontSize: moderateScale(14), fontWeight: '800' },
  members: { fontSize: moderateScale(12), fontWeight: '700' },
  statusLine: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(8) },
  statusText: { fontSize: moderateScale(13), fontWeight: '600' },
  avatars: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginRight: moderateScale(4) },
  more: { width: moderateScale(26), height: moderateScale(26), borderRadius: moderateScale(13), borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  moreText: { fontSize: moderateScale(10), fontWeight: '800' },
});

export default TeamTodayCard;
