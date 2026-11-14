import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Image, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Package, FilePen, FileText, FileImage, File as FileIcon, Eye, Download, X,
  Hash, CalendarDays, ShieldCheck, IndianRupee, Tag, Info, Boxes,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Text } from './AppText';
import CustomAlert from './CustomAlert';
import PdfViewerModal from './PdfViewerModal';
import { useTheme } from './ThemeContext';
import { COLORS, SHADOWS, moderateScale, LARGE_SCREEN_CAPPED_WIDTH } from './Theme';
import { AllocationsApi } from '../services/RevampApi';

// Profile › Assets & Documents (DigitalOcean companies): the web employee login's About Me › My Assets,
// Generated Documents and My Documents — named My Assets, My Documents and Official Documents in the app
// (ProfileScreen ALLOC_SECTIONS). Every row: icon, a bold title (2 lines at most), its details one per line
// underneath, and the View / Download buttons on the right — the same layout as the Salary Slip list. Tapping a
// row opens it (a document's View, an asset's details). kind: 'assets' | 'generated' | 'documents'.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '2026-10-12' → '12 Oct 2026'
const fmtDate = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v ? String(v) : '—';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}`;
};
const has = (v) => v != null && String(v).trim() !== '';
// A file name the phone accepts
const safeName = (v) => String(v || 'Document').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Document';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Same states and colours as the web (ASSET_STATE_LABEL / ASSET_STATE_COLOR)
const ASSET_STATE = {
  1: { label: 'Good', bg: '#F0FDF4', fg: '#166534', dark: '#4ADE80' },
  2: { label: 'Damaged But Working', bg: '#FEFCE8', fg: '#854D0E', dark: '#FACC15' },
  3: { label: 'Not Working', bg: '#FEF2F2', fg: '#991B1B', dark: '#F87171' },
};

const TYPE_FOR_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain',
};

const EMPTY = {
  assets: 'No assets have been allocated to you yet.',
  generated: 'No documents have been generated for you yet.',
  documents: 'No documents have been shared with you yet.',
};

// "2 assets allocated to you" / "3 documents" / "4 documents · 1 not available"
const countLine = (kind, rows) => {
  if (kind === 'assets') return `${plural(rows.length, 'asset', 'assets')} allocated to you`;
  const missing = kind === 'documents' ? rows.filter((r) => !r.available).length : 0;
  return `${plural(rows.length, 'document', 'documents')}${missing ? ` · ${missing} not available` : ''}`;
};

// A small coloured label (an asset's condition, a file's type, Not available)
const Chip = ({ label, fg, bg, darkFg }) => {
  const theme = useTheme();
  return (
    <View style={[st.chip, { backgroundColor: theme.isDark ? `${darkFg || fg}26` : bg }]}>
      <Text style={[st.chipText, { color: theme.isDark ? (darkFg || fg) : fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
};

// A round icon button (View / Download); shows a spinner while its action runs
const IconBtn = ({ Icon, label, onPress, spinning, disabled }) => {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[st.iconBtn, { backgroundColor: theme.cardSoft }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      {spinning ? <ActivityIndicator size="small" color={COLORS.primaryDeep} /> : <Icon color={theme.isDark ? theme.textLight : theme.textMuted} size={16} />}
    </TouchableOpacity>
  );
};

// One list row: icon, title (2 lines at most), details one per line, a chip, and the buttons on the right
const Row = ({ icon: Icon, tint, title, lines, chip, onPress, disabled, last, children }) => {
  const theme = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[st.row, !last && { borderBottomColor: theme.divider, borderBottomWidth: 1 }]}
    >
      <View style={[st.rowIcon, { backgroundColor: theme.isDark ? `${tint}26` : `${tint}14` }]}><Icon color={tint} size={20} /></View>
      <View style={st.rowMain}>
        <Text style={[st.rowTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
        {lines.filter(Boolean).map((l, i) => (
          <Text key={i} style={[st.rowLine, { color: theme.textLight }]} numberOfLines={1}>{l}</Text>
        ))}
        {chip}
      </View>
      {children ? <View style={st.rowEnd}>{children}</View> : null}
    </TouchableOpacity>
  );
};

// Why a list could not load, from the error: no reply at all is the connection; anything else is the server's
// answer, with its code so it can be traced ("Server error (500)")
const loadFailMessage = (e) => {
  const status = e?.response?.status;
  if (!status) return 'Could not load. Please check your connection and pull down to try again.';
  if (status === 401) return 'Could not sign in to load this (401). Please log out and log in again.';
  if (status === 429) return 'Too many sign-in attempts. Please wait a few minutes and pull down to try again.';
  if (status >= 500) return `Could not load: server error (${status}). Please pull down to try again later, or contact HR.`;
  return `Could not load (${status}). Please pull down to try again.`;
};

const AssetsDocuments = ({ kind }) => {
  const theme = useTheme();
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(null); // the message to show when the list could not load
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null); // { id, action: 'view' | 'download' } — one at a time
  const [pdf, setPdf] = useState(null); // { uri, title } in the PDF viewer
  const [image, setImage] = useState(null); // { uri, title, ext } in the image viewer
  const [asset, setAsset] = useState(null); // the asset whose details are open
  const [alertCfg, setAlertCfg] = useState(null);
  const showAlert = (type, title, message) => setAlertCfg({ type, title, message });

  const load = useCallback(async () => {
    try {
      const res = kind === 'assets' ? await AllocationsApi.assets()
        : kind === 'generated' ? await AllocationsApi.generatedDocuments()
          : await AllocationsApi.documents();
      setRows(Array.isArray(res?.data) ? res.data : []);
      setFailed(null);
    } catch (e) {
      console.log('Assets & Documents load failed', kind, e?.response?.status, e?.response?.data?.error, e?.message);
      setFailed(loadFailMessage(e));
      setRows((r) => r || []);
    }
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const share = async (uri, mimeType, title) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType, UTI: mimeType === 'application/pdf' ? '.pdf' : undefined, dialogTitle: title });
      } else {
        showAlert('error', 'Error', 'Sharing/Downloading is not available on this device.');
      }
    } catch (e) {
      console.warn('share error', e?.message);
    }
  };

  // A generated document as a PDF in the cache folder: the server's A4 page, printed on the phone
  const generatedPdf = async (row) => {
    const res = await AllocationsApi.generatedDocument(row.document_pkey);
    const { uri } = await Print.printToFileAsync({ html: res.html, width: 595, height: 842, base64: false });
    const dest = `${FileSystem.cacheDirectory}${safeName(row.document_name)}.pdf`;
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.moveAsync({ from: uri, to: dest });
      return dest;
    } catch (_) {
      return uri;
    }
  };

  // An allocated document's file in the cache folder, under its own name with its extension
  const documentFile = (row) => {
    const base = safeName(row.name);
    const fileName = row.ext && !base.toLowerCase().endsWith(`.${row.ext}`) ? `${base}.${row.ext}` : base;
    return AllocationsApi.downloadDocument(row.id, fileName);
  };

  const run = async (id, action, work) => {
    if (busy) return;
    setBusy({ id, action });
    try {
      await work();
    } catch (e) {
      console.log('Assets & Documents action failed', e?.response?.status, e?.message);
      showAlert('error', action === 'view' ? 'Could not open' : 'Could not download', e?.response?.status === 404
        ? 'This document is not available.'
        : 'Please check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const viewGenerated = (row) => run(row.document_pkey, 'view', async () => {
    setPdf({ uri: await generatedPdf(row), title: row.document_name });
  });
  const downloadGenerated = (row) => run(row.document_pkey, 'download', async () => {
    await share(await generatedPdf(row), 'application/pdf', row.document_name);
  });
  // View: a PDF or an image inside the app; any other file (Word, Excel…) opens in an app on the phone
  const viewDocument = (row) => run(row.id, 'view', async () => {
    const uri = await documentFile(row);
    if (row.kind === 'pdf') setPdf({ uri, title: row.name });
    else if (row.kind === 'image') setImage({ uri, title: row.name, ext: row.ext });
    else await share(uri, TYPE_FOR_EXT[row.ext], row.name);
  });
  const downloadDocument = (row) => run(row.id, 'download', async () => {
    await share(await documentFile(row), TYPE_FOR_EXT[row.ext], row.name);
  });

  // View + Download for a document row
  const actions = (id, onView, onDownload) => (
    <>
      <IconBtn Icon={Eye} label="View" onPress={onView} disabled={!!busy} spinning={busy?.id === id && busy.action === 'view'} />
      <View style={{ width: moderateScale(8) }} />
      <IconBtn Icon={Download} label="Download" onPress={onDownload} disabled={!!busy} spinning={busy?.id === id && busy.action === 'download'} />
    </>
  );

  const renderRow = (r, i, list) => {
    const last = i === list.length - 1;
    if (kind === 'assets') {
      const state = ASSET_STATE[Number(r.asset_state) || 1] || ASSET_STATE[1];
      return (
        <Row
          key={r.allocate_pkey} last={last} icon={Package} tint="#2563EB" title={r.asset_name || 'Asset'}
          lines={[
            [r.type, [r.brand, r.model].filter(has).join(' / ')].filter(has).join(' · '),
            has(r.s_no) && `S/N ${r.s_no}`,
            `Allocated ${fmtDate(r.allocated_date)}`,
          ]}
          chip={<Chip label={state.label} fg={state.fg} bg={state.bg} darkFg={state.dark} />}
          onPress={() => setAsset(r)}
        >
          <IconBtn Icon={Eye} label="View asset" onPress={() => setAsset(r)} />
        </Row>
      );
    }
    if (kind === 'generated') {
      return (
        <Row
          key={r.document_pkey} last={last} icon={FilePen} tint="#7C3AED" title={r.document_name}
          lines={[r.doc_id, `Generated ${fmtDate(r.creation_date)}`]}
          onPress={() => viewGenerated(r)} disabled={!!busy}
        >
          {actions(r.document_pkey, () => viewGenerated(r), () => downloadGenerated(r))}
        </Row>
      );
    }
    const isPdf = r.kind === 'pdf';
    const isImage = r.kind === 'image';
    const typeLabel = isPdf ? 'PDF' : isImage ? 'Image' : (r.ext || 'File').toUpperCase();
    return (
      <Row
        key={r.id} last={last} icon={isImage ? FileImage : isPdf ? FileText : FileIcon} tint={isPdf ? '#DC2626' : '#0D9488'} title={r.name}
        lines={[`Allocated ${fmtDate(r.allocated_date)}`]}
        chip={r.available
          ? <Chip label={typeLabel} fg="#475569" bg="#F1F5F9" darkFg="#CBD5E1" />
          : <Chip label="Not available" fg="#92400E" bg="#FFFBEB" darkFg="#FBBF24" />}
        onPress={r.available ? () => viewDocument(r) : undefined} disabled={!!busy}
      >
        {r.available ? actions(r.id, () => viewDocument(r), () => downloadDocument(r)) : null}
      </Row>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {rows === null ? (
        <View style={st.center}><ActivityIndicator size="large" color={COLORS.primaryDeep} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primaryDeep]} tintColor={COLORS.primaryDeep} />}
        >
          {rows.length > 0 ? <Text style={[st.count, { color: theme.textLight }]}>{countLine(kind, rows)}</Text> : null}
          <View style={[st.card, { backgroundColor: theme.card }]}>
            {rows.length === 0 ? (
              <View style={st.empty}>
                <Text style={[st.emptyText, { color: theme.textLight }]}>
                  {failed || EMPTY[kind]}
                </Text>
              </View>
            ) : rows.map(renderRow)}
          </View>
          {kind === 'documents' && rows.some((r) => !r.available) ? (
            <Text style={[st.note, { color: theme.textMuted }]}>Not available: a document moved from the old system that can't be opened here yet.</Text>
          ) : null}
        </ScrollView>
      )}

      <PdfViewerModal
        visible={!!pdf}
        uri={pdf?.uri}
        title={pdf?.title || 'Document'}
        onClose={() => setPdf(null)}
        onShare={() => pdf?.uri && share(pdf.uri, 'application/pdf', pdf.title)}
      />
      <ImageViewer image={image} onClose={() => setImage(null)} onShare={() => image && share(image.uri, TYPE_FOR_EXT[image.ext], image.title)} />
      <AssetDetail asset={asset} onClose={() => setAsset(null)} />
      <CustomAlert config={alertCfg} onClose={() => setAlertCfg(null)} />
    </View>
  );
};

// An image document, full screen on black, with share / save
const ImageViewer = ({ image, onClose, onShare }) => (
  <Modal visible={!!image} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView style={st.imageWrap} edges={['top', 'bottom']}>
      <View style={st.imageHead}>
        <TouchableOpacity onPress={onClose} style={st.imageBtn} accessibilityLabel="Close"><X color="#FFF" size={22} /></TouchableOpacity>
        <Text style={st.imageTitle} numberOfLines={1}>{image?.title}</Text>
        <TouchableOpacity onPress={onShare} style={st.imageBtn} accessibilityLabel="Download"><Download color="#FFF" size={20} /></TouchableOpacity>
      </View>
      {image ? <Image source={{ uri: image.uri }} style={{ flex: 1 }} resizeMode="contain" /> : null}
    </SafeAreaView>
  </Modal>
);

// An asset's details (the web's Asset Details popup), as a bottom sheet: each detail's label above its value so
// long values (specifications, remarks) wrap neatly. Centred at the app's tablet width on a large screen.
const AssetDetail = ({ asset, onClose }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!asset) return null;
  const state = ASSET_STATE[Number(asset.asset_state) || 1] || ASSET_STATE[1];
  const value = has(asset.asset_value) && !Number.isNaN(Number(asset.asset_value))
    ? `₹${Number(asset.asset_value).toLocaleString('en-IN')}` : asset.asset_value;
  // Short details two to a line; long ones on a line of their own
  const pairs = [
    [[Boxes, 'Type', asset.type], [Tag, 'Brand', asset.brand]],
    [[Tag, 'Model', asset.model], [Hash, 'Serial Number', asset.s_no]],
    [[ShieldCheck, 'Warranty', asset.warranty], [IndianRupee, 'Value', value]],
    [[CalendarDays, 'Allocated On', fmtDate(asset.allocated_date)]],
    [[Info, 'Specifications', asset.specifications]],
    [[Info, 'Remarks', asset.description]],
  ];
  const Detail = ([Icon, label, v]) => (
    <View key={label} style={st.detail}>
      <View style={st.detailHead}>
        <Icon color={theme.textMuted} size={13} />
        <Text style={[st.detailLabel, { color: theme.textMuted }]}>{label}</Text>
      </View>
      <Text style={[st.detailValue, { color: has(v) ? theme.text : theme.textMuted }]} selectable>{has(v) ? String(v).trim() : '—'}</Text>
    </View>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[st.sheetOverlay, { backgroundColor: theme.modalOverlay }]}>
        <TouchableOpacity style={{ flex: 1, alignSelf: 'stretch' }} activeOpacity={1} onPress={onClose} />
        <View style={[st.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 12) + moderateScale(8) }]}>
          <View style={[st.grabber, { backgroundColor: theme.border }]} />
          <View style={st.sheetHead}>
            <View style={[st.rowIcon, { backgroundColor: theme.isDark ? '#2563EB26' : '#2563EB14' }]}><Package color="#2563EB" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[st.sheetTitle, { color: theme.text }]} numberOfLines={2}>{asset.asset_name || 'Asset'}</Text>
              <Chip label={state.label} fg={state.fg} bg={state.bg} darkFg={state.dark} />
            </View>
            <TouchableOpacity onPress={onClose} style={[st.iconBtn, { backgroundColor: theme.cardSoft }]} accessibilityLabel="Close">
              <X color={theme.text} size={16} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: moderateScale(440) }} showsVerticalScrollIndicator={false}>
            {pairs.map((pair, i) => (
              <View key={i} style={[st.detailRow, i < pairs.length - 1 && { borderBottomColor: theme.divider, borderBottomWidth: 1 }]}>
                {pair.map(Detail)}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: moderateScale(16), paddingBottom: moderateScale(32) },
  count: { fontSize: moderateScale(12.5), fontWeight: '700', marginBottom: moderateScale(10), marginLeft: 4 },
  card: { borderRadius: moderateScale(20), paddingHorizontal: moderateScale(4), ...SHADOWS.light },
  empty: { padding: moderateScale(28), alignItems: 'center' },
  emptyText: { textAlign: 'center', fontSize: moderateScale(13.5), lineHeight: moderateScale(20) },
  note: { fontSize: moderateScale(11.5), marginTop: moderateScale(10), marginHorizontal: 6, lineHeight: moderateScale(16) },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(14), paddingHorizontal: moderateScale(12) },
  rowIcon: { width: moderateScale(44), height: moderateScale(44), borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(12) },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: moderateScale(14.5), fontWeight: '800', lineHeight: moderateScale(19) },
  rowLine: { fontSize: moderateScale(12.5), fontWeight: '600', marginTop: moderateScale(3) },
  rowEnd: { flexDirection: 'row', alignItems: 'center', marginLeft: moderateScale(10) },
  iconBtn: { width: moderateScale(36), height: moderateScale(36), borderRadius: moderateScale(18), justifyContent: 'center', alignItems: 'center' },
  chip: { alignSelf: 'flex-start', paddingHorizontal: moderateScale(8), paddingVertical: 2, borderRadius: 20, marginTop: moderateScale(6) },
  chipText: { fontSize: moderateScale(10.5), fontWeight: '800' },

  imageWrap: { flex: 1, backgroundColor: '#000' },
  imageHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(12), height: moderateScale(56) },
  imageBtn: { width: moderateScale(40), height: moderateScale(40), justifyContent: 'center', alignItems: 'center' },
  imageTitle: { flex: 1, color: '#FFF', fontSize: moderateScale(15), fontWeight: '700', textAlign: 'center', marginHorizontal: moderateScale(8) },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', maxWidth: LARGE_SCREEN_CAPPED_WIDTH, borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24),
    paddingHorizontal: moderateScale(18), paddingTop: moderateScale(10),
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: moderateScale(12) },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: moderateScale(8) },
  sheetTitle: { fontSize: moderateScale(16), fontWeight: '800', lineHeight: moderateScale(21) },
  detailRow: { flexDirection: 'row', paddingVertical: moderateScale(12) },
  detail: { flex: 1, paddingRight: moderateScale(10) },
  detailHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailLabel: { fontSize: moderateScale(11), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 5 },
  detailValue: { fontSize: moderateScale(14), fontWeight: '700', lineHeight: moderateScale(19) },
});

export default AssetsDocuments;
