import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from './AppText';
import { moderateScale } from './Theme';
import { useTheme } from './ThemeContext';

// My Team: the punches of one person, opened with the arrow on their row (services/RevampApi.js TeamApi.memberPunches).

export const IN_COLOR = '#16A34A';
export const OUT_COLOR = '#C2185B';

/** '2026-11-25' → '25-11-2026' ('' when it isn't a date) */
export const ddmmyyyy = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/**
 * The In / Out to show for a person: their current shift's punches, else the night shift that ended today (the server
 * sends it as lastShift, because once they punch out their current shift is already the next one). null = no punches.
 */
export const shownShift = (person) => (person?.inTime
  ? { inTime: person.inTime, inDate: person.inDate, outTime: person.outTime || null }
  : person?.lastShift?.inTime ? person.lastShift : null);

/** Can this person's punches be listed? Only a server that also sends the out time has the list; older ones don't. */
export const canListPunches = (person) => !!person && 'outTime' in person && !!shownShift(person);

/**
 * The server's answer → { date, punches: [{ time, date, direction, source }] }, oldest first.
 * Rows without a usable time or direction are left out.
 */
export const readMemberPunches = (data) => {
  const punches = (Array.isArray(data?.punches) ? data.punches : [])
    .map((p) => ({
      time: String(p?.time || '').slice(0, 5),
      date: String(p?.date || '').slice(0, 10),
      direction: String(p?.direction || '').trim().toUpperCase(),
      source: String(p?.source || '').trim(),
    }))
    .filter((p) => /^\d{2}:\d{2}$/.test(p.time) && (p.direction === 'IN' || p.direction === 'OUT'));
  // Same minute: kept in the order the server sent them (its order has the seconds)
  const order = punches.map((p, i) => ({ p, i, key: `${p.date} ${p.time}` }));
  order.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i));
  return { date: String(data?.shiftDate || '').slice(0, 10), punches: order.map((o) => o.p) };
};

// state: { loading } | { error } | { data: { date, punches } }
const TeamPunchList = ({ name, state, onRetry }) => {
  const theme = useTheme();
  if (!state || state.loading) {
    return <View style={s.box}><ActivityIndicator color={theme.primaryDeep} /></View>;
  }
  if (state.error) {
    return (
      <TouchableOpacity style={[s.box, { backgroundColor: theme.cardSoft }]} onPress={onRetry} activeOpacity={0.7}>
        <Text style={[s.message, { color: theme.textLight }]}>{state.error}</Text>
        <Text style={[s.retry, { color: theme.primaryDeep }]}>Tap to try again</Text>
      </TouchableOpacity>
    );
  }
  const { date, punches } = state.data;
  return (
    <View style={[s.box, { backgroundColor: theme.cardSoft }]}>
      <Text style={[s.head, { color: theme.text }]} numberOfLines={1}>{[name, ddmmyyyy(date)].filter(Boolean).join(' · ')}</Text>
      {punches.length === 0 ? (
        <Text style={[s.message, { color: theme.textLight }]}>No punches</Text>
      ) : punches.map((p, i) => (
        <View key={i} style={s.row}>
          <Text style={[s.time, { color: theme.text }]}>{p.time}</Text>
          <Text style={[s.direction, { color: p.direction === 'IN' ? IN_COLOR : OUT_COLOR }]}>{p.direction}</Text>
          <Text style={[s.source, { color: theme.textMuted }]} numberOfLines={1}>
            {/* A night shift runs into the next day: those punches also say which day */}
            {[p.source, p.date && date && p.date !== date ? ddmmyyyy(p.date) : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  box: { borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(10), marginBottom: moderateScale(10) },
  head: { fontSize: moderateScale(12.5), fontWeight: '800', marginBottom: moderateScale(6) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(4) },
  time: { fontSize: moderateScale(13), fontWeight: '800', width: moderateScale(56) },
  direction: { fontSize: moderateScale(12), fontWeight: '800', width: moderateScale(48) },
  source: { flex: 1, fontSize: moderateScale(12), fontWeight: '600' },
  message: { fontSize: moderateScale(12), fontWeight: '600' },
  retry: { fontSize: moderateScale(12), fontWeight: '800', marginTop: moderateScale(4) },
});

export default React.memo(TeamPunchList);
