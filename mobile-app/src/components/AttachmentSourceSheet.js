import React from 'react';
import { View, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ImageIcon, FileText, Camera } from 'lucide-react-native';
import { Text } from './AppText';
import { COLORS, moderateScale } from './Theme';
import { useTheme } from './ThemeContext';
import { useFooterPadding } from './KeyboardDoneBar';

// "Add file" chooser: Take Photo (the camera — only where the screen offers it: an expense bill), Photo Library
// (the Photos app) or Choose File (the Files app: PDF / JPG).
const AttachmentSourceSheet = ({ visible, onCamera, onPhotos, onFiles, onClose }) => {
  const theme = useTheme();
  const footerPad = useFooterPadding();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: theme.modalOverlay }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: theme.card, paddingBottom: footerPad }]}>
          <View style={[s.handle, { backgroundColor: theme.border }]} />
          <Text style={[s.title, { color: theme.text }]}>Add file</Text>

          {!!onCamera && (
            <TouchableOpacity style={[s.row, { borderColor: theme.border }]} onPress={onCamera} activeOpacity={0.8} accessibilityLabel="Take Photo">
              <View style={[s.iconWrap, { backgroundColor: '#DCFCE7' }]}><Camera color="#15803D" size={20} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: theme.text }]}>Take Photo</Text>
                <Text style={[s.rowNote, { color: theme.textMuted }]}>Photograph the bill with the camera</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[s.row, { borderColor: theme.border }]} onPress={onPhotos} activeOpacity={0.8} accessibilityLabel="Photo Library">
            <View style={[s.iconWrap, { backgroundColor: '#EDE9FE' }]}><ImageIcon color={COLORS.primaryDeep} size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: theme.text }]}>Photo Library</Text>
              <Text style={[s.rowNote, { color: theme.textMuted }]}>Pick a picture from your Photos</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[s.row, { borderColor: theme.border }]} onPress={onFiles} activeOpacity={0.8} accessibilityLabel="Choose File">
            <View style={[s.iconWrap, { backgroundColor: '#FEE2E2' }]}><FileText color="#DC2626" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: theme.text }]}>Choose File</Text>
              <Text style={[s.rowNote, { color: theme.textMuted }]}>PDF or JPG from your Files</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[s.cancel, { borderColor: theme.border }]} onPress={onClose} activeOpacity={0.8}>
            <Text style={[s.cancelText, { color: theme.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24), paddingHorizontal: moderateScale(20), paddingTop: moderateScale(12) },
  handle: { width: moderateScale(40), height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: moderateScale(16) },
  title: { fontSize: moderateScale(18), fontWeight: '800', marginBottom: moderateScale(14), marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: moderateScale(14), padding: moderateScale(14), marginBottom: moderateScale(10) },
  iconWrap: { width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', marginRight: moderateScale(12) },
  rowTitle: { fontSize: moderateScale(14), fontWeight: '700' },
  rowNote: { fontSize: moderateScale(11), marginTop: 2 },
  cancel: { alignItems: 'center', paddingVertical: moderateScale(14), borderRadius: moderateScale(50), borderWidth: 1, marginTop: moderateScale(4) },
  cancelText: { fontSize: moderateScale(14), fontWeight: '700' },
});

export default AttachmentSourceSheet;
