'use client'

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'

export function useHaptic() {
  const trigger = (style: HapticStyle = 'light') => {
    // Check if vibration API is available
    if (typeof navigator === 'undefined' || !navigator.vibrate) return

    const patterns: Record<HapticStyle, number | number[]> = {
      light: 10,
      medium: 20,
      heavy: 30,
      selection: 5,
      success: [10, 50, 10],
      warning: [20, 50, 20],
      error: [30, 50, 30, 50, 30],
    }

    try {
      navigator.vibrate(patterns[style])
    } catch {
      // Silently fail if vibration is not supported
    }
  }

  return { trigger }
}
