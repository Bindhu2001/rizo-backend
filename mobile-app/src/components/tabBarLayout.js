// Size of the bottom tab bar (Home / Requests / Approvals / Profile), from the phone's bottom inset
// (home bar on iPhone, gesture line or the 3-button navigation bar on Android).
//
// The bar used to be `64 + inset` high with the whole inset as bottom padding: on an iPhone (inset ~34)
// that left ~34 px of empty strip under the labels, on top of ~12 px of slack. Icons + labels need
// 52 px (12 top padding + 24 icon + label); the bottom padding now only keeps them clear of the home
// bar (inset minus 12, never below 12). Pure functions so they can be tested.
//
// edited by Bindhu 28-11-2026: Android — the app is drawn edge to edge, under the system navigation bar. With the
// 3-button bar (back / home / recents) the WHOLE inset is covered by the buttons, so "inset minus 12" put the labels
// under them. On Android the labels now sit above the full inset (plus a small gap). iOS is unchanged.
import { Platform } from 'react-native';

export const TAB_BAR_CONTENT_HEIGHT = 52;

export const tabBarBottomPad = (bottomInset, os = Platform.OS) => {
  const inset = bottomInset || 0;
  if (os === 'android') return Math.max(inset + 6, 12);
  return Math.max(inset - 12, 12);
};

export const tabBarHeight = (bottomInset, os = Platform.OS) => TAB_BAR_CONTENT_HEIGHT + tabBarBottomPad(bottomInset, os);
// end
