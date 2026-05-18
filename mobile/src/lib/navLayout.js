import { Platform } from 'react-native'

/** Matches RootNavigator floating tab bar height. */
export const FLOATING_TAB_HEIGHT = 64

const TAB_BOTTOM_OFFSET = 8

/**
 * Bottom padding for ScrollView content so the last items clear the floating tab bar.
 * @param {{ bottom?: number }} insets
 * @param {number} tabBarHeight from useBottomTabBarHeight() when inside tab navigator
 */
export function getScrollBottomPadding(insets, tabBarHeight = 0) {
  const bottomInset = Math.max(insets?.bottom ?? 0, Platform.OS === 'web' ? 12 : 8)
  const extraBreathingRoom = 32

  if (tabBarHeight > 0) {
    return tabBarHeight + TAB_BOTTOM_OFFSET + bottomInset + extraBreathingRoom
  }

  return bottomInset + extraBreathingRoom
}
