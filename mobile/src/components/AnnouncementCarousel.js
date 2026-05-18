import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import AnnouncementBanner from './AnnouncementBanner'
import { SkeletonLine } from './ui'
import { useTheme } from '../context/ThemeContext'
import { fetchActiveAnnouncements } from '../lib/announcements'
import { typography } from '../lib/typography'
import { isDarkTheme } from '../lib/themeUi'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const HORIZONTAL_PAD = 16
const CARD_GAP = 12
const AUTO_SCROLL_MS = 5500

export default function AnnouncementCarousel() {
  const { theme, isDark } = useTheme()
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark])
  const scrollRef = useRef(null)
  const autoTimerRef = useRef(null)
  const userInteractingRef = useRef(false)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const fadeAnim = useRef(new Animated.Value(0)).current

  const cardWidth = Math.min(SCREEN_WIDTH - HORIZONTAL_PAD * 2, 420)
  const snapInterval = cardWidth + CARD_GAP

  const loadAnnouncements = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchActiveAnnouncements()
      setAnnouncements(result.announcements)
      setActiveIndex(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadAnnouncements()
    }, [loadAnnouncements])
  )

  useEffect(() => {
    if (!loading && announcements.length > 0) {
      fadeAnim.setValue(0)
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: Platform.OS !== 'web',
      }).start()
    }
  }, [loading, announcements.length, fadeAnim])

  const scrollToIndex = useCallback(
    (index) => {
      if (!scrollRef.current || announcements.length === 0) return
      const clamped = ((index % announcements.length) + announcements.length) % announcements.length
      scrollRef.current.scrollTo({ x: clamped * snapInterval, animated: true })
      setActiveIndex(clamped)
    },
    [announcements.length, snapInterval]
  )

  useEffect(() => {
    if (loading || announcements.length <= 1) return undefined

    autoTimerRef.current = setInterval(() => {
      if (userInteractingRef.current) return
      scrollToIndex(activeIndex + 1)
    }, AUTO_SCROLL_MS)

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    }
  }, [activeIndex, announcements.length, loading, scrollToIndex])

  const onScroll = useCallback(
    (event) => {
      const offsetX = event.nativeEvent.contentOffset.x
      const index = Math.round(offsetX / snapInterval)
      if (index !== activeIndex && index >= 0 && index < announcements.length) {
        setActiveIndex(index)
      }
    },
    [activeIndex, announcements.length, snapInterval]
  )

  const onScrollBeginDrag = useCallback(() => {
    userInteractingRef.current = true
  }, [])

  const onScrollEndDrag = useCallback(() => {
    userInteractingRef.current = false
  }, [])

  const onMomentumScrollEnd = useCallback(
    (event) => {
      userInteractingRef.current = false
      onScroll(event)
    },
    [onScroll]
  )

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Live Updates</Text>
        <View style={styles.skeletonCard}>
          <SkeletonLine width="28%" />
          <SkeletonLine width="72%" />
          <SkeletonLine width="90%" />
        </View>
      </View>
    )
  }

  if (announcements.length === 0) {
    return null
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Live Updates</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>ARISE</Text>
        </View>
      </View>

      <Animated.View style={{ opacity: fadeAnim }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={snapInterval}
          snapToAlignment="start"
          disableIntervalMomentum
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
        >
          {announcements.map((item, index) => (
            <View
              key={item.id}
              style={index < announcements.length - 1 ? styles.cardSpacer : null}
            >
              <AnnouncementBanner item={item} index={index} width={cardWidth} />
            </View>
          ))}
        </ScrollView>

        {announcements.length > 1 ? (
          <View style={styles.dotsRow}>
            {announcements.map((item, index) => (
              <View
                key={`dot-${item.id}`}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  )
}

function createStyles(theme, isDark) {
  const dark = isDarkTheme(theme) || isDark
  return StyleSheet.create({
    section: {
      marginTop: 4,
      marginBottom: 18,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: HORIZONTAL_PAD,
      marginBottom: 10,
    },
    sectionLabel: {
      ...typography.style.extraBold,
      fontSize: 15,
      color: theme.colors.text,
      letterSpacing: 0.2,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: dark ? 'rgba(39, 225, 193, 0.1)' : 'rgba(11, 107, 99, 0.08)',
      borderWidth: 1,
      borderColor: dark ? 'rgba(39, 225, 193, 0.22)' : 'rgba(214, 228, 225, 0.9)',
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.primary,
      ...(Platform.OS === 'web' && dark
        ? { boxShadow: '0px 0px 8px rgba(39, 225, 193, 0.8)' }
        : {}),
    },
    liveText: {
      ...typography.style.bold,
      fontSize: 10,
      color: theme.colors.primary,
      letterSpacing: 0.6,
    },
    scrollContent: {
      paddingHorizontal: HORIZONTAL_PAD,
    },
    cardSpacer: {
      marginRight: CARD_GAP,
    },
    skeletonCard: {
      marginHorizontal: HORIZONTAL_PAD,
      minHeight: 118,
      borderRadius: theme.radius.card,
      padding: 16,
      gap: 10,
      backgroundColor: theme.colors.elevated,
      borderWidth: theme.ui.cardBorderWidth,
      borderColor: theme.colors.borderSubtle,
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(15, 23, 42, 0.15)',
    },
    dotActive: {
      width: 18,
      backgroundColor: theme.colors.primary,
      ...(Platform.OS === 'web' && dark
        ? { boxShadow: '0px 0px 10px rgba(39, 225, 193, 0.5)' }
        : {}),
    },
  })
}
