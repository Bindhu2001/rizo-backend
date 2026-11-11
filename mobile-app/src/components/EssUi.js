import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Pressable, Linking, Platform, Keyboard,
} from 'react-native';
import { Text, TextInput } from './AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardDoneBar, { doneBarId } from './KeyboardDoneBar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronLeft, ChevronDown, Check, X, Paperclip, Calendar as CalendarIcon, Filter } from 'lucide-react-native';
import { moderateScale, SHADOWS, COLORS } from './Theme';
import { useTheme } from './ThemeContext';
import KeyboardSafeView from './KeyboardSafeView';
import { getLoggedUser } from '../services/LocalDB';

// Building blocks of the screens that mirror the web employee login (Leave / Expense / Advance & Loan approvals,
// Advance & Loan requests): same fields, labels and statuses as the web, laid out for a phone.

// The app's own palette (components/Theme.js and the existing Leave / Regularisation approval screens), so these
// screens look like the rest of the app: deep purple for main buttons and titles, the violet accent for tabs and
// selections, and the soft tinted Authorize / Approve / Reject buttons.
export const BRAND = COLORS.primaryDeep;
export const ACCENT = COLORS.primaryDeep;
// solid = a sheet's confirm button, bg / text / border = the soft look of a list card's action button
export const TONES = {
  primary: { solid: COLORS.primaryDeep, bg: '#F3E8FF', text: COLORS.primaryDeep, border: '#4A148C33' },
  authorize: { solid: ACCENT, bg: '#F3F0FF', text: ACCENT, border: '#6C5CE755' },
  approve: { solid: '#16A34A', bg: '#DCFCE7', text: '#16A34A', border: '#16A34A55' },
  reject: { solid: '#EF4444', bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-11-07' / '2026-11-07 10:20:00' / ISO → '07 Nov 2026' (the web's en-IN date)
export const fmtDate = (d) => {
  if (!d) return '—';
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && s.length <= 19 && !s.endsWith('Z')) return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s;
  const ist = new Date(dt.getTime() + 5.5 * 3600 * 1000); // the web shows dates in Asia/Kolkata
  return `${String(ist.getUTCDate()).padStart(2, '0')} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
};
export const fmtMonth = (m) => {
  const mm = String(m || '').match(/^(\d{4})-(\d{2})/);
  return mm ? `${MONTHS[Number(mm[2]) - 1]} ${mm[1]}` : (m || '—');
};
export const fmtAmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtPercent = (v) => `${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
// The signed-in employee's emp_pkey (the empFkey the web's role checks compare against)
export const resolveEmpId = async (user) => Number(user?.emp_pkey) || Number((await getLoggedUser().catch(() => null))?.emp_pkey) || 0;

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const EssScreen = ({ title, onBack, children, right }) => {
  const theme = useTheme();
  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={[s.header, { backgroundColor: theme.card }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={28} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        <View style={{ width: moderateScale(44), alignItems: 'flex-end' }}>{right}</View>
      </View>
      {children}
    </SafeAreaView>
  );
};

// Pending / History tabs, the app's tab bar: white, the active tab underlined in the violet accent.
// Dark theme: the lighter purple (theme.primaryDeep), or the deep #4A148C is unreadable on the dark background.
export const SegTabs = ({ tabs, active, onChange }) => {
  const theme = useTheme();
  return (
    <View style={[s.tabs, { backgroundColor: theme.card, borderBottomColor: theme.divider }]}>
      {tabs.map((t) => (
        <TouchableOpacity key={t.key} style={[s.tab, active === t.key && s.tabActive, active === t.key && theme.isDark && { borderBottomColor: theme.primaryDeep }]} onPress={() => onChange(t.key)}>
          <Text style={[s.tabText, { color: active === t.key ? (theme.isDark ? theme.primaryDeep : ACCENT) : theme.textMuted }]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export const StatusChip = ({ status, colors = {}, labels = {} }) => {
  const c = colors[status] || { bg: '#F3F4F6', color: '#374151' };
  return (
    <View style={[s.chip, { backgroundColor: c.bg }]}>
      <Text style={[s.chipText, { color: c.color }]} numberOfLines={1}>{labels[status] || status}</Text>
    </View>
  );
};

export const Card = ({ children, onPress }) => {
  const theme = useTheme();
  const Wrap = onPress ? TouchableOpacity : View;
  return <Wrap activeOpacity={0.8} onPress={onPress} style={[s.card, { backgroundColor: theme.card, borderColor: theme.divider }]}>{children}</Wrap>;
};

// Label / value pairs, the web's detail grids
export const InfoRows = ({ rows }) => {
  const theme = useTheme();
  return (
    <View style={[s.info, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
      {rows.filter(Boolean).map(([label, value]) => (
        <View key={label} style={s.infoRow}>
          <Text style={[s.infoLabel, { color: theme.textMuted }]}>{label}</Text>
          {React.isValidElement(value)
            ? <View style={{ flex: 1 }}>{value}</View>
            : <Text style={[s.infoValue, { color: theme.text }]}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text>}
        </View>
      ))}
    </View>
  );
};

export const FileLink = ({ url, label }) => (
  <TouchableOpacity onPress={() => url && Linking.openURL(url)} style={s.fileLink} disabled={!url}>
    <Paperclip color={BRAND} size={14} />
    <Text style={s.fileLinkText} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

/**
 * A button in the app's style. tone: primary | authorize | approve | reject. soft = the tinted look of the
 * action buttons on the approval cards; otherwise solid. outline = the grey Cancel / Close button.
 */
export const ActionButton = ({ label, tone = 'primary', soft, outline, onPress, disabled }) => {
  const theme = useTheme();
  const t = TONES[tone] || TONES.primary;
  // Same look as the Leave screen in light and dark theme: the main button is RIZO purple (#4A148C) with white
  // text — never the light lavender theme.primaryDeep, which made white text unreadable in dark theme — and
  // Cancel / Close is an outlined button like Leave's secondary button.
  const look = outline
    ? { box: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.isDark ? theme.border : '#E5E7EB' }, text: theme.text }
    : soft
      ? { box: { backgroundColor: t.bg, borderColor: t.border, borderWidth: 1 }, text: t.text }
      : { box: { backgroundColor: t.solid }, text: '#FFF' };
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={[s.btn, look.box, disabled && { opacity: 0.5 }]}>
      <Text style={[s.btnText, { color: look.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
};

export const EmptyState = ({ text }) => {
  const theme = useTheme();
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 36, marginBottom: 8 }}>✅</Text>
      <Text style={[s.emptyText, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
};

/**
 * A bottom sheet with a form, kept above the keyboard the same way as the sign-up forms (SignupExtraDetails):
 * the sheet is at most 90% of the space left above the keyboard and its body scrolls, so the title and the
 * buttons always stay on screen. Tapping outside only closes the keyboard — never the sheet, which would lose
 * what was typed; X / Cancel close it. iPhone number pads get a Done bar (Input adds it to those fields).
 */
export const FormSheet = ({ visible, title, subtitle, onClose, children, footer }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardSafeView style={[s.overlay, { backgroundColor: theme.modalOverlay }]}>
        <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} />
        <View style={[s.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 12) + moderateScale(8) }]}>
          <View style={s.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: theme.text }]}>{title}</Text>
              {!!subtitle && <Text style={[s.sheetSub, { color: theme.textMuted }]}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
              <X color={theme.textMuted} size={20} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer}
        </View>
        <KeyboardDoneBar />
      </KeyboardSafeView>
    </Modal>
  );
};

/**
 * Bottom sheet for an action, like the web's action modals: details (children) on top, then an optional remarks
 * box, then Cancel + the action. remark: { required, maxLength } or null for no remarks box.
 */
export const ActionSheet = ({ visible, title, subtitle, children, remark, confirmLabel, confirmTone = 'primary', onConfirm, onClose, cancelLabel = 'Cancel' }) => {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (visible) { setText(''); setError(null); setBusy(false); } }, [visible]);

  const submit = async () => {
    if (remark?.required && !text.trim()) { setError('Reason is required.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Action failed');
      setBusy(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={(
        <View style={s.sheetBtns}>
          <ActionButton label={cancelLabel} outline onPress={onClose} />
          {!!confirmLabel && (
            <ActionButton
              label={busy ? '…' : confirmLabel}
              tone={confirmTone}
              onPress={submit}
              disabled={busy || (remark?.required && !text.trim())}
            />
          )}
        </View>
      )}
    >
      {children}
      {remark && (
        <>
          <Text style={[s.fieldLabel, { color: theme.textMuted }]}>
            {remark.required ? 'Reason for rejection *' : 'Remarks (optional)'}
          </Text>
          <TextInput
            value={text}
            onChangeText={(v) => { setText(v); setError(null); }}
            multiline
            maxLength={remark.maxLength}
            placeholder={remark.required ? 'Enter reason...' : 'Add a remark...'}
            placeholderTextColor={theme.textMuted}
            style={[s.textarea, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}
          />
        </>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </FormSheet>
  );
};

export const FieldLabel = ({ children }) => {
  const theme = useTheme();
  return <Text style={[s.fieldLabel, { color: theme.textMuted }]}>{children}</Text>;
};

// A text field; number / decimal pads get the iPhone Done bar (they have no Done key of their own)
export const Input = (props) => {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textMuted}
      inputAccessoryViewID={doneBarId(props.keyboardType)}
      {...props}
      style={[s.input, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBg }, props.multiline && { minHeight: moderateScale(80), textAlignVertical: 'top' }, props.style]}
    />
  );
};

// <input type="month">: this year's and the next / previous year's months
export const MonthSelect = ({ value, onChange }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const months = [];
  for (let i = -12; i <= 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return (
    <>
      <TouchableOpacity onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={[s.input, s.select, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}>
        <Text style={{ color: theme.text, fontSize: moderateScale(14) }}>{fmtMonth(value)}</Text>
        <ChevronDown color={theme.textMuted} size={18} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[s.overlay, { backgroundColor: theme.modalOverlay, justifyContent: 'center' }]} onPress={() => setOpen(false)}>
          <View style={[s.monthList, { backgroundColor: theme.card }]}>
            <ScrollView>
              {months.map((m) => (
                <TouchableOpacity key={m} style={s.monthItem} onPress={() => { onChange(m); setOpen(false); }}>
                  <Text style={{ color: m === value ? ACCENT : theme.text, fontWeight: m === value ? '800' : '500', fontSize: moderateScale(14) }}>{fmtMonth(m)}</Text>
                  {m === value && <Check color={ACCENT} size={16} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOf = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };

// <input type="date" min max> — 'YYYY-MM-DD'
export const DateSelect = ({ value, onChange, minimumDate, maximumDate, placeholder = 'Select date' }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const pick = (event, date) => {
    setOpen(false);
    if (event.type === 'set' && date) onChange(isoOf(date));
  };
  return (
    <>
      <TouchableOpacity onPress={() => { Keyboard.dismiss(); setOpen((v) => !v); }} style={[s.input, s.select, { borderColor: open ? ACCENT : theme.inputBorder, backgroundColor: theme.inputBg }]}>
        <Text style={{ color: value ? theme.text : theme.textMuted, fontSize: moderateScale(14) }}>{value ? fmtDate(value) : placeholder}</Text>
        <CalendarIcon color={theme.textMuted} size={16} />
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={value ? dateOf(value) : (minimumDate || new Date())}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant={theme.isDark ? 'dark' : 'light'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={pick}
        />
      )}
    </>
  );
};

// The web's [--Select--] dropdown: options [{ value, label }]
export const Select = ({ value, options, onChange, placeholder = '[--Select--]' }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <TouchableOpacity onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={[s.input, s.select, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}>
        <Text style={{ color: selected ? theme.text : theme.textMuted, fontSize: moderateScale(14), flex: 1 }} numberOfLines={1}>{selected ? selected.label : placeholder}</Text>
        <ChevronDown color={theme.textMuted} size={18} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[s.overlay, { backgroundColor: theme.modalOverlay, justifyContent: 'center' }]} onPress={() => setOpen(false)}>
          <View style={[s.monthList, { backgroundColor: theme.card }]}>
            <ScrollView>
              {options.map((o) => (
                <TouchableOpacity key={o.value} style={s.monthItem} onPress={() => { onChange(o.value); setOpen(false); }}>
                  <Text style={{ color: o.value === value ? ACCENT : theme.text, fontWeight: o.value === value ? '800' : '500', fontSize: moderateScale(14), flex: 1 }}>{o.label}</Text>
                  {o.value === value && <Check color={ACCENT} size={16} />}
                </TouchableOpacity>
              ))}
              {options.length === 0 && <Text style={{ color: theme.textMuted, padding: 18 }}>No options</Text>}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

// ── List filters (month / type / status), the pill look of the existing approval screens' month picker ──────────
export const ALL = 'all';

// "All months" + the current month and the 23 before it, newest first
export const monthFilterOptions = () => {
  const now = new Date();
  const out = [{ value: ALL, label: 'All months' }];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: v, label: fmtMonth(v) });
  }
  return out;
};

// "All …" + each distinct value of the rows (sorted), for a type / status filter
export const valueFilterOptions = (allLabel, values, labels = {}) => [
  { value: ALL, label: allLabel },
  ...[...new Set(values.filter(Boolean).map(String))].sort().map((v) => ({ value: v, label: labels[v] || v })),
];

// 'YYYY-MM' of a date from the API ('2026-11-07', '2026-11-07 10:00:00', ISO in UTC → India date)
export const monthOf = (d) => {
  if (!d) return '';
  const s = String(d);
  if (/^\d{4}-\d{2}/.test(s) && !s.endsWith('Z')) return s.slice(0, 7);
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return '';
  const ist = new Date(dt.getTime() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
};
// A from–to range touches the month (a leave from 30 Oct to 2 Nov is in both)
export const rangeInMonth = (from, to, month) => {
  if (month === ALL) return true;
  const a = monthOf(from);
  const b = monthOf(to) || a;
  return !!a && a <= month && month <= b;
};

const FilterPill = ({ icon: Icon, value, options, onChange }) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || options[0];
  const active = value !== ALL;
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[s.pill, { backgroundColor: theme.isDark ? theme.cardSoft : '#F3F0FF', borderColor: active ? BRAND : 'transparent' }]}
      >
        <Icon color={theme.isDark ? theme.primaryDeep : BRAND} size={15} />
        <Text style={[s.pillText, { color: theme.isDark ? theme.primaryDeep : BRAND }]} numberOfLines={1}>{selected?.label}</Text>
        <ChevronDown color={theme.isDark ? theme.primaryDeep : BRAND} size={15} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[s.overlay, { backgroundColor: theme.modalOverlay, justifyContent: 'center' }]} onPress={() => setOpen(false)}>
          <View style={[s.monthList, { backgroundColor: theme.card }]}>
            <ScrollView>
              {options.map((o) => (
                <TouchableOpacity key={o.value} style={s.monthItem} onPress={() => { onChange(o.value); setOpen(false); }}>
                  <Text style={{ color: o.value === value ? ACCENT : theme.text, fontWeight: o.value === value ? '800' : '500', fontSize: moderateScale(14), flex: 1 }}>{o.label}</Text>
                  {o.value === value && <Check color={ACCENT} size={16} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

/**
 * A row of filter pills: filters = [{ key, kind: 'month' | 'list', value, options, onChange }] (null entries are
 * skipped). Month pills show a calendar icon, the others a filter icon.
 */
export const FilterBar = ({ filters }) => (
  // A ScrollView grows to fill free space by default (flexGrow 1): with an empty / short list below it the
  // row grew tall and stretched the pills, and with a long list it got squeezed. Fixed to its own height.
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterBar}>
    {filters.filter(Boolean).map((f) => (
      <FilterPill key={f.key} icon={f.kind === 'month' ? CalendarIcon : Filter} value={f.value} options={f.options} onChange={f.onChange} />
    ))}
  </ScrollView>
);

/**
 * The web's MultiPersonPicker for Authorize By / Approve By: only the people admin allocated; the first is
 * pre-selected; any one selected person can act. A role with options can't be left empty.
 */
export const PersonPicker = ({ label, options, value, onChange, hint }) => {
  const theme = useTheme();
  const toggle = (id) => {
    Keyboard.dismiss();
    if (value.includes(id)) {
      if (value.length > 1) onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };
  return (
    <View style={{ marginBottom: moderateScale(12) }}>
      <FieldLabel>{label}</FieldLabel>
      {options.length === 0 ? null : options.map((o) => {
        const on = value.includes(o.empFkey);
        return (
          <TouchableOpacity key={o.empFkey} onPress={() => toggle(o.empFkey)} style={[s.person, { borderColor: on ? ACCENT : theme.inputBorder, backgroundColor: on ? (theme.isDark ? theme.cardSoft : '#F3F0FF') : theme.inputBg }]}>
            <View style={[s.check, { borderColor: on ? ACCENT : theme.inputBorder, backgroundColor: on ? ACCENT : 'transparent' }]}>
              {on && <Check color="#FFF" size={12} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: on ? '700' : '500', fontSize: moderateScale(13) }}>{o.name}</Text>
              {!!o.detail && <Text style={{ color: theme.textMuted, fontSize: moderateScale(11) }}>{o.detail}</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={{ color: theme.textMuted, fontSize: moderateScale(11), marginTop: 2 }}>{hint}</Text>
    </View>
  );
};

export const Loading = () => <ActivityIndicator style={{ marginTop: moderateScale(40) }} color={BRAND} />;

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: moderateScale(8), height: moderateScale(60) },
  backBtn: { width: moderateScale(44), height: moderateScale(44), justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(18), fontWeight: '800', flex: 1, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: moderateScale(12) },
  tab: { flex: 1, paddingVertical: moderateScale(12), alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: ACCENT },
  tabText: { fontSize: moderateScale(14), fontWeight: '700' },
  chip: { paddingHorizontal: moderateScale(10), paddingVertical: 4, borderRadius: moderateScale(8), alignSelf: 'flex-start' },
  chipText: { fontSize: moderateScale(11), fontWeight: '800' },
  card: { borderRadius: moderateScale(16), padding: moderateScale(14), marginHorizontal: moderateScale(16), marginBottom: moderateScale(16), borderWidth: 1, ...SHADOWS.light },
  info: { borderRadius: moderateScale(10), borderWidth: 1, padding: moderateScale(10), marginBottom: moderateScale(12) },
  infoRow: { flexDirection: 'row', paddingVertical: 4, gap: 10 },
  infoLabel: { width: moderateScale(118), fontSize: moderateScale(12) },
  infoValue: { flex: 1, fontSize: moderateScale(12.5), fontWeight: '600' },
  fileLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  fileLinkText: { color: BRAND, fontWeight: '700', fontSize: moderateScale(12.5), flexShrink: 1 },
  btn: { flex: 1, borderRadius: moderateScale(12), paddingVertical: moderateScale(12), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  btnText: { fontSize: moderateScale(14), fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: moderateScale(50), paddingHorizontal: moderateScale(24) },
  emptyText: { fontSize: moderateScale(13), textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), paddingHorizontal: moderateScale(20), paddingTop: moderateScale(20) },
  sheetBody: { flexGrow: 0, flexShrink: 1 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: moderateScale(12) },
  sheetTitle: { fontSize: moderateScale(18), fontWeight: '900' },
  sheetSub: { fontSize: moderateScale(12.5), marginTop: 2 },
  sheetBtns: { flexDirection: 'row', gap: moderateScale(12), marginTop: moderateScale(14) },
  fieldLabel: { fontSize: moderateScale(12), fontWeight: '700', marginBottom: 6, marginTop: 4 },
  textarea: { borderWidth: 1, borderRadius: moderateScale(12), padding: moderateScale(14), minHeight: moderateScale(100), textAlignVertical: 'top', fontSize: moderateScale(14) },
  input: { borderWidth: 1, borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(12), fontSize: moderateScale(14), marginBottom: moderateScale(12) },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { color: '#DC2626', fontSize: moderateScale(12), marginTop: 8 },
  monthList: { marginHorizontal: moderateScale(40), maxHeight: '70%', borderRadius: 16, paddingVertical: 6 },
  monthItem: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: moderateScale(12), padding: moderateScale(12), marginBottom: 6 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterBar: { paddingHorizontal: moderateScale(16), paddingBottom: moderateScale(12), gap: 8, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(8), borderRadius: moderateScale(20), maxWidth: moderateScale(220) },
  pillText: { fontSize: moderateScale(13), fontWeight: '700', flexShrink: 1 },
  check: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
