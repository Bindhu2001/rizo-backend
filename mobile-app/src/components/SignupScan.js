import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Modal } from 'react-native';
import { ScanLine, Camera, Image as ImageIcon } from 'lucide-react-native';
import { Text } from './AppText';
import { moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { pickPhotoAttachment, takePhotoAttachment } from '../services/AttachmentPicker';
import { SCANS, SCAN_LABELS, canScanAtSignup, planScan, readSignupPhoto, scanError, scannedDocument } from '../services/SignupScan';

// A "Scan …" button of the sign-up (services/SignupScan.js): photo -> read -> the empty boxes filled, and a note saying
// what was filled so the person checks it. Hidden for companies without it.
//   now      the sign-up's values now, by SCAN_LABELS key
//   onFill   (values) puts them in, through the same checks as typing
//   onDocument (doc) the photo, kept for the Documents step (only when the document is what the button asks for)
//   allow    (key, value) false: that value is left out

const PURPLE = '#4A148C';
const dmy = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? `${m[3]}-${m[2]}-${m[1]}` : v; };

const SignupScan = ({ scan, companyCode, now, onFill, onDocument, allow }) => {
  const theme = useTheme();
  const [choosing, setChoosing] = useState(false);
  const [state, setState] = useState(null); // null | { status: reading | failed | done, ... }
  const seq = useRef(0);
  const latest = useRef({ now, onFill, onDocument, allow });
  useEffect(() => { latest.current = { now, onFill, onDocument, allow }; });
  // Leaving the step while a photo is being read: the late answer must not fill anything
  useEffect(() => () => { seq.current = -1; }, []);
  if (!canScanAtSignup(companyCode)) return null;
  const spec = SCANS[scan];

  const read = async (pick) => {
    const picked = await pick();
    if (picked.canceled || seq.current < 0) return;
    if (picked.error) { setState({ status: 'failed', message: picked.error.message }); return; }
    const mine = ++seq.current;
    setState({ status: 'reading' });
    try {
      const { fields } = await readSignupPhoto(companyCode, picked.file, spec.kind);
      if (mine !== seq.current) return;
      const plan = planScan(scan, fields, latest.current.now, latest.current.allow);
      if (plan.filled.length) latest.current.onFill(plan.fill);
      if (fields?.kind === spec.kind) latest.current.onDocument?.(scannedDocument(scan, fields, picked.file));
      setState({ status: 'done', ...plan });
    } catch (e) {
      if (mine === seq.current) setState({ status: 'failed', message: scanError(e) });
    }
  };
  // iOS cannot open the camera / Photos while the chooser is still closing
  const choose = (pick) => { setChoosing(false); setTimeout(() => read(pick), Platform.OS === 'ios' ? 450 : 0); };
  const use = (sg) => {
    onFill({ [sg.key]: sg.value });
    setState((st) => ({ ...st, filled: [...st.filled.filter((k) => k !== sg.key), sg.key], suggestions: st.suggestions.filter((x) => x.key !== sg.key) }));
  };
  const busy = state?.status === 'reading';
  const good = state?.status === 'done' && !state.message;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => setChoosing(true)} accessibilityRole="button" accessibilityLabel={spec.button}>
        {busy ? <ActivityIndicator size="small" color={PURPLE} /> : <ScanLine color={PURPLE} size={18} />}
        <Text style={s.btnText}>{busy ? 'Reading…' : spec.button}</Text>
      </TouchableOpacity>

      {(state?.status === 'failed' || state?.status === 'done') && (
        <View style={[s.note, { borderColor: theme.border }, good && s.noteGood, state.status === 'failed' && s.noteBad]}>
          {!!state.message && <Text style={[s.noteText, { color: theme.text }]}>{state.message}</Text>}
          {state.status === 'done' && (
            <>
              {state.filled.length > 0 && <Text style={[s.noteText, { color: theme.text }]}><Text style={{ fontWeight: '800' }}>Filled: </Text>{state.filled.map((k) => SCAN_LABELS[k]).join(', ')}. Please check.</Text>}
              {!state.filled.length && state.matched.length > 0 && <Text style={[s.noteText, { color: theme.text }]}>Matches what you entered: {state.matched.map((k) => SCAN_LABELS[k]).join(', ')}.</Text>}
              {state.suggestions.map((sg) => (
                <View key={sg.key} style={s.suggestion}>
                  <Text style={[s.noteText, { color: theme.text, flex: 1 }]}>May show {SCAN_LABELS[sg.key]} <Text style={{ fontWeight: '800' }}>{dmy(sg.value)}</Text></Text>
                  <TouchableOpacity style={s.use} onPress={() => use(sg)} accessibilityLabel={`Use ${SCAN_LABELS[sg.key]}`}><Text style={s.useText}>Use</Text></TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      <Modal visible={choosing} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setChoosing(false)}>
        <TouchableOpacity style={[s.overlay, { backgroundColor: theme.modalOverlay }]} activeOpacity={1} onPress={() => setChoosing(false)}>
          <View style={[s.sheet, { backgroundColor: theme.card }]}>
            <Text style={[s.sheetTitle, { color: theme.text }]}>{spec.button}</Text>
            {[['Take Photo', Camera, takePhotoAttachment], ['Photo Library', ImageIcon, pickPhotoAttachment]].map(([label, Icon, pick]) => (
              <TouchableOpacity key={label} style={[s.row, { borderColor: theme.border }]} onPress={() => choose(pick)} accessibilityLabel={label}>
                <Icon color={PURPLE} size={20} />
                <Text style={[s.rowText, { color: theme.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[s.hint, { color: theme.textMuted }]}>Use a clear photo with no glare. It is read to fill this form and is not kept by the reader.</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { marginBottom: moderateScale(14) },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: PURPLE, backgroundColor: '#F5F0FF', borderRadius: 12, paddingVertical: moderateScale(11) },
  btnText: { color: PURPLE, fontWeight: '800', fontSize: moderateScale(13.5) },
  note: { borderWidth: 1, borderRadius: 10, padding: moderateScale(10), marginTop: 8 },
  noteGood: { borderColor: 'rgba(34,181,115,0.45)', backgroundColor: 'rgba(34,181,115,0.10)' },
  noteBad: { borderColor: 'rgba(220,38,38,0.35)', backgroundColor: 'rgba(220,38,38,0.07)' },
  noteText: { fontSize: moderateScale(12), lineHeight: moderateScale(18) },
  suggestion: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  use: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: PURPLE },
  useText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(12) },
  overlay: { flex: 1, justifyContent: 'center', padding: moderateScale(24) },
  sheet: { borderRadius: 18, padding: moderateScale(18) },
  sheetTitle: { fontSize: moderateScale(16), fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: moderateScale(13), marginBottom: 10 },
  rowText: { fontSize: moderateScale(14), fontWeight: '700' },
  hint: { fontSize: moderateScale(11) },
});

export default SignupScan;
