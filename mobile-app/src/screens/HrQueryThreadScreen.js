import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { ChevronLeft, Send, AlertTriangle } from 'lucide-react-native';
import CustomAlert from '../components/CustomAlert';
import { moderateScale } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { HrQueriesApi, apiErrorMessage } from '../services/RevampApi';
import { STATUS_STYLE, fmtQueryDate } from './HrConnectScreen';

// One "Connect to HR" thread: the conversation with HR, a reply box, and "Not satisfied —
// Escalate" once HR has replied. Opening it marks HR's replies as read (server side).

const MESSAGE_MAX = 2000;

const HrQueryThreadScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const id = route?.params?.id;
  const [query, setQuery] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);
  const listRef = useRef(null);

  const load = async () => {
    try {
      const res = await HrQueriesApi.thread(id);
      setQuery(res?.query || null);
      setMessages(Array.isArray(res?.messages) ? res.messages : []);
    } catch (e) {
      setAlertCfg({ type: 'error', title: 'Could not load', message: apiErrorMessage(e, 'Please check your connection and try again.') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // HR replies while this thread is open → show it straight away
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n?.request?.content?.data || {};
      if (data.type === 'HR_QUERY' && Number(data.id) === Number(id)) load();
    });
    return () => sub.remove();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await HrQueriesApi.reply(id, text);
      setReply('');
      await load();
    } catch (e) {
      setAlertCfg({ type: 'error', title: 'Not sent', message: apiErrorMessage(e, 'Your message could not be sent. Please try again.') });
    } finally {
      setSending(false);
    }
  };

  const escalate = () => {
    setAlertCfg({
      type: 'warning',
      title: 'Escalate this query?',
      message: "Not satisfied with HR's reply? Escalating marks this query as urgent for HR.",
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

  const renderMessage = ({ item }) => {
    const mine = item.sender_type === 'employee';
    return (
      <View style={[s.bubbleRow, mine ? s.rowMine : s.rowHr]}>
        <View style={[s.bubble, mine
          ? { backgroundColor: theme.primaryDeep, borderBottomRightRadius: moderateScale(4) }
          : { backgroundColor: theme.card, borderBottomLeftRadius: moderateScale(4) }]}
        >
          {!mine && <Text style={[s.sender, { color: theme.primaryDeep }]}>{item.sender_name || 'HR'}</Text>}
          <Text style={[s.msgText, { color: mine ? '#FFF' : theme.text }]}>{item.message}</Text>
          <Text style={[s.msgTime, { color: mine ? 'rgba(255,255,255,0.75)' : theme.textMuted }]}>{fmtQueryDate(item.created_date)}</Text>
        </View>
      </View>
    );
  };

  const st = STATUS_STYLE[query?.status] || STATUS_STYLE.Closed;
  const canEscalate = query && query.has_admin_reply && !query.escalated;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      <View style={[s.header, { backgroundColor: theme.bg, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{query?.subject || 'Query'}</Text>
          {!!query && (
            <View style={s.headerMeta}>
              <Text style={[s.metaText, { color: theme.textLight }]}>{query.category}</Text>
              <View style={[s.badge, { backgroundColor: st.bg }]}><Text style={[s.badgeText, { color: st.text }]}>{query.status}</Text></View>
              {query.escalated && (
                <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}><Text style={[s.badgeText, { color: '#B45309' }]}>Escalated</Text></View>
              )}
            </View>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={theme.primaryDeep} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.hr_query_message_pkey)}
            renderItem={renderMessage}
            contentContainerStyle={s.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={canEscalate ? (
              <TouchableOpacity onPress={escalate} disabled={escalating} style={[s.escalateBtn, escalating && { opacity: 0.6 }]}>
                <AlertTriangle color="#B45309" size={16} />
                <Text style={s.escalateText}>Not satisfied — Escalate</Text>
              </TouchableOpacity>
            ) : null}
          />
        )}

        <View style={[s.composer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(moderateScale(10), insets.bottom) }]}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            maxLength={MESSAGE_MAX}
            placeholder={query && query.status !== 'Open' ? 'Reply to reopen this query…' : 'Type a message…'}
            placeholderTextColor={theme.textMuted}
            multiline
            style={[s.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!reply.trim() || sending}
            style={[s.sendBtn, { backgroundColor: theme.primaryDeep }, (!reply.trim() || sending) && { opacity: 0.5 }]}
          >
            {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Send color="#FFF" size={18} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(8), borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1, paddingRight: moderateScale(8) },
  headerTitle: { fontSize: moderateScale(16), fontWeight: '800' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(3), gap: moderateScale(6) },
  metaText: { fontSize: moderateScale(11), fontWeight: '700', textTransform: 'uppercase' },
  badge: { paddingHorizontal: moderateScale(7), paddingVertical: moderateScale(2), borderRadius: moderateScale(9) },
  badgeText: { fontSize: moderateScale(10), fontWeight: '800' },
  list: { padding: moderateScale(14), paddingBottom: moderateScale(20) },
  bubbleRow: { flexDirection: 'row', marginBottom: moderateScale(10) },
  rowMine: { justifyContent: 'flex-end' },
  rowHr: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: moderateScale(16), paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(8) },
  sender: { fontSize: moderateScale(11), fontWeight: '800', marginBottom: moderateScale(2) },
  msgText: { fontSize: moderateScale(14), lineHeight: moderateScale(20) },
  msgTime: { fontSize: moderateScale(10), marginTop: moderateScale(4), alignSelf: 'flex-end' },
  escalateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: moderateScale(6), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(9), borderRadius: moderateScale(18), backgroundColor: '#FEF3C7' },
  escalateText: { color: '#B45309', fontWeight: '800', fontSize: moderateScale(13), marginLeft: moderateScale(6) },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: moderateScale(10), paddingTop: moderateScale(10), borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: moderateScale(20), paddingHorizontal: moderateScale(14), paddingTop: moderateScale(10), paddingBottom: moderateScale(10), fontSize: moderateScale(14), maxHeight: moderateScale(120) },
  sendBtn: { width: moderateScale(42), height: moderateScale(42), borderRadius: moderateScale(21), alignItems: 'center', justifyContent: 'center', marginLeft: moderateScale(8) },
});

export default HrQueryThreadScreen;
