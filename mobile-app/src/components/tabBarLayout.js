// Size of the bottom tab bar (Home / Requests / Approvals / Profile), from the phone's bottom inset
// (home bar on iPhone, gesture line on Android phones without a navigation bar).
//
// The bar used to be `64 + inset` high with the whole inset as bottom padding: on an iPhone (inset ~34)
// that left ~34 px of empty strip under the labels, on top of ~12 px of slack. Icons + labels need
// 52 px (12 top padding + 24 icon + label); the bottom padding now only keeps them clear of the home
// bar (inset minus 12, never below 12). Pure functions so they can be tested.

export const TAB_BAR_CONTENT_HEIGHT = 52;

export const tabBarBottomPad = (bottomInset) => Math.max((bottomInset || 0) - 12, 12);

export const tabBarHeight = (bottomInset) => TAB_BAR_CONTENT_HEIGHT + tabBarBottomPad(bottomInset);
