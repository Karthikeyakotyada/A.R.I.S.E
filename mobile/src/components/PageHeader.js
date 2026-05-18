import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { useTheme } from '../context/ThemeContext'
import { typography } from '../lib/typography'

export default function PageHeader({ eyebrow, title, subtitle, right, showTopBar = true }) {
  const { theme } = useTheme()
  const styles = useMemo(() => createStyles(theme), [theme])
  const navigation = useNavigation()
  const { user } = useAuth()
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(null)
  const [avatarLoaded, setAvatarLoaded] = useState(false)

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((part) => part?.[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'
  const avatarUrl = avatarLoaded
    ? (profileAvatarUrl || null)
    : (user?.user_metadata?.avatar_url || null)

  const loadAvatarFromProfile = useCallback(async () => {
    if (!user?.id) {
      setAvatarLoaded(true)
      setProfileAvatarUrl(null)
      return
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      setProfileAvatarUrl(data?.avatar_url || null)
    } catch {
      // Keep metadata fallback on transient failures.
    } finally {
      setAvatarLoaded(true)
    }
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      loadAvatarFromProfile()
    }, [loadAvatarFromProfile])
  )

  const goToProfile = () => {
    try {
      const parent = navigation.getParent()
      const parentRoutes = parent?.getState?.()?.routeNames || []
      const currentRoutes = navigation.getState?.()?.routeNames || []

      if (parent && parentRoutes.includes('ProfileTab')) {
        parent.navigate('ProfileTab')
        return
      }

      if (currentRoutes.includes('ProfileTab')) {
        navigation.navigate('ProfileTab')
        return
      }

      if (currentRoutes.includes('Home')) {
        navigation.navigate('Home', { screen: 'ProfileTab' })
        return
      }

      if (parent && parentRoutes.includes('Home')) {
        parent.navigate('Home', { screen: 'ProfileTab' })
        return
      }

      console.error('[ARISE] Unable to find ProfileTab route from PageHeader')
    } catch (error) {
      console.error('[ARISE] Profile navigation failed:', error)
    }
  }

  return (
    <View style={styles.wrap}>
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}

      {showTopBar && (
        <View style={styles.topRow}>
          <View style={styles.brandingLeft}>
            <View style={styles.logoWrap}>
              <Image source={require('../../assets/app-logo.png')} style={styles.logoImage} />
            </View>
            <View>
              <Text style={styles.brandName}>ARISE</Text>
              <Text style={styles.brandSubtitle}>Health Companion</Text>
            </View>
          </View>

          {right || (
            <Pressable style={({ pressed }) => [styles.avatarWrap, pressed && styles.avatarPressed]} onPress={goToProfile}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </Pressable>
          )}
        </View>
      )}

      {(!!title || !!subtitle) && (
        <View style={styles.left}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
    </View>
  )
}

function createStyles(theme) {
  return StyleSheet.create({
    wrap: {
      gap: 8,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    brandingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: theme.colors.logoBg,
      borderWidth: 1,
      borderColor: theme.colors.logoBorder,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImage: {
      width: 26,
      height: 26,
    },
    brandName: {
      color: theme.colors.text,
      fontSize: 15,
      ...typography.style.extraBold,
      letterSpacing: 0.2,
    },
    brandSubtitle: {
      color: theme.colors.muted,
      fontSize: 12,
      ...typography.style.semiBold,
    },
    avatarWrap: {
      width: 42,
      height: 42,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.soft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarPressed: {
      opacity: 0.84,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      color: theme.colors.primary,
      fontSize: 14,
      ...typography.style.extraBold,
    },
    left: {
      flex: 1,
      gap: 3,
    },
    eyebrow: {
      color: theme.colors.primary,
      fontSize: 11,
      ...typography.style.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    title: {
      fontSize: 28,
      ...typography.style.extraBold,
      color: theme.colors.text,
    },
    subtitle: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 21,
    },
  })
}
