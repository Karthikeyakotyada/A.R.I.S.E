import { Component } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ARISE] Unhandled render error:', error)
    console.error('[ARISE] Component stack:', errorInfo?.componentStack || 'N/A')
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app recovered from an unexpected error.
          </Text>
          <Text style={styles.errorText} numberOfLines={3}>
            {this.state.error?.message || 'Unknown application error'}
          </Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#475569',
    fontSize: 14,
  },
  errorText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
  },
  button: {
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    minWidth: 128,
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
})