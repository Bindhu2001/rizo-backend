import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Modal,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Plus, MessageSquare, X, AlertTriangle } from 'lucide-react-native';
import { format } from 'date-fns';
import CustomAlert from '../components/CustomAlert';
import { moderateScale, SHADOWS } from '../components/Theme';
import { useTheme } from '../components/ThemeContext';
import { HrQueriesApi, apiErrorMessage } from '../services/RevampApi';

// "Connect to HR" — the employee's own queries with HR (rizo-revamp hr_queries), raised and
// answered here; HR replies from the rizo-revamp web inbox.

const CATEGORIES = ['Complaint', 'Enquiry', 'Other'];
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 2000;

export const STATUS_STYLE = {
  Open: { bg: '#DBEAFE', text: '#1D4ED8' },
  Resolved: { bg: '#DCFCE7', text: '#16A34A' },
  Closed: { bg: '#F3F4F6', text: '#6B7280' },
};

export const fmtQueryDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? s : format(d, 'dd MMM yyyy, hh:mm a');
};

const NewQuerySheet = ({ visible, onClose, onCreated }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('Enquiry');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setCategory('Enquiry'); setSubject(''); setMessage(''); setError(''); };

  const submit = async () => {
    if (!subject.trim()) { setError('Subject is required'); return; }
    if (!message.trim()) { setError('Message is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await HrQueriesApi.create({ category, subject: subject.trim(), message: message.trim() });
      reset();
      onCreated(res?.id);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not send your query. Please check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} style={[s.overlay, { backgroundColor: theme.modalOverlay }]}>
        <View style={[s.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(moderateScale(24), insets.bottom + moderateScale(8)) }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: theme.text }]}>New Query</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X color={theme.textLight} size={22} />
            </TouchableOpacity>
          </View>

          <Text style={[s.label, { color: theme.textMuted }]}>Category *</Text>
          <View style={s.chipRow}>
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[s.chip, { borderColor: active ? theme.primaryDeep : theme.border, backgroundColor: active ? theme.primaryDeep : theme.inputBg }]}
                >
                  <Text style={[s.chipText, { color: active ? '#FFF' : theme.text }]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.label, { color: theme.textMuted }]}>Subject *</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            maxLength={SUBJECT_MAX}
            placeholder="What is it about?"
            placeholderTextColor={theme.textMuted}
            style={[s.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          />

          <Text style={[s.label, { color: theme.textMuted }]}>Message *</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            maxLength={MESSAGE_MAX}
            placeholder="Describe your complaint or question"
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
            style={[s.input, s.textArea, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
          />
          <Text style={[s.counter, { color: theme.textMuted }]}>{message.length}/{MESSAGE_MAX}</Text>

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <TouchableOpacity onPress={submit} disabled={saving} style={[s.primaryBtn, { backgroundColor: theme.primaryDeep }, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryBtnText}>Send to HR</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const HrConnectScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const user = route?.params?.user;
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [alertCfg, setAlertCfg] = useState(null);

  const load = async () => {
    try {
      const res = await HrQueriesApi.list();
      setQueries(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setAlertCfg({ type: 'error', title: 'Could not load', message: apiErrorMessage(e, 'Please check your connection and try again.') });
    } finally {
      setLoading(false);
    }
  };

  // Reload on every visit so unread dots clear after reading a thread
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openThread = (id) => navigation.navigate('HrQueryThread', { user, id });

  const renderItem = ({ item }) => {
    const st = STATUS_STYLE[item.status] || STATUS_STYLE.Closed;
    const fromHr = item.last_sender_type === 'admin';
    return (
      <TouchableOpacity onPress={() => openThread(item.hr_query_pkey)} activeOpacity={0.8} style={[s.card, { backgroundColor: theme.card }]}>
        <View style={s.cardTop}>
          <Text style={[s.category, { color: theme.textLight }]}>{item.category}</Text>
          <View style={s.badges}>
            {item.escalated && (
              <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}>
                <AlertTriangle color="#B45309" size={11} />
                <Text style={[s.badgeText, { color: '#B45309', marginLeft: 3 }]}>Escalated</Text>
              </View>
            )}
            <View style={[s.badge, { backgroundColor: st.bg }]}>
              <Text style={[s.badgeText, { color: st.text }]}>{item.status}</Text>
            </View>
          </View>
        </View>
        <View style={s.subjectRow}>
          <Text style={[s.subject, { color: theme.text }, item.is_unread && s.subjectUnread]} numberOfLines={1}>{item.subject}</Text>
          {item.is_unread && <View style={s.unreadDot} />}
        </View>
        {!!item.last_message && (
          <Text style={[s.preview, { color: theme.textLight }]} numberOfLines={2}>
            {fromHr ? 'HR: ' : 'You: '}{item.last_message}
          </Text>
        )}
        <Text style={[s.date, { color: theme.textMuted }]}>{fmtQueryDate(item.last_message_date || item.created_date)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
      <View style={[s.header, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Connect to HR</Text>
        <View style={{ width: moderateScale(44) }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={theme.primaryDeep} />
      ) : (
        <FlatList
          data={queries}
          keyExtractor={(q) => String(q.hr_query_pkey)}
          renderItem={renderItem}
          contentContainerStyle={[s.list, queries.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <MessageSquare color={theme.textMuted} size={44} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>No queries yet</Text>
              <Text style={[s.emptySub, { color: theme.textLight }]}>Raise a complaint or ask HR anything. Replies show up here.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity onPress={() => setShowNew(true)} style={[s.fab, { backgroundColor: theme.primaryDeep }]} activeOpacity={0.85}>
        <Plus color="#FFF" size={20} />
        <Text style={s.fabText}>New Query</Text>
      </TouchableOpacity>

      <NewQuerySheet
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => {
          setShowNew(false);
          load();
          if (id) openThread(id);
        }}
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(56) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(17), fontWeight: '800' },
  list: { padding: moderateScale(16), paddingBottom: moderateScale(96) },
  card: { borderRadius: moderateScale(14), padding: moderateScale(14), marginBottom: moderateScale(12), ...SHADOWS.light },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: moderateScale(11), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(6) },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(3), borderRadius: moderateScale(10) },
  badgeText: { fontSize: moderateScale(10), fontWeight: '800' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', marginTop: moderateScale(8) },
  subject: { flex: 1, fontSize: moderateScale(15), fontWeight: '600' },
  subjectUnread: { fontWeight: '900' },
  unreadDot: { width: moderateScale(9), height: moderateScale(9), borderRadius: moderateScale(5), backgroundColor: '#E91E63', marginLeft: moderateScale(8) },
  preview: { fontSize: moderateScale(13), marginTop: moderateScale(4), lineHeight: moderateScale(18) },
  date: { fontSize: moderateScale(11), marginTop: moderateScale(8) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: moderateScale(32) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', marginTop: moderateScale(12) },
  emptySub: { fontSize: moderateScale(13), textAlign: 'center', marginTop: moderateScale(6), lineHeight: moderateScale(19) },
  fab: { position: 'absolute', right: moderateScale(20), bottom: moderateScale(24), flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(18), height: moderateScale(48), borderRadius: moderateScale(24), ...SHADOWS.medium },
  fabText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(14), marginLeft: moderateScale(6) },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), padding: moderateScale(20) },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: moderateScale(12) },
  sheetTitle: { fontSize: moderateScale(17), fontWeight: '800' },
  label: { fontSize: moderateScale(12), fontWeight: '700', marginTop: moderateScale(12), marginBottom: moderateScale(6) },
  chipRow: { flexDirection: 'row', gap: moderateScale(8) },
  chip: { paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(8), borderRadius: moderateScale(18), borderWidth: 1 },
  chipText: { fontSize: moderateScale(13), fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: moderateScale(12), paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(10), fontSize: moderateScale(14) },
  textArea: { minHeight: moderateScale(110), maxHeight: moderateScale(200) },
  counter: { fontSize: moderateScale(11), textAlign: 'right', marginTop: moderateScale(4) },
  errorText: { color: '#DC2626', fontSize: moderateScale(13), marginTop: moderateScale(8) },
  primaryBtn: { height: moderateScale(50), borderRadius: moderateScale(14), alignItems: 'center', justifyContent: 'center', marginTop: moderateScale(16) },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(15) },
});

export default HrConnectScreen;
