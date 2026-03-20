import { StyleSheet, Text, View } from 'react-native'

export default function MedicalDisclaimer() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Medical Disclaimer</Text>
      <Text style={styles.text}>
        This analysis is AI-generated and not a medical diagnosis. Please consult a qualified doctor.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  title: {
    color: '#92400e',
    fontWeight: '800',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  text: {
    color: '#78350f',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
})