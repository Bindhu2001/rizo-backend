import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Siren, Star, Info, Pin, Megaphone, X } from 'lucide-react-native';
import { format, parse } from 'date-fns';
import CustomAlert from '../components/CustomAlert';
import { moderateScale, SHADOWS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { AnnouncementsApi, apiErrorMessage } from '../services/RevampApi';

// Profile → Announcements: the company announcements addressed to this employee, the same list
// and tabs as the web ESS home "Company Updates" panel (rizo-revamp /api/mobile/announcements).
// Newest first in every tab; opening one marks it read (also on the web).

const CATEGORY_STYLE = {
  Emergency: { color: '#E11D48', bg: 'rgba(225,29,72,0.08)', border: 'rgba(225,29,72,0.25)', Icon: Siren },
  Important: { color: '#D97706', bg: 'rgba(217,119,6,0.09)', border: 'rgba(217,119,6,0.28)', Icon: Star },
  Information: { color: '#2772A0', bg: 'rgba(39,114,160,0.08)', border: 'rgba(39,114,160,0.25)', Icon: Info },
};
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'emergency', label: 'Urgent' },
  { key: 'important', label: 'Important' },
  { key: 'info', label: 'Info' },
  { key: 'pinned', label: 'Pinned' },
];
const inTab = (a, tab) => {
  if (tab === 'all') return true;
  if (tab === 'pinned') return a.is_pinned;
  if (tab === 'emergency') return a.category === 'Emergency';
  if (tab === 'important') return a.category === 'Important';
  return a.category === 'Information';
};
const styleOf = (a) => CATEGORY_STYLE[a.category] || CATEGORY_STYLE.Information;
const fmtDate = (ymd) => {
  if (!ymd) return '';
  const d = parse(ymd, 'yyyy-MM-dd', new Date());
  return isNaN(d.getTime()) ? ymd : format(d, 'dd MMM yyyy');
};

// Last list shown, so coming back never starts on a spinner
let cached = null;

const AnnouncementsScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const openId = route?.params?.openId;
  const [items, setItems] = useState(cached);
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const load = async () => {
    try {
      const res = await AnnouncementsApi.list();
      cached = Array.isArray(res?.data) ? res.data : [];
      setItems(cached);
      return cached;
    } catch (e) {
      if (!cached) setItems([]);
      setAlertCfg({ type: 'error', title: 'Could not load', message: apiErrorMessage(e, 'Please check your connection and try again.') });
      return cached || [];
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const show = (a) => {
    setOpen(a);
    if (!a.is_read) {
      // Marked read here at once; the server copy follows
      cached = (cached || []).map((x) => (x.announcement_pkey === a.announcement_pkey ? { ...x, is_read: true } : x));
      setItems(cached);
      AnnouncementsApi.markRead(a.announcement_pkey).catch(() => {});
    }
  };

  // Opened from a notification → straight to that announcement
  useEffect(() => {
    if (!openId) return;
    (async () => {
      const list = (cached || []).some((a) => Number(a.announcement_pkey) === openId) ? cached : await load();
      const a = (list || []).find((x) => Number(x.announcement_pkey) === openId);
      if (a) show(a);
    })();
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const visible = (items || []).filter((a) => inTab(a, tab));
  const count = (key) => (items || []).filter((a) => inTab(a, key)).length;

  const renderItem = ({ item }) => {
    const st = styleOf(item);
    const unread = !item.is_read;
    return (
      <TouchableOpacity onPress={() => show(item)} activeOpacity={0.8} style={[s.card, { backgroundColor: theme.card, borderLeftColor: st.color }]}>
        <View style={[s.iconBox, { backgroundColor: st.bg, borderColor: st.border }]}>
          <st.Icon color={st.color} size={18} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.titleRow}>
            <Text style={[s.title, { color: theme.text }, unread && s.titleUnread]} numberOfLines={2}>{item.title}</Text>
            {unread && <View style={s.unreadDot} />}
          </View>
          <Text style={[s.preview, { color: theme.textLight }]} numberOfLines={2}>{item.message}</Text>
          <View style={s.metaRow}>
            <Text style={[s.cat, { color: st.color }]}>{String(item.category).toUpperCase()}</Text>
            <Text style={[s.meta, { color: theme.textMuted }]}> · {fmtDate(item.publish_from)}</Text>
            {item.is_pinned && <Pin color={theme.textMuted} size={11} style={{ marginLeft: 6 }} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const st = open ? styleOf(open) : null;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Announcements</Text>
        <View style={{ width: moderateScale(44) }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
        {TABS.map((t) => {
          const on = t.key === tab;
          const n = count(t.key);
          return (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[s.tab, { borderColor: on ? theme.primaryDeep : theme.border, backgroundColor: on ? theme.primaryDeep : theme.card }]}>
              <Text style={[s.tabText, { color: on ? '#FFF' : theme.text }]}>{t.label}{items ? ` ${n}` : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {items == null ? (
        <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={theme.primaryDeep} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(a) => String(a.announcement_pkey)}
          renderItem={renderItem}
          contentContainerStyle={[s.list, visible.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Megaphone color={theme.textMuted} size={44} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>No announcements</Text>
              <Text style={[s.emptySub, { color: theme.textLight }]}>Company updates from HR will show up here.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)} statusBarTranslucent>
        <View style={[s.overlay, { backgroundColor: theme.modalOverlay }]}>
          {open && (
            <View style={[s.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(moderateScale(20), insets.bottom + moderateScale(8)) }]}>
              <View style={s.sheetTop}>
                <View style={[s.iconBox, { backgroundColor: st.bg, borderColor: st.border }]}>
                  <st.Icon color={st.color} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sheetMeta, { color: theme.textMuted }]}>
                    <Text style={{ color: st.color, fontWeight: '800' }}>{String(open.category).toUpperCase()}</Text>
                    {open.is_pinned ? ' · Pinned' : ''} · {fmtDate(open.publish_from)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setOpen(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X color={theme.textLight} size={22} />
                </TouchableOpacity>
              </View>
              <Text style={[s.sheetTitle, { color: theme.text }]}>{open.title}</Text>
              <ScrollView style={s.sheetBody}>
                <Text style={[s.sheetText, { color: theme.text }]} selectable>{open.message}</Text>
                {!!open.expires_on && (
                  <Text style={[s.expires, { color: theme.textMuted }]}>Valid till {fmtDate(open.expires_on)}</Text>
                )}
              </ScrollView>
              <TouchableOpacity onPress={() => setOpen(null)} style={[s.closeBtn, { backgroundColor: theme.cardSoft }]}>
                <Text style={[s.closeText, { color: theme.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800' },
  tabsWrap: { flexGrow: 0 },
  tabs: { paddingHorizontal: moderateScale(16), paddingBottom: moderateScale(10), gap: moderateScale(8) },
  tab: { borderWidth: 1, borderRadius: moderateScale(18), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(7) },
  tabText: { fontSize: moderateScale(13), fontWeight: '700' },
  list: { padding: moderateScale(16), paddingTop: moderateScale(4), paddingBottom: moderateScale(32) },
  card: { flexDirection: 'row', borderRadius: moderateScale(14), padding: moderateScale(14), marginBottom: moderateScale(12), borderLeftWidth: 4, gap: moderateScale(12), ...SHADOWS.light },
  iconBox: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(11), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { flex: 1, fontSize: moderateScale(15), fontWeight: '600' },
  titleUnread: { fontWeight: '900' },
  unreadDot: { width: moderateScale(9), height: moderateScale(9), borderRadius: moderateScale(5), backgroundColor: '#E91E63', marginLeft: moderateScale(8), marginTop: moderateScale(5) },
  preview: { fontSize: moderateScale(13), marginTop: moderateScale(4), lineHeight: moderateScale(18) },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(8) },
  cat: { fontSize: moderateScale(10), fontWeight: '800', letterSpacing: 0.4 },
  meta: { fontSize: moderateScale(11) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6) },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(20), maxHeight: '85%' },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(10) },
  sheetMeta: { fontSize: moderateScale(11.5) },
  sheetTitle: { fontSize: moderateScale(18), fontWeight: '900', marginTop: moderateScale(14) },
  sheetBody: { marginTop: moderateScale(10), flexGrow: 0 },
  sheetText: { fontSize: moderateScale(14.5), lineHeight: moderateScale(22) },
  expires: { fontSize: moderateScale(12), marginTop: moderateScale(14) },
  closeBtn: { marginTop: moderateScale(16), height: moderateScale(48), borderRadius: moderateScale(14), alignItems: 'center', justifyContent: 'center' },
  closeText: { fontWeight: '800', fontSize: moderateScale(15) },
});

export default AnnouncementsScreen;
