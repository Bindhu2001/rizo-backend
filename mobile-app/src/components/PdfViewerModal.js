import React, { useEffect, useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Share2 } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Text } from './AppText';
import { useTheme } from './ThemeContext';
import { COLORS, moderateScale } from './Theme';

// Shows a PDF that is already saved on the phone (cache folder) inside the app.
// Android's WebView can't open a PDF by itself, so the pages are drawn with pdf.js
// (legacy build — works on older WebViews) on both platforms, so they look the same.
// The file is read as base64 and handed to pdf.js inside the page; pinch to zoom.

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build';

const viewerHtml = (b64, bg) => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>
  html, body { margin: 0; padding: 0; background: ${bg}; }
  #pages { padding: 8px; }
  canvas { display: block; width: 100%; height: auto; margin: 0 auto 10px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
</style>
<script src="${PDFJS}/pdf.min.js"></script>
</head><body>
<div id="pages"></div>
<script>
  function send(type, msg) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, message: msg || '' })); }
  (function () {
    try {
      if (!window.pdfjsLib) { send('error', 'viewer'); return; }
      pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.js';
      var raw = atob('${b64}');
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
        var holder = document.getElementById('pages');
        var width = holder.clientWidth - 16;
        var ratio = Math.min(window.devicePixelRatio || 1, 3) * 1.5; // sharp enough to zoom in
        var chain = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n++) {
          (function (num) {
            chain = chain.then(function () {
              return pdf.getPage(num).then(function (page) {
                var base = page.getViewport({ scale: 1 });
                var vp = page.getViewport({ scale: (width / base.width) * ratio });
                var canvas = document.createElement('canvas');
                canvas.width = Math.floor(vp.width);
                canvas.height = Math.floor(vp.height);
                holder.appendChild(canvas);
                return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
              }).then(function () { if (num === 1) send('loaded'); });
            });
          })(n);
        }
        return chain;
      }).catch(function (e) { send('error', e && e.message); });
    } catch (e) { send('error', e && e.message); }
  })();
</script>
</body></html>`;

const PdfViewerModal = ({ visible, uri, title, onClose, onShare }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [html, setHtml] = useState(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    setRendered(false);
    setFailed(false);
    if (!visible || !uri) return undefined;
    FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      .then((b64) => { if (alive) setHtml(viewerHtml(b64, theme.isDark ? '#0F172A' : '#E5E7EB')); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [visible, uri]);

  const onMessage = (e) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'loaded') setRendered(true);
      if (m.type === 'error') { console.log('pdf viewer error', m.message); setFailed(true); }
    } catch (_) {}
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} style={[styles.iconBtn, { backgroundColor: theme.cardSoft }]} accessibilityLabel="Close">
            <X color={theme.text} size={20} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          {onShare ? (
            <TouchableOpacity onPress={onShare} style={[styles.iconBtn, { backgroundColor: theme.cardSoft }]} accessibilityLabel="Share or save">
              <Share2 color={theme.text} size={18} />
            </TouchableOpacity>
          ) : <View style={styles.iconBtn} />}
        </View>

        <View style={{ flex: 1 }}>
          {html && !failed ? (
            <WebView
              originWhitelist={['*']}
              source={{ html, baseUrl: 'https://cdn.jsdelivr.net/' }}
              onMessage={onMessage}
              onError={() => setFailed(true)}
              javaScriptEnabled
              setBuiltInZoomControls
              setDisplayZoomControls={false}
              style={{ flex: 1, backgroundColor: 'transparent' }}
            />
          ) : null}

          {failed ? (
            <View style={styles.center}>
              <Text style={[styles.msg, { color: theme.text }]}>Could not show the salary slip here.</Text>
              <Text style={[styles.sub, { color: theme.textLight }]}>Please check your connection, or use the share button to open it in another app.</Text>
            </View>
          ) : !rendered ? (
            <View style={[styles.center, StyleSheet.absoluteFill]} pointerEvents="none">
              <ActivityIndicator size="large" color={COLORS.primaryDeep} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: moderateScale(14), height: moderateScale(58), borderBottomWidth: 1 },
  iconBtn: { width: moderateScale(38), height: moderateScale(38), borderRadius: moderateScale(19), justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: moderateScale(16), fontWeight: '800', marginHorizontal: moderateScale(10) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(24) },
  msg: { fontSize: moderateScale(15), fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: moderateScale(12.5), textAlign: 'center', marginTop: 6 },
});

export default PdfViewerModal;
