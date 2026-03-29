import { useEffect, useRef } from 'react'
import { Animated, Platform } from 'react-native'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

export default function AnimatedListItem({ index = 0, children, style }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(10)).current

  useEffect(() => {
    const delay = Math.min(index * 40, 240)
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start()
  }, [index, opacity, translateY])

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  )
}
