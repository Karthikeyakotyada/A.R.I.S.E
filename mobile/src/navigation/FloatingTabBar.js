import { useCallback, useContext, useEffect, useMemo } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import {
  BottomTabBarHeightCallbackContext,
  BottomTabBarHeightContext,
} from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'
import { FLOATING_TAB_HEIGHT, FLOATING_TAB_MARGIN_H } from '../lib/navLayout'
import { getFloatingTabShadow, isDarkTheme } from '../lib/themeUi'

const TAB_HIT_MIN_WIDTH = 56

export default function FloatingTabBar({ state, descriptors, navigation }) {
  const { theme, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark])
  const setTabBarHeight = useContext(BottomTabBarHeightCallbackContext)

  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8)
  const bottomOffset = bottomInset + 8
  const totalBarHeight = FLOATING_TAB_HEIGHT + bottomOffset

  useEffect(() => {
    setTabBarHeight?.(totalBarHeight)
  }, [setTabBarHeight, totalBarHeight])

  const onBarLayout = useCallback(
    (event) => {
      const height = event.nativeEvent.layout.height
      if (height > 0) setTabBarHeight?.(height)
    },
    [setTabBarHeight]
  )

  return (
    <BottomTabBarHeightContext.Provider value={FLOATING_TAB_HEIGHT}>
      <View
        style={[styles.outer, { bottom: bottomOffset }]}
        onLayout={onBarLayout}
        pointerEvents="box-none"
      >
        <View style={styles.barShell}>
          <View style={styles.barSurface}>
            <TabBarGlass isDark={isDark} theme={theme} radius={theme.radius.tab} />
            <View style={styles.tabsRow}>
              {state.routes.map((route, index) => {
                const focused = state.index === index
                const { options } = descriptors[route.key]
                const label =
                  options.tabBarLabel !== undefined
                    ? options.tabBarLabel
                    : options.title !== undefined
                      ? options.title
                      : route.name

                const activeColor = theme.colors.primary
                const inactiveColor = theme.colors.tabInactive
                const color = focused ? activeColor : inactiveColor

                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  })
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params)
                  }
                }

                const onLongPress = () => {
                  navigation.emit({
                    type: 'tabLongPress',
                    target: route.key,
                  })
                }

                const icon =
                  options.tabBarIcon?.({
                    focused,
                    color,
                    size: focused ? 23 : 22,
                  }) ?? null

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="button"
                    accessibilityState={focused ? { selected: true } : {}}
                    accessibilityLabel={options.tabBarAccessibilityLabel}
                    testID={options.tabBarTestID}
                    onPress={onPress}
                    onLongPress={onLongPress}
                    style={({ pressed }) => [
                      styles.tabItem,
                      pressed && styles.tabItemPressed,
                    ]}
                  >
                    <View style={styles.tabColumn}>
                      <View style={styles.iconSlot}>
                        {focused ? <View style={styles.activeIconBackdrop} pointerEvents="none" /> : null}
                        <View style={styles.iconCenter}>{icon}</View>
                      </View>
                      <Text
                        style={[styles.label, focused && styles.labelActive, { color }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        allowFontScaling={false}
                      >
                        {typeof label === 'string' ? label : route.name}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
      </View>
    </BottomTabBarHeightContext.Provider>
  )
}

const WEB_GLASS_DARK =
  Platform.OS === 'web'
    ? { backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }
    : null

const WEB_GLASS_LIGHT =
  Platform.OS === 'web'
    ? { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }
    : null

function TabBarGlass({ isDark, theme, radius }) {
  if (isDark) {
    if (Platform.OS === 'web') {
      return (
        <View
          style={[
            StyleSheet.absoluteFill,
            WEB_GLASS_DARK,
            {
              borderRadius: radius,
              backgroundColor: 'rgba(24, 38, 50, 0.78)',
              borderWidth: 1,
              borderColor: theme.colors.tabBarBorder,
            },
          ]}
        />
      )
    }

    return (
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 56 : 80}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(32, 48, 62, 0.72)', 'rgba(18, 30, 42, 0.92)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: theme.colors.tabBarBorder,
          }}
        />
      </View>
    )
  }

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          WEB_GLASS_LIGHT,
          {
            borderRadius: radius,
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            borderWidth: 1,
            borderColor: theme.colors.tabBarBorder,
          },
        ]}
      />
    )
  }

  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      ) : null}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.96)', 'rgba(243, 248, 247, 0.94)']}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: theme.colors.tabBarBorder,
        }}
      />
    </View>
  )
}

function createStyles(theme, isDark) {
  const dark = isDarkTheme(theme) || isDark
  return StyleSheet.create({
    outer: {
      position: 'absolute',
      left: FLOATING_TAB_MARGIN_H,
      right: FLOATING_TAB_MARGIN_H,
    },
    barShell: {
      borderRadius: theme.radius.tab,
      ...getFloatingTabShadow(theme),
    },
    barSurface: {
      height: FLOATING_TAB_HEIGHT,
      borderRadius: theme.radius.tab,
      overflow: 'hidden',
      position: 'relative',
    },
    tabsRow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      zIndex: 3,
    },
    tabItem: {
      flex: 1,
      minWidth: TAB_HIT_MIN_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      paddingHorizontal: 2,
    },
    tabItemPressed: {
      opacity: 0.9,
    },
    activeIconBackdrop: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: dark ? 'rgba(39, 225, 193, 0.12)' : 'rgba(11, 107, 99, 0.08)',
      ...(Platform.OS === 'web'
        ? { boxShadow: 'inset 0 0 0 1px rgba(39, 225, 193, 0.08)' }
        : {
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: dark ? 0.16 : 0.08,
            shadowRadius: 6,
            elevation: 1,
          }),
    },
    iconCenter: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
    },
    tabColumn: {
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      paddingTop: 7,
      paddingBottom: 6,
      gap: 2,
    },
    iconSlot: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    label: {
      ...typography.style.semiBold,
      fontSize: 10,
      lineHeight: 12,
      letterSpacing: 0.15,
      textAlign: 'center',
      width: '100%',
      flexShrink: 1,
      ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
    },
    labelActive: {
      ...typography.style.bold,
    },
  })
}
