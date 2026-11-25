import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, findNodeHandle } from 'react-native';

// A ScrollView that keeps the field being typed in visible when the keyboard opens.
//
// Why: the app's KeyboardSafeView only shrinks the visible area (iPhone: KeyboardAvoidingView padding), it never
// scrolls to the focused field — so on iPhone a field near the bottom of a long form (Leave "Reason") stayed behind
// the keyboard until the user scrolled by hand. Android's own scroll view already does this when the window
// resizes, so there this is only a safety net: when the field is already visible nothing happens.
//
// It scrolls: (1) a moment after the keyboard opens (once the avoiding padding has settled), (2) when focus moves
// to another field while the keyboard stays open (no keyboard event then, so it is looked for every 250 ms while
// the keyboard is up), (3) when the visible height changes or a multiline field grows while typing.
// Used under the name ScrollView — the screens import it in place of react-native's.

const MARGIN = 24; // space kept between the field and the keyboard / the top of the view

/**
 * Where to scroll so a field is fully visible, or null when it already is.
 *   top / bottom: the field's edges in scroll-content coordinates; scrollY: current offset; viewportH: visible height.
 */
export const scrollTargetFor = ({ top, bottom, scrollY, viewportH, margin = MARGIN }) => {
  if (!(viewportH > 0) || !isFinite(top) || !isFinite(bottom)) return null;
  const target = (() => {
    // Taller than the view: show its top, the rest scrolls as the person types
    if (bottom - top > viewportH - 2 * margin) return Math.max(0, top - margin);
    if (top - margin < scrollY) return Math.max(0, top - margin);                       // cut off at the top
    if (bottom + margin > scrollY + viewportH) return Math.max(0, bottom + margin - viewportH); // under the keyboard
    return null;
  })();
  return target === null || Math.abs(target - scrollY) < 1 ? null : target;
};

const KeyboardAwareScrollView = forwardRef(({ onScroll, onLayout, onContentSizeChange, scrollEventThrottle, ...rest }, fwdRef) => {
  const ref = useRef(null);
  const scrollY = useRef(0);
  const viewportH = useRef(0);
  const keyboardUp = useRef(false);
  const lastFocused = useRef(null);
  const showTimers = useRef([]);
  const growTimer = useRef(null);

  // Callers that keep a ref (scrollTo, scrollToEnd...) get the real ScrollView
  useImperativeHandle(fwdRef, () => ref.current, []);

  const reveal = useCallback(() => {
    const sv = ref.current;
    const input = TextInput.State?.currentlyFocusedInput?.();
    const inner = sv?.getInnerViewRef?.();
    const innerHandle = inner ? findNodeHandle(inner) : null;
    if (!sv || !input || !innerHandle) return;
    try {
      // Fails (and is ignored) when the focused field is not inside this scroll view
      input.measureLayout(innerHandle, (_x, y, _w, h) => {
        const target = scrollTargetFor({ top: y, bottom: y + h, scrollY: scrollY.current, viewportH: viewportH.current });
        if (target !== null) sv.scrollTo({ y: target, animated: true });
      }, () => {});
    } catch (_) { /* measuring is best effort */ }
  }, []);

  const clearShowTimers = () => { showTimers.current.forEach(clearTimeout); showTimers.current = []; };
  const revealLater = (delays) => {
    clearShowTimers();
    showTimers.current = delays.map((ms) => setTimeout(reveal, ms));
  };
  const revealSoon = () => {
    if (!keyboardUp.current) return;
    clearTimeout(growTimer.current);
    growTimer.current = setTimeout(reveal, 60);
  };

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboardUp.current = true;
      lastFocused.current = TextInput.State?.currentlyFocusedInput?.() || null;
      const settle = (e?.duration || 250);
      // iPhone: after the avoiding padding has finished animating. Android: after AndroidSafeView's own measuring (<= 700 ms).
      revealLater(ios ? [settle + 80, settle + 400] : [450, 850]);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardUp.current = false;
      lastFocused.current = null;
      clearShowTimers();
    });
    // Focus moved to another field while the keyboard stayed open: no keyboard event, so look for it
    const poll = setInterval(() => {
      if (!keyboardUp.current) return;
      const current = TextInput.State?.currentlyFocusedInput?.() || null;
      if (current && current !== lastFocused.current) {
        lastFocused.current = current;
        revealLater([120, 450]);
      }
    }, 250);
    return () => {
      show.remove(); hide.remove(); clearInterval(poll);
      clearShowTimers(); clearTimeout(growTimer.current);
    };
  }, [reveal]);

  return (
    <ScrollView
      ref={ref}
      {...rest}
      scrollEventThrottle={scrollEventThrottle || 16}
      onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; if (onScroll) onScroll(e); }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (Math.abs(h - viewportH.current) > 1) { viewportH.current = h; revealSoon(); }
        if (onLayout) onLayout(e);
      }}
      onContentSizeChange={(w, h) => { revealSoon(); if (onContentSizeChange) onContentSizeChange(w, h); }}
    />
  );
});

export default KeyboardAwareScrollView;
