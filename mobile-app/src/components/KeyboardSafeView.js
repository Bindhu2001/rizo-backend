import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StatusBar, View } from 'react-native';

// Keeps a form / chat box above the keyboard.
//  iPhone:  KeyboardAvoidingView with padding.
//  Android: the window may resize, pan, or do nothing depending on the phone and Android version, and padding on
//           top of a resize or pan shifts the screen twice (a big gap that goes away once you type). So instead of
//           guessing, the view measures how far the keyboard actually covers its bottom edge, a moment after the
//           keyboard opens, and adds exactly that much padding — nothing when the window already made room.

const MEASURE_AT = [120, 350, 700]; // the system pans / resizes over several hundred ms; keep measuring until it settles

const AndroidSafeView = ({ style, children }) => {
  const ref = useRef(null);
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    let timers = [];
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      clear();
      timers = MEASURE_AT.map((ms) => setTimeout(() => {
        ref.current?.measureInWindow((_x, y, _w, h) => {
          // measureInWindow leaves out the status bar (it subtracts the visible frame's top), while the keyboard's
          // screenY counts from the very top of the screen — add it back or the padding comes up a status bar short.
          const covered = y + (StatusBar.currentHeight || 0) + h - e.endCoordinates.screenY;
          setOverlap(covered > 2 ? Math.round(covered) : 0);
        });
      }, ms));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { clear(); setOverlap(0); });
    return () => { clear(); show.remove(); hide.remove(); };
  }, []);

  return (
    <View ref={ref} collapsable={false} style={[style, overlap > 0 && { paddingBottom: overlap }]}>
      {children}
    </View>
  );
};

const KeyboardSafeView = ({ style, children, ...rest }) => (
  Platform.OS === 'ios'
    ? <KeyboardAvoidingView behavior="padding" style={style} {...rest}>{children}</KeyboardAvoidingView>
    : <AndroidSafeView style={style}>{children}</AndroidSafeView>
);

export default KeyboardSafeView;
