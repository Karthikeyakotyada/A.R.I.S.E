import * as Network from 'expo-network'

export async function isDeviceOnline() {
  try {
    const state = await Network.getNetworkStateAsync()
    if (!state.isConnected) return false
    if (state.isInternetReachable === false) return false
    return true
  } catch {
    // Do not block user actions when connectivity probe fails.
    return true
  }
}

export function isLikelyNetworkError(errorMessage = '') {
  return /network request failed|failed to fetch|offline|timeout|timed out|aborted/i.test(errorMessage)
}

export function toFriendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.message || String(error || '')
  if (isLikelyNetworkError(message)) {
    return "You're offline or connection is unstable"
  }
  return message || fallback
}