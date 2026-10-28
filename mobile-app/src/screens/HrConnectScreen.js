import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
  TextInput, Platform, RefreshControl, ScrollView, BackHandler,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, ChevronRight, Plus, MessageCircle, MessageSquare, AlertCircle, HelpCircle,
  ShieldCheck, TriangleAlert, Send,
} from 'lucide-react-native';
import { format } from 'date-fns';
import CustomAlert from '../components/CustomAlert';
import { moderateScale, SHADOWS, KEYBOARD_AVOID_BEHAVIOR } from '../components/Theme';
import KeyboardSafeView from '../components/KeyboardSafeView';
import { useFooterPadding } from '../components/KeyboardDoneBar';
import { useTheme } from '../components/ThemeContext';
import { HrQueriesApi, apiErrorMessage } from '../services/RevampApi';

// "Connect to HR" — the employee's own conversations with HR (rizo-revamp hr_queries), laid out like
// the web ESS widget (components/ess/HrConnectWidget.tsx): greeting header with "New conversation",
// Active / Closed lists, and a new-conversation form. HR replies from the rizo-revamp web inbox.

// Same look as the rest of the app: light/dark screen background and the Rizo purple for fills
// (buttons, own message bubbles) and accents.
export const hrFill = (theme) => (theme.isDark ? '#7C3AED' : '#4A148C');
export const hrAccent = (theme) => theme.primaryDeep;
export const hrAccentDim = (theme) => (theme.isDark ? 'rgba(167,139,250,0.18)' : '#F3E8FF');

const CATEGORIES = [
  { value: 'Complaint', hint: 'Report a problem', Icon: AlertCircle },
  { value: 'Enquiry', hint: 'Ask a question', Icon: HelpCircle },
  { value: 'Other', hint: 'Anything else', Icon: MessageSquare },
];
const categoryIcon = (c) => (CATEGORIES.find((x) => x.value === c) || CATEGORIES[2]).Icon;
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 2000;

export const STATUS_STYLE = {
  Open: { bg: '#DBEAFE', text: '#1D4ED8' },
  Resolved: { bg: '#DCFCE7', text: '#16A34A' },
  Closed: { bg: '#F3F4F6', text: '#6B7280' },
};

export const parseQueryDate = (s) => new Date(String(s || '').replace(' ', 'T'));
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
export const dayDiff = (s) => Math.round((startOfDay(new Date()) - startOfDay(parseQueryDate(s))) / 86400000);

export const fmtQueryDate = (s) => {
  if (!s) return '';
  const d = parseQueryDate(s);
  return isNaN(d.getTime()) ? s : format(d, 'dd MMM yyyy, hh:mm a');
};
// List time: today → time, yesterday → "Yesterday", else "28 Oct"
const fmtWhen = (s) => {
  const d = parseQueryDate(s);
  if (isNaN(d.getTime())) return '';
  const diff = dayDiff(s);
  if (diff === 0) return format(d, 'hh:mm a');
  if (diff === 1) return 'Yesterday';
  return format(d, 'dd MMM');
};

// Last list shown, so coming back to the page never starts on a spinner
let cachedQueries = null;

export const PanelHeader = ({ title, subtitle, onBack, children }) => {
  const theme = useTheme();
  return (
    <View style={[s.panelHeader, { backgroundColor: theme.bg, borderBottomColor: theme.border }]}>
      <View style={s.panelRow}>
        <TouchableOpacity onPress={onBack} style={s.headerIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.panelTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {!!subtitle && <View style={s.panelSub}>{subtitle}</View>}
        </View>
      </View>
      {children}
    </View>
  );
};

const NewConversation = ({ onBack, onCreated }) => {
  const theme = useTheme();
  const footerPad = useFooterPadding();
  const accent = hrAccent(theme);
  const [category, setCategory]= useState('Enquiry');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!subject.trim()) { setError('Please add a subject'); return; }
    if (!message.trim()) { setError('Please describe your query'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await HrQueriesApi.create({ category, subject: subject.trim(), message: message.trim() });
      onCreated(res?.id, { category, subject: subject.trim(), message: message.trim() });
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not send your query. Please check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const canSend = !!subject.trim() && !!message.trim() && !saving;

  return (
    <KeyboardSafeView behavior={KEYBOARD_AVOID_BEHAVIOR} keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={{ flex: 1 }}>
      <PanelHeader title="New conversation" subtitle={<Text style={[s.panelSubText, { color: theme.textLight }]}>HR will reply right here</Text>}onBack={onBack} />
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
        <Text style={[s.label, { color: theme.textMuted }]}>WHAT IS THIS ABOUT?</Text>
        <View style={s.catRow}>
          {CATEGORIES.map(({ value, hint, Icon }) => {
            const on = value === category;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setCategory(value)}
                activeOpacity={0.8}
                style={[s.catCard, { borderColor: on ? accent : theme.border, backgroundColor: on ? hrAccentDim(theme) : theme.card }]}
              >
                <Icon color={on ? accent : theme.textLight} size={20} />
                <Text style={[s.catTitle, { color: on ? accent : theme.text }]}>{value}</Text>
                <Text style={[s.catHint, { color: theme.textMuted }]} numberOfLines={1}>{hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[s.label, { color: theme.textMuted }]}>SUBJECT</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          maxLength={SUBJECT_MAX}
          placeholder="e.g. Salary credited late this month"
          placeholderTextColor={theme.textMuted}
          returnKeyType="next"
          style={[s.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
        />

        <Text style={[s.label, { color: theme.textMuted }]}>DETAILS</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          maxLength={MESSAGE_MAX}
          placeholder="Share as much detail as you can — dates, amounts, who was involved…"
          placeholderTextColor={theme.textMuted}
          multiline
          textAlignVertical="top"
          style={[s.input, s.textArea, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
        />
        <Text style={[s.counter, { color: message.length > 1800 ? theme.warning : theme.textMuted }]}>{message.length}/{MESSAGE_MAX}</Text>

        {!!error && <Text style={[s.errorText, { color: theme.danger }]}>{error}</Text>}
      </ScrollView>
      <View style={[s.formFooter, { borderTopColor: theme.border, backgroundColor: theme.card, paddingBottom: footerPad }]}>
        <TouchableOpacity onPress={submit} disabled={!canSend} style={[s.primaryBtn, { backgroundColor: hrFill(theme) }, !canSend && { opacity: 0.5 }]}>
          {saving ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Send color="#FFF" size={16} />
              <Text style={s.primaryBtnText}>Send to HR</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardSafeView>
  );
};

const HrConnectScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const accent = hrAccent(theme);
  const user = route?.params?.user;
  const firstName = String(user?.employee_name || '').trim().split(/\s+/)[0] || '';
  const [queries, setQueries] = useState(cachedQueries);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('list');
  const [alertCfg, setAlertCfg] = useState(null);

  const load = async () => {
    try {
      const res = await HrQueriesApi.list();
      cachedQueries = Array.isArray(res?.data) ? res.data : [];
      setQueries(cachedQueries);
    } catch (e) {
      if (!cachedQueries) setQueries([]);
      setAlertCfg({ type: 'error', title: 'Could not load', message: apiErrorMessage(e, 'Please check your connection and try again.') });
    }
  };

  // Reload on every visit so unread dots clear after reading a conversation
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openThread = (id, initial) => navigation.navigate('HrQueryThread', { user, id, initial });

  // Android back on the new-conversation form returns to the list, as its back arrow does
  useEffect(() => {
    if (view !== 'new') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setView('list'); return true; });
    return () => sub.remove();
  }, [view]);

  if (view === 'new') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
        <NewConversation
          onBack={() => setView('list')}
          onCreated={(id, q) => {
            setView('list');
            const now = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
            if (id) {
              // Shown at once in the list and the conversation; the server's copy replaces it on reload
              const row = { hr_query_pkey: id, category: q.category, subject: q.subject, status: 'Open', escalated: false, is_unread: false, last_message: q.message, last_sender_type: 'employee', last_message_date: now, created_date: now };
              cachedQueries = [row, ...(cachedQueries || [])];
              setQueries(cachedQueries);
              openThread(id, {
                query: { hr_query_pkey: id, category: q.category, subject: q.subject, status: 'Open', escalated: false, has_admin_reply: false, created_date: now },
                messages: [{ hr_query_message_pkey: `new-${id}`, sender_type: 'employee', message: q.message, created_date: now }],
              });
            }
            load();
          }}
        />
      </SafeAreaView>
    );
  }

  const active = (queries || []).filter((q) => q.status !== 'Closed');
  const closed = (queries || []).filter((q) => q.status === 'Closed');
  const sections = [
    ...(active.length ? [{ header: 'ACTIVE', key: 'h-active' }] : []),
    ...active,
    ...(closed.length ? [{ header: 'CLOSED', key: 'h-closed' }] : []),
    ...closed,
  ];

  const renderItem = ({ item }) => {
    if (item.header) return <Text style={[s.sectionLabel, { color: theme.textMuted }]}>{item.header}</Text>;
    const st = STATUS_STYLE[item.status] || STATUS_STYLE.Closed;
    const unread = !!item.is_unread;
    const Icon = categoryIcon(item.category);
    return (
      <TouchableOpacity onPress={() => openThread(item.hr_query_pkey)} activeOpacity={0.7} style={[s.row, { borderBottomColor: theme.border }]}>
        <View style={[s.rowIcon, { backgroundColor: hrAccentDim(theme) }]}>
          <Icon color={accent} size={19} />
          {unread && <View style={[s.unreadDot, { borderColor: theme.bg }]} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.rowTop}>
            <Text style={[s.subject, { color: theme.text }, unread && s.subjectUnread]} numberOfLines={1}>{item.subject}</Text>
            <Text style={[s.when, { color: unread ? accent : theme.textMuted }, unread && { fontWeight: '800' }]}>{fmtWhen(item.last_message_date || item.created_date)}</Text>
          </View>
          {!!item.last_message && (
            <Text style={[s.preview, { color: unread ? theme.textLight : theme.textMuted }]} numberOfLines={1}>
              {item.last_sender_type === 'admin' ? 'HR: ' : 'You: '}{item.last_message}
            </Text>
          )}
          <View style={s.pills}>
            <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillText, { color: st.text }]}>{item.status}</Text></View>
            <Text style={[s.catSmall, { color: theme.textMuted }]}>{item.category}</Text>
            {!!item.escalated && (
              <View style={[s.pill, s.pillRow, { backgroundColor: '#FEE2E2' }]}>
                <TriangleAlert color="#991B1B" size={10} />
                <Text style={[s.pillText, { color: '#991B1B', marginLeft: 3 }]}>Escalated</Text>
              </View>
            )}
          </View>
        </View>
        <ChevronRight color={theme.textMuted} size={16} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      <PanelHeader
        title={firstName ? `Hi ${firstName}, how can HR help?` : 'How can HR help?'}
        subtitle={<><ShieldCheck color={theme.textLight} size={12} /><Text style={[s.panelSubText, { color: theme.textLight, marginLeft: 5 }]}>Only HR can see your conversations</Text></>}
        onBack={() => navigation.goBack()}
      >
        <TouchableOpacity onPress={() => setView('new')} activeOpacity={0.85} style={[s.newCard, { backgroundColor: hrFill(theme) }]}>
          <View style={s.newIcon}><Plus color="#FFF" size={17} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.newTitle}>New conversation</Text>
            <Text style={s.newSub}>Raise a complaint or ask a question</Text>
          </View>
          <ChevronRight color="rgba(255,255,255,0.85)" size={17} />
        </TouchableOpacity>
      </PanelHeader>

      <View style={[s.container, { backgroundColor: theme.bg }]}>
      {queries == null ? (
        <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={accent} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(q) => q.key || String(q.hr_query_pkey)}
          renderItem={renderItem}
          contentContainerStyle={[s.list, sections.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[theme.primaryDeep]}/>}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: hrAccentDim(theme) }]}><MessageCircle color={accent} size={26} /></View>
              <Text style={[s.emptyTitle, { color: theme.text }]}>No conversations yet</Text>
              <Text style={[s.emptySub, { color: theme.textMuted }]}>Have a concern or a question about policies, payroll or anything else? Start a new conversation above.</Text>
            </View>
          }
        />
      )}
      </View>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  panelHeader: { paddingHorizontal: moderateScale(8), paddingTop: moderateScale(4), paddingBottom: moderateScale(12), borderBottomWidth: StyleSheet.hairlineWidth },
  panelRow: { flexDirection: 'row', alignItems: 'center' },
  headerIconBtn: { width: moderateScale(44), height: moderateScale(44), alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontWeight: '800', fontSize: moderateScale(17) },
  panelSub: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: moderateScale(3), gap: moderateScale(6) },
  panelSubText: { fontSize: moderateScale(12) },
  newCard: { marginTop: moderateScale(12), marginHorizontal: moderateScale(8), flexDirection: 'row', alignItems: 'center', borderRadius: moderateScale(14), padding: moderateScale(12), ...SHADOWS.light },
  newIcon: { width: moderateScale(34), height: moderateScale(34), borderRadius: moderateScale(10), backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: moderateScale(10) },
  newTitle: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(14) },
  newSub: { color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(12), marginTop: 1 },
  list: { paddingBottom: moderateScale(24) },
  sectionLabel: { fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: moderateScale(16), paddingTop: moderateScale(14), paddingBottom: moderateScale(4) },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(12), borderBottomWidth: StyleSheet.hairlineWidth, gap: moderateScale(12) },
  rowIcon: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(12), alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: -3, right: -3, width: moderateScale(11), height: moderateScale(11), borderRadius: moderateScale(6), backgroundColor: '#DC2626', borderWidth: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  subject: { flex: 1, fontSize: moderateScale(14), fontWeight: '600', marginRight: moderateScale(8) },
  subjectUnread: { fontWeight: '900' },
  when: { fontSize: moderateScale(11) },
  preview: { fontSize: moderateScale(13), marginTop: moderateScale(2) },
  pills: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(5), gap: moderateScale(6) },
  pill: { paddingHorizontal: moderateScale(7), paddingVertical: moderateScale(2), borderRadius: moderateScale(10) },
  pillRow: { flexDirection: 'row', alignItems: 'center' },
  pillText: { fontSize: moderateScale(10.5), fontWeight: '700' },
  catSmall: { fontSize: moderateScale(11) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32), paddingVertical: moderateScale(40) },
  emptyIcon: { width: moderateScale(56), height: moderateScale(56), borderRadius: moderateScale(16), alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: moderateScale(15), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6), lineHeight: moderateScale(19) },
  form: { padding: moderateScale(16), paddingBottom: moderateScale(24) },
  label: { fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 0.4, marginTop: moderateScale(14), marginBottom: moderateScale(7) },
  catRow: { flexDirection: 'row', gap: moderateScale(8) },
  catCard: { flex: 1, borderWidth: 1.5, borderRadius: moderateScale(12), paddingVertical: moderateScale(11), paddingHorizontal: moderateScale(4), alignItems: 'center' },
  catTitle: { fontSize: moderateScale(13), fontWeight: '800', marginTop: moderateScale(4) },
  catHint: { fontSize: moderateScale(10.5), marginTop: 2 },
  input: { borderWidth: 1.5, borderRadius: moderateScale(10), paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(10), fontSize: moderateScale(14) },
  textArea: { minHeight: moderateScale(130), maxHeight: moderateScale(220) },
  counter: { fontSize: moderateScale(11), textAlign: 'right', marginTop: moderateScale(4) },
  errorText: { fontSize: moderateScale(13), marginTop: moderateScale(8) },
  formFooter: { paddingHorizontal: moderateScale(16), paddingTop: moderateScale(12), borderTopWidth: StyleSheet.hairlineWidth },
  primaryBtn: { height: moderateScale(48), borderRadius: moderateScale(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: moderateScale(8) },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(15) },
});

export default HrConnectScreen;
