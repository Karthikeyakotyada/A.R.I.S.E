import { Text } from 'react-native'
import { Card, Heading, PrimaryButton, Screen, Subtle } from '../components/ui'
import PageHeader from '../components/PageHeader'

export default function HealthScreen({ navigation }) {
  return (
    <Screen>
      <PageHeader
        eyebrow="Health"
        title="Wellness Logs"
        subtitle="Track your vitals and symptoms over time with quick entries."
      />

      <Card>
        <Heading>Health Logs</Heading>
        <Subtle>Record heart rate, blood pressure, blood sugar, temperature, and symptoms.</Subtle>
        <PrimaryButton title="Open Health Logs" onPress={() => navigation.navigate('HealthLogs')} />
      </Card>
    </Screen>
  )
}
