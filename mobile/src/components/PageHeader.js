import { useCallback, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { theme } from '../lib/theme'

export default function PageHeader({ eyebrow, title, subtitle, right }) {
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

    navigation.navigate('Home', { screen: 'ProfileTab' })
  }

  return (
    <View style={styles.wrap}>
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}

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

      {(!!title || !!subtitle) && (
        <View style={styles.left}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
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
    backgroundColor: '#e8f6f3',
    borderWidth: 1,
    borderColor: '#cfe8e3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 26,
    height: 26,
  },
  brandName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d7e6e2',
    backgroundColor: '#f3faf8',
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
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
  },
  left: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.text,
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
})
