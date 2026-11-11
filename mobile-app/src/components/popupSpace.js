import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Space for a centred pop-up list. On Android (edge-to-edge) a Modal covers the status bar and the see-through
// navigation bar too, and a percentage maxHeight inside it isn't kept, so a long list ran under the navigation
// bar and showed through it. overlayPad keeps the pop-up between the two bars; maxHeight is a real pixel height
// (the given share of the space between the bars).
export const usePopupSpace = (share = 0.7) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const usable = Math.max(200, height - insets.top - insets.bottom);
  return {
    overlayPad: { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
    maxHeight: Math.round(usable * share),
  };
};
