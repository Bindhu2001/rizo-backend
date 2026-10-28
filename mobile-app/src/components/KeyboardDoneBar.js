import React, { useEffect, useState } from 'react';
import { InputAccessoryView, Keyboard, Platform, Text, TouchableOpacity, View } from 'react-native';
import { moderateScale } from './Theme';
import { useTheme } from './ThemeContext';

// iPhone number / phone / decimal pads have no Return or Done key, so the keyboard could only be closed by
// tapping outside. A "Done" bar above those keyboards fixes that. Render <KeyboardDoneBar /> once inside a
// screen with such fields and give each field inputAccessoryViewID={doneBarId(keyboardType)}.
// Android keyboards have their own Done / check key, so nothing is added there.

export const DONE_BAR_ID = 'rizoKeyboardDone';
const NUMERIC_PADS = ['number-pad', 'phone-pad', 'decimal-pad', 'numeric'];

/** Value for a TextInput's inputAccessoryViewID — only iPhone, only for keyboards without a Done key. */
export const doneBarId = (keyboardType) => (Platform.OS === 'ios' && NUMERIC_PADS.includes(keyboardType) ? DONE_BAR_ID : undefined);

const KeyboardDoneBar = () => {
  const theme = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={DONE_BAR_ID}>
      <View style={{
        flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: theme.card,
        borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(8),
      }}
      >
        <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Text style={{ color: theme.primaryDeep, fontSize: moderateScale(16), fontWeight: '800' }}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
};

/** True while the keyboard is open — lets a bottom bar drop its home-bar padding (the keyboard covers that area). */
export const useKeyboardVisible = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
};

export default KeyboardDoneBar;
