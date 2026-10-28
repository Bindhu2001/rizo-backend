import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, TextInput,
  Platform, Keyboard, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Send, TriangleAlert, ShieldCheck, CheckCircle2, Lock, Check, Clock } from 'lucide-react-native';
import { format } from 'date-fns';
import CustomAlert from '../components/CustomAlert';
import { moderateScale, KEYBOARD_AVOID_BEHAVIOR } from '../components/Theme';
import KeyboardSafeView from '../components/KeyboardSafeView';
import { useTheme } from '../components/ThemeContext';
import { HrQueriesApi, apiErrorMessage } from '../services/RevampApi';
import { hrFill, hrAccent, PanelHeader, parseQueryDate, dayDiff } from './HrConnectScreen';
import { useKeyboardVisible } from '../components/KeyboardDoneBar';

// One "Connect to HR" conversation, chat-style like the web ESS widget's thread view: day
// separators, grouped bubbles with HR's avatar and name, status notes (sent / resolved /
// escalated), "Escalate" once HR has replied, and no reply box once HR closes it.
// A sent message shows straight away and is confirmed by the server in the background.
// Opening it marks HR's replies as read (server side).

const MESSAGE_MAX = 2000;
const POLL_MS = 6000;

const nowStamp = () => format(new Date(), 'yyyy-MM-dd HH:mm:ss');
const fmtTime = (s) => { const d = parseQueryDate(s); return isNaN(d.getTime()) ? '' : format(d, 'hh:mm a'); };
const fmtDay = (s) => {
  const diff = dayDiff(s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = parseQueryDate(s);
  return isNaN(d.getTime()) ? '' : format(d, 'dd MMM yyyy');
};
const initials = (name) => String(name || 'HR').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'HR';

const HrQueryThreadScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const accent = hrAccent(theme);
  const fill = hrFill(theme);
  const keyboardOpen = useKeyboardVisible();
const id = route?.params?.id;
  // A just-created conversation is passed in, so it shows without waiting for the server
  const initial = route?.params?.initial;
  const [query, setQuery] = useState(initial?.query || null);
  const [messages, setMessages] = useState(initial?.messages || []);
  // Sent from this screen, not confirmed by the server yet: { key, message, created_date, failed }
  const [pending, setPending] = useState([]);
  const [reply, setReply] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);
  const listRef = useRef(null);

  const load = async ({ silent = false } = {}) => {
    try {
      const res = await HrQueriesApi.thread(id);
      if (res?.query) setQuery(res.query);
      setMessages(Array.isArray(res?.messages) ? res.messages : []);
    } catch (e) {
      if (!silent) setAlertCfg({ type: 'error', title: 'Could not load', message: apiErrorMessage(e, 'Please check your connection and try again.') });
    }
  };

  useEffect(() => { load({ silent: !!initial }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // HR's replies arrive while the conversation is open: every 6s (as on the web) while the app
  // is in front, and at once when their push comes in
  useEffect(() => {
    let timer = setInterval(() => load({ silent: true }), POLL_MS);
    const appSub = AppState.addEventListener('change', (st) => {
      clearInterval(timer);
      if (st === 'active') { load({ silent: true }); timer = setInterval(() => load({ silent: true }), POLL_MS); }
    });
    const pushSub = Notifications.addNotificationReceivedListener((n) => {
      const data = n?.request?.content?.data || {};
      if (data.type === 'HR_QUERY' && Number(data.id) === Number(id)) load({ silent: true });
    });
    return () => { clearInterval(timer); appSub.remove(); pushSub.remove(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view when the keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60));
    return () => sub.remove();
  }, []);

  const deliver = async (key, text) => {
    try {
      const res = await HrQueriesApi.reply(id, text);
      // Shown as the server's copy from now on; the reload picks up a reopened status
      setMessages((prev) => [...prev, { hr_query_message_pkey: res?.id ?? key, sender_type: 'employee', message: text, created_date: nowStamp() }]);
      setPending((prev) => prev.filter((m) => m.key !== key));
      load({ silent: true });
    } catch (e) {
      setPending((prev) => prev.map((m) => (m.key === key ? { ...m, failed: true } : m)));
    }
  };

  const send = () => {
    const text = reply.trim();
    if (!text) return;
    const key = `local-${Date.now()}`;
    setReply('');
    setPending((prev) => [...prev, { key, message: text, created_date: nowStamp(), failed: false }]);
    deliver(key, text);
  };

  const retry = (m) => {
    setPending((prev) => prev.map((p) => (p.key === m.key ? { ...p, failed: false } : p)));
    deliver(m.key, m.message);
  };

  const escalate = () => {
    setAlertCfg({
      type: 'warning',
      title: 'Escalate this conversation?',
      message: "Not satisfied with HR's response? HR will be flagged to look at it as a priority.",
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Escalate', style: 'destructive', onPress: async () => {
            setEscalating(true);
            try {
              await HrQueriesApi.escalate(id);
              await load();
            } catch (e) {
              setAlertCfg({ type: 'error', title: 'Could not escalate', message: apiErrorMessage(e, 'Please try again.') });
            } finally {
              setEscalating(false);
            }
          },
        },
      ],
    });
  };

  const items = [...messages, ...pending.map((m) => ({ ...m, sender_type: 'employee' }))];

  const renderMessage = ({ item, index }) => {
    const mine = item.sender_type === 'employee';
    const prev = items[index - 1];
    const next = items[index + 1];
    const newDay = !prev || dayDiff(prev.created_date) !== dayDiff(item.created_date);
    const firstOfGroup = newDay || prev.sender_type !== item.sender_type;
    const lastOfGroup = !next || next.sender_type !== item.sender_type || dayDiff(next.created_date) !== dayDiff(item.created_date);
    const isPending = !!item.key && !item.failed;

    const bubble = (
      <View style={[s.bubble, mine
        ? [{ backgroundColor: item.failed ? '#DC2626' : fill },lastOfGroup && { borderBottomRightRadius: moderateScale(4) }]
        : [s.bubbleHr, { backgroundColor: theme.card, borderColor: theme.border }, lastOfGroup && { borderBottomLeftRadius: moderateScale(4) }]]}
      >
        <Text style={[s.msgText, { color: mine ? '#FFF' : theme.text }]}>{item.message}</Text>
        <View style={s.metaRow}>
          <Text style={[s.msgTime, { color: mine ? 'rgba(255,255,255,0.75)' : theme.textMuted }]}>
            {item.failed ? 'Not sent · tap to retry' : fmtTime(item.created_date)}
          </Text>
          {mine && !item.failed && (isPending
            ? <Clock color="rgba(255,255,255,0.75)" size={11} style={s.tick} />
            : <Check color="rgba(255,255,255,0.85)" size={13} style={s.tick} />)}
        </View>
      </View>
    );

    return (
      <View>
        {newDay && (
          <View style={[s.dayChip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.dayText, { color: theme.textMuted }]}>{fmtDay(item.created_date)}</Text>
          </View>
        )}
        <View style={[s.bubbleRow, mine ? s.rowMine : s.rowHr, firstOfGroup && !newDay && { marginTop: moderateScale(8) }]}>
          {!mine && (
            <View style={s.avatarSlot}>
              {lastOfGroup && (
                <View style={[s.avatar, { backgroundColor: fill }]}>
                  <Text style={s.avatarText}>{initials(item.sender_name)}</Text>
                </View>
              )}
            </View>
          )}
          <View style={[s.bubbleCol, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
            {!mine && firstOfGroup && (
              <View style={s.senderRow}>
                <ShieldCheck color={accent} size={11} />
                <Text style={[s.sender, { color: theme.textMuted }]}>{item.sender_name || 'HR'} · HR</Text>
              </View>
            )}
            {item.failed
              ? <TouchableOpacity onPress={() => retry(item)} activeOpacity={0.8}>{bubble}</TouchableOpacity>
              : bubble}
          </View>
        </View>
      </View>
    );
  };

  const status = query?.status;
  const canEscalate = !!query && !!query.has_admin_reply && !query.escalated && status !== 'Closed';
  const okText = theme.isDark ? '#34D399' : '#15803D';
  const badText = theme.isDark ? '#F87171' : '#991B1B';

  const footer = !query ? null : (
    <View>
      {!query.has_admin_reply && status === 'Open' && (
        <Text style={[s.note, { color: theme.textMuted }]}>Your query has been sent. HR will reply here.</Text>
      )}
      {status === 'Resolved' && (
        <View style={[s.banner, { backgroundColor: theme.isDark ? 'rgba(52,211,153,0.14)' : '#DCFCE7' }]}>
          <CheckCircle2 color={okText} size={15} />
          <Text style={[s.bannerText, { color: okText }]}>HR marked this as resolved. Still need help? Just reply and it will reopen.</Text>
        </View>
      )}
      {!!query.escalated && (
        <View style={[s.banner, { backgroundColor: theme.isDark ? 'rgba(248,113,113,0.14)' : '#FEE2E2' }]}>
          <TriangleAlert color={badText} size={15} />
          <Text style={[s.bannerText, { color: badText }]}>You escalated this conversation. HR has been flagged to look at it as a priority.</Text>
        </View>
      )}
      {canEscalate && (
        <View style={[s.escalateCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[s.escalateQ, { color: theme.textLight }]}>Not satisfied with HR's response?</Text>
          <TouchableOpacity onPress={escalate} disabled={escalating} style={[s.escalateBtn, { borderColor: theme.danger }, escalating && { opacity: 0.6 }]}>
            <TriangleAlert color={theme.danger} size={13} />
            <Text style={[s.escalateText, { color: theme.danger }]}>{escalating ? 'Escalating…' : 'Escalate'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const subtitle = query ? (
    <>
      <Text style={[s.subText, { color: theme.textLight }]}>{query.category}</Text>
      <View style={[s.headerPill, { backgroundColor: theme.cardSoft }]}><Text style={[s.headerPillText, { color: theme.text }]}>{status}</Text></View>
      {!!query.escalated && (
        <View style={[s.headerPill, s.pillRow, { backgroundColor: '#FEE2E2' }]}>
          <TriangleAlert color="#991B1B" size={10} />
          <Text style={[s.headerPillText, { color: '#991B1B', marginLeft: 3 }]}>Escalated</Text>
        </View>
      )}
    </>
  ) : null;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      <PanelHeader title={query?.subject || 'Loading…'} subtitle={subtitle} onBack={() => navigation.goBack()} />

      <KeyboardSafeView style={[s.body, { backgroundColor: theme.bg }]} behavior={KEYBOARD_AVOID_BEHAVIOR}>
        {!query ? (
          <View style={{ flex: 1 }}><ActivityIndicator style={{ marginTop: moderateScale(40) }} color={accent} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(m) => m.key || String(m.hr_query_message_pkey)}
            renderItem={renderMessage}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={footer}
          />
        )}

        {status === 'Closed' ? (
          <View style={[s.closedBar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(moderateScale(12), insets.bottom) }]}>
            <Lock color={theme.textMuted} size={13} />
            <Text style={[s.closedText, { color: theme.textMuted }]}>This conversation is closed. Start a new one if you need more help.</Text>
          </View>
        ) : (
          <View style={[s.composer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: keyboardOpen ? moderateScale(10) : Math.max(moderateScale(10), insets.bottom) }]}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              maxLength={MESSAGE_MAX}
              editable={!!query}
              placeholder={status === 'Resolved' ? 'Reply to reopen…' : 'Type a message…'}
              placeholderTextColor={theme.textMuted}
              multiline
              style={[s.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
            />
            <TouchableOpacity onPress={send} disabled={!reply.trim()} style={[s.sendBtn, { backgroundColor: fill }, !reply.trim() && { opacity: 0.5 }]}>
              <Send color="#FFF" size={18} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardSafeView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  subText: { fontSize: moderateScale(12) },
  headerPill: { paddingHorizontal: moderateScale(7), paddingVertical: moderateScale(1), borderRadius: moderateScale(10) },
  headerPillText: { fontSize: moderateScale(10.5), fontWeight: '700' },
  pillRow: { flexDirection: 'row', alignItems: 'center' },
  list: { paddingHorizontal: moderateScale(10), paddingTop: moderateScale(6), paddingBottom: moderateScale(14) },
  dayChip: { alignSelf: 'center', marginTop: moderateScale(10), marginBottom: moderateScale(6), borderWidth: 1, borderRadius: moderateScale(12), paddingHorizontal: moderateScale(10), paddingVertical: moderateScale(2) },
  dayText: { fontSize: moderateScale(11), fontWeight: '700' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: moderateScale(3) },
  rowMine: { justifyContent: 'flex-end' },
  rowHr: { justifyContent: 'flex-start' },
  avatarSlot: { width: moderateScale(30), marginRight: moderateScale(6) },
  avatar: { width: moderateScale(30), height: moderateScale(30), borderRadius: moderateScale(15), alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: moderateScale(11), fontWeight: '800' },
  bubbleCol: { maxWidth: '80%' },
  senderRow: { flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(4), marginBottom: moderateScale(3) },
  sender: { fontSize: moderateScale(11), fontWeight: '700', marginLeft: moderateScale(4) },
  bubble: { borderRadius: moderateScale(14), paddingHorizontal: moderateScale(12), paddingTop: moderateScale(7), paddingBottom: moderateScale(5) },
  bubbleHr: { borderWidth: StyleSheet.hairlineWidth },
  msgText: { fontSize: moderateScale(14), lineHeight: moderateScale(20) },
  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: moderateScale(2) },
  msgTime: { fontSize: moderateScale(10) },
  tick: { marginLeft: moderateScale(4) },
  note: { alignSelf: 'center', textAlign: 'center', fontSize: moderateScale(12), marginTop: moderateScale(12), maxWidth: '80%' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', marginTop: moderateScale(12), padding: moderateScale(10), borderRadius: moderateScale(12), gap: moderateScale(8) },
  bannerText: { flex: 1, fontSize: moderateScale(12), lineHeight: moderateScale(17) },
  escalateCard: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(12), padding: moderateScale(10), borderRadius: moderateScale(12), borderWidth: 1, borderStyle: 'dashed', gap: moderateScale(10) },
  escalateQ: { flex: 1, fontSize: moderateScale(12) },
  escalateBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: moderateScale(9), paddingHorizontal: moderateScale(11), paddingVertical: moderateScale(6), gap: moderateScale(4) },
  escalateText: { fontSize: moderateScale(12), fontWeight: '800' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: moderateScale(10), paddingTop: moderateScale(10), borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: moderateScale(20), paddingHorizontal: moderateScale(14), paddingTop: moderateScale(10), paddingBottom: moderateScale(10), fontSize: moderateScale(14), maxHeight: moderateScale(120) },
  sendBtn: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(22), alignItems: 'center', justifyContent: 'center', marginLeft: moderateScale(8) },
  closedBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(16), paddingTop: moderateScale(12), borderTopWidth: StyleSheet.hairlineWidth, gap: moderateScale(6) },
  closedText: { fontSize: moderateScale(12), textAlign: 'center', flexShrink: 1 },
});

export default HrQueryThreadScreen;
