import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';

// The app's Text and TextInput: React Native's own, with a limit on how far the phone's font size setting can
// enlarge them. Text still grows for people who set a bigger font, up to Android's "Largest" (1.3x); the extra
// accessibility sizes above it (up to 2x on some phones) are held at 1.3x, so rows and cards keep their layout.
// Every screen imports Text / TextInput from here instead of 'react-native' (React 19 no longer applies
// Text.defaultProps, so a one-line global default isn't possible). A screen can still pass its own
// maxFontSizeMultiplier, or allowFontScaling={false}, on a single Text.
export const MAX_FONT_SCALE = 1.3;

export const Text = React.forwardRef((props, ref) => (
  <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} ref={ref} />
));
Text.displayName = 'Text';

export const TextInput = React.forwardRef((props, ref) => (
  <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} ref={ref} />
));
TextInput.displayName = 'TextInput';
