'use client'

import { useEffect } from 'react'
import type { Capacitor, PluginListenerHandle } from '@capacitor/core'
import { useTheme } from '@/contexts/theme-context'

function nativeBridge() {
  return (window as Window & { Capacitor?: typeof Capacitor }).Capacitor
}

export function CapacitorInit() {
  const { isDark, mounted } = useTheme()

  useEffect(() => {
    const bridge = nativeBridge()
    if (!bridge?.isNativePlatform()) return
    let active = true
    let backListener: PluginListenerHandle | undefined
    const frame = requestAnimationFrame(() => {
      void import('@capacitor/splash-screen').then(({ SplashScreen }) => {
        if (active) return SplashScreen.hide({ fadeOutDuration: 0 })
      }).catch(console.warn)
    })
    if (bridge.getPlatform() === 'ios') {
      void import('@capacitor/keyboard').then(({ Keyboard, KeyboardResize }) => {
        if (active) return Keyboard.setResizeMode({ mode: KeyboardResize.Native })
      }).catch(console.warn)
    }
    if (bridge.getPlatform() === 'android') {
      void import('@/lib/capacitor/android-back-button').then(async ({ setupAndroidBackButton }) => {
        if (!active) return
        const listener = await setupAndroidBackButton()
        if (active) backListener = listener
        else await listener?.remove()
      }).catch(console.warn)
    }
    return () => {
      active = false
      cancelAnimationFrame(frame)
      void backListener?.remove().catch(console.warn)
    }
  }, [])

  useEffect(() => {
    const bridge = nativeBridge()
    if (!mounted || !bridge?.isNativePlatform()) return
    let active = true
    void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      if (active) return StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    }).catch(console.warn)
    if (bridge.getPlatform() === 'ios') {
      void import('@capacitor/keyboard').then(({ Keyboard, KeyboardStyle }) => {
        if (active) return Keyboard.setStyle({ style: isDark ? KeyboardStyle.Dark : KeyboardStyle.Light })
      }).catch(console.warn)
    }
    return () => { active = false }
  }, [isDark, mounted])

  return null
}
