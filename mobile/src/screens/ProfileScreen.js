import { Text, View } from 'react-native'
import { Card, Heading, PrimaryButton, Screen, Subtle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/PageHeader'

export default function ProfileScreen() {
  const { user, signOut } = useAuth()
  const { showConfirm } = useDialog()
  const { showToast } = useToast()

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleSignOut() {
    await signOut()
    showToast('Signed out successfully.', 'success')
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Manage account details and session controls."
      />

      <Card>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1d4ed8',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{initials}</Text>
        </View>

        <Text style={{ fontWeight: '800', fontSize: 18, color: '#0f172a' }}>{displayName}</Text>
        <Subtle>{user?.email}</Subtle>
      </Card>

      <Card>
        <Subtle>Plan: Free</Subtle>
        <Subtle>Status: Active</Subtle>
      </Card>

      <PrimaryButton
        title="Sign Out"
        onPress={async () => {
          const ok = await showConfirm({
            title: 'Sign Out',
            message: 'Do you want to sign out?',
            tone: 'warning',
            confirmLabel: 'Sign out',
            cancelLabel: 'Cancel',
          })
          if (ok) await handleSignOut()
        }}
      />
    </Screen>
  )
}
