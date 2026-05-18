import { useContext } from 'react'
import { Platform } from 'react-native'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'

/** Matches FloatingTabBar inner bar height (icon + label). */
export const FLOATING_TAB_HEIGHT = 72

/** Horizontal inset for floating tab bar. */
export const FLOATING_TAB_MARGIN_H = 16

const TAB_BOTTOM_OFFSET = 8

/**
 * Never throws — unlike useBottomTabBarHeight() from React Navigation.
 * Returns 0 on stack screens (Report Viewer, Edit Profile, etc.).
 */
export function useSafeBottomTabBarHeight() {
  const height = useContext(BottomTabBarHeightContext)
  return height ?? 0
}

/**
 * Bottom padding for ScrollView content so the last items clear the floating tab bar.
 * @param {{ bottom?: number }} insets
 * @param {number} tabBarHeight from useSafeBottomTabBarHeight() when inside tab navigator
 */
export function getScrollBottomPadding(insets, tabBarHeight = 0) {
  const bottomInset = Math.max(insets?.bottom ?? 0, Platform.OS === 'web' ? 12 : 8)
  const extraBreathingRoom = 32

  if (tabBarHeight > 0) {
    return tabBarHeight + TAB_BOTTOM_OFFSET + bottomInset + extraBreathingRoom
  }

  return bottomInset + extraBreathingRoom
}

/** Stack screens pushed above tabs — no floating tab bar visible. */
export function getStackScrollBottomPadding(insets) {
  return getScrollBottomPadding(insets, 0)
}
