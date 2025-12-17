/**
 * INBOXAI DESIGN SYSTEM v2.0
 * Unified Design Tokens with Light/Dark Mode Support
 *
 * PHILOSOPHY:
 * - Substance over decoration
 * - Typography is UI
 * - Space is luxury
 * - Every pixel matters
 * - Seamless light/dark mode
 */

// ============================================
// COLOR TOKENS
// ============================================

export const lightColors = {
  // === BACKGROUNDS ===
  bg: {
    primary: '#FFFFFF',
    secondary: '#FAFBFC',
    tertiary: '#F5F5F5',
    elevated: '#FFFFFF',
    inverse: '#1A1A1A',
    overlay: 'rgba(0, 0, 0, 0.4)',
  },

  // === TEXT ===
  text: {
    primary: '#111827',
    secondary: '#374151',
    tertiary: '#6B7280',
    muted: '#9CA3AF',
    inverse: '#FFFFFF',
    link: '#2563EB',
  },

  // === BORDERS ===
  border: {
    default: '#E5E7EB',
    strong: '#D1D5DB',
    subtle: '#F3F4F6',
    focus: '#111827',
  },

  // === INTERACTIVE ===
  interactive: {
    primary: '#111827',
    primaryHover: '#1F2937',
    secondary: '#F3F4F6',
    secondaryHover: '#E5E7EB',
    ghost: 'transparent',
    ghostHover: '#F5F5F5',
  },

  // === STATUS ===
  status: {
    success: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
    warning: { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
    error: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    info: { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  },

  // === CATEGORY ===
  category: {
    work: { bg: '#DBEAFE', text: '#2563EB' },
    personal: { bg: '#EDE9FE', text: '#7C3AED' },
    transaction: { bg: '#D1FAE5', text: '#059669' },
    newsletter: { bg: '#F3F4F6', text: '#6B7280' },
    promotion: { bg: '#FFEDD5', text: '#EA580C' },
    social: { bg: '#CFFAFE', text: '#0891B2' },
    spam: { bg: '#FEE2E2', text: '#DC2626' },
  },

  // === SEMANTIC ===
  semantic: {
    red: { bg: '#FEF2F2', icon: '#DC2626' },
    amber: { bg: '#FFFBEB', icon: '#D97706' },
    emerald: { bg: '#ECFDF5', icon: '#059669' },
    blue: { bg: '#EFF6FF', icon: '#2563EB' },
    violet: { bg: '#F5F3FF', icon: '#7C3AED' },
    cyan: { bg: '#ECFEFF', icon: '#0891B2' },
  },
} as const;

export const darkColors = {
  // === BACKGROUNDS ===
  bg: {
    primary: '#0F0F0F',
    secondary: '#171717',
    tertiary: '#1F1F1F',
    elevated: '#171717',
    inverse: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },

  // === TEXT ===
  text: {
    primary: '#F9FAFB',
    secondary: '#E5E7EB',
    tertiary: '#9CA3AF',
    muted: '#6B7280',
    inverse: '#111827',
    link: '#60A5FA',
  },

  // === BORDERS ===
  border: {
    default: '#262626',
    strong: '#404040',
    subtle: '#1A1A1A',
    focus: '#FFFFFF',
  },

  // === INTERACTIVE ===
  interactive: {
    primary: '#FFFFFF',
    primaryHover: '#F3F4F6',
    secondary: '#1F1F1F',
    secondaryHover: '#292929',
    ghost: 'transparent',
    ghostHover: '#1F1F1F',
  },

  // === STATUS ===
  status: {
    success: { bg: 'rgba(5, 150, 105, 0.15)', text: '#34D399', border: 'rgba(5, 150, 105, 0.3)' },
    warning: { bg: 'rgba(217, 119, 6, 0.15)', text: '#FBBF24', border: 'rgba(217, 119, 6, 0.3)' },
    error: { bg: 'rgba(220, 38, 38, 0.15)', text: '#F87171', border: 'rgba(220, 38, 38, 0.3)' },
    info: { bg: 'rgba(37, 99, 235, 0.15)', text: '#60A5FA', border: 'rgba(37, 99, 235, 0.3)' },
  },

  // === CATEGORY ===
  category: {
    work: { bg: 'rgba(37, 99, 235, 0.2)', text: '#60A5FA' },
    personal: { bg: 'rgba(124, 58, 237, 0.2)', text: '#A78BFA' },
    transaction: { bg: 'rgba(5, 150, 105, 0.2)', text: '#34D399' },
    newsletter: { bg: 'rgba(107, 114, 128, 0.2)', text: '#9CA3AF' },
    promotion: { bg: 'rgba(234, 88, 12, 0.2)', text: '#FB923C' },
    social: { bg: 'rgba(8, 145, 178, 0.2)', text: '#22D3EE' },
    spam: { bg: 'rgba(220, 38, 38, 0.2)', text: '#F87171' },
  },

  // === SEMANTIC ===
  semantic: {
    red: { bg: 'rgba(220, 38, 38, 0.15)', icon: '#F87171' },
    amber: { bg: 'rgba(217, 119, 6, 0.15)', icon: '#FBBF24' },
    emerald: { bg: 'rgba(5, 150, 105, 0.15)', icon: '#34D399' },
    blue: { bg: 'rgba(37, 99, 235, 0.15)', icon: '#60A5FA' },
    violet: { bg: 'rgba(124, 58, 237, 0.15)', icon: '#A78BFA' },
    cyan: { bg: 'rgba(8, 145, 178, 0.15)', icon: '#22D3EE' },
  },
} as const;

// Legacy export for backwards compatibility
export const colors = lightColors;

// ============================================
// TYPOGRAPHY TOKENS
// ============================================

export const typography = {
  // === FONT FAMILY ===
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    mono: 'JetBrains Mono, Menlo, Monaco, monospace',
  },

  // === FONT WEIGHTS ===
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // === TYPE SCALE ===
  display: {
    fontSize: '48px',
    lineHeight: '56px',
    letterSpacing: '-0.02em',
    fontWeight: 600,
  },
  h1: {
    fontSize: '32px',
    lineHeight: '40px',
    letterSpacing: '-0.02em',
    fontWeight: 600,
  },
  h2: {
    fontSize: '24px',
    lineHeight: '32px',
    letterSpacing: '-0.02em',
    fontWeight: 600,
  },
  h3: {
    fontSize: '18px',
    lineHeight: '26px',
    letterSpacing: '-0.01em',
    fontWeight: 600,
  },
  h4: {
    fontSize: '16px',
    lineHeight: '24px',
    letterSpacing: '-0.01em',
    fontWeight: 500,
  },
  body: {
    fontSize: '15px',
    lineHeight: '24px',
    letterSpacing: '0',
    fontWeight: 400,
  },
  bodySmall: {
    fontSize: '14px',
    lineHeight: '22px',
    letterSpacing: '0',
    fontWeight: 400,
  },
  caption: {
    fontSize: '13px',
    lineHeight: '20px',
    letterSpacing: '0',
    fontWeight: 400,
  },
  tiny: {
    fontSize: '12px',
    lineHeight: '16px',
    letterSpacing: '0.01em',
    fontWeight: 400,
  },
  overline: {
    fontSize: '11px',
    lineHeight: '16px',
    letterSpacing: '0.08em',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
  },
} as const;

// ============================================
// SPACING TOKENS
// ============================================

export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
} as const;

// ============================================
// RADIUS TOKENS
// ============================================

export const radius = {
  none: '0px',
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '20px',
  '4xl': '24px',
  full: '9999px',
} as const;

// ============================================
// SHADOW TOKENS
// ============================================

export const shadows = {
  light: {
    none: 'none',
    xs: '0 1px 2px rgba(0, 0, 0, 0.03)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.03)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.03)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.10), 0 8px 10px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px rgba(0, 0, 0, 0.15)',
    inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
    focus: '0 0 0 3px rgba(17, 24, 39, 0.15)',
    focusRing: '0 0 0 2px #FFFFFF, 0 0 0 4px #111827',
  },
  dark: {
    none: 'none',
    xs: '0 1px 2px rgba(0, 0, 0, 0.2)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
    md: '0 4px 6px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.4), 0 4px 6px rgba(0, 0, 0, 0.2)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.45), 0 8px 10px rgba(0, 0, 0, 0.25)',
    '2xl': '0 25px 50px rgba(0, 0, 0, 0.5)',
    inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
    focus: '0 0 0 3px rgba(255, 255, 255, 0.15)',
    focusRing: '0 0 0 2px #0F0F0F, 0 0 0 4px #FFFFFF',
  },
} as const;

// ============================================
// ANIMATION TOKENS
// ============================================

export const animations = {
  // === DURATIONS ===
  duration: {
    instant: '0ms',
    fast: '100ms',
    normal: '150ms',
    slow: '200ms',
    slower: '300ms',
    slowest: '500ms',
  },

  // === EASINGS ===
  easing: {
    default: 'ease-out',
    linear: 'linear',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // === PRESETS ===
  presets: {
    fade: '150ms ease-out',
    scale: '200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    slide: '200ms ease-out',
    bounce: '300ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// Legacy export
export const transitions = {
  fast: animations.presets.fade,
  default: '150ms ease-out',
  slow: '200ms ease-out',
  slower: '300ms ease-out',
} as const;

// ============================================
// Z-INDEX TOKENS
// ============================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 50,
  sticky: 100,
  fixed: 150,
  modalBackdrop: 190,
  modal: 200,
  popover: 300,
  toast: 400,
  tooltip: 500,
  max: 9999,
} as const;

// ============================================
// BREAKPOINTS
// ============================================

export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================
// COMPONENT TOKENS
// ============================================

export const components = {
  button: {
    height: {
      xs: '28px',
      sm: '32px',
      md: '40px',
      lg: '48px',
      xl: '56px',
    },
    padding: {
      xs: '0 8px',
      sm: '0 12px',
      md: '0 16px',
      lg: '0 24px',
      xl: '0 32px',
    },
    fontSize: {
      xs: '12px',
      sm: '13px',
      md: '14px',
      lg: '15px',
      xl: '16px',
    },
    radius: radius.lg,
  },

  input: {
    height: {
      sm: '32px',
      md: '40px',
      lg: '48px',
    },
    padding: '0 12px',
    fontSize: '15px',
    radius: radius.lg,
  },

  card: {
    padding: {
      sm: spacing[4],
      md: spacing[6],
      lg: spacing[8],
    },
    radius: radius.xl,
  },

  modal: {
    radius: radius['2xl'],
    padding: spacing[6],
    maxWidth: {
      sm: '400px',
      md: '480px',
      lg: '640px',
      xl: '800px',
    },
  },

  badge: {
    height: {
      sm: '18px',
      md: '22px',
      lg: '26px',
    },
    padding: '0 8px',
    fontSize: '11px',
    fontWeight: 500,
    radius: radius.sm,
  },

  avatar: {
    sizes: {
      xs: '24px',
      sm: '32px',
      md: '40px',
      lg: '48px',
      xl: '64px',
      '2xl': '80px',
    },
    radius: radius.full,
  },

  sidebar: {
    width: '240px',
    collapsedWidth: '64px',
    itemHeight: '40px',
    itemPadding: '0 12px',
    itemRadius: radius.lg,
  },

  header: {
    height: '56px',
  },

  toast: {
    radius: radius.xl,
    padding: spacing[4],
    maxWidth: '400px',
  },

  tooltip: {
    radius: radius.md,
    padding: `${spacing[1.5]} ${spacing[3]}`,
    fontSize: '13px',
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

export const getColors = (isDark: boolean) => (isDark ? darkColors : lightColors);
export const getShadows = (isDark: boolean) => (isDark ? shadows.dark : shadows.light);

// ============================================
// CSS VARIABLE GENERATOR
// ============================================

export const generateCSSVariables = (isDark: boolean) => {
  const c = getColors(isDark);
  const s = getShadows(isDark);

  return {
    '--background': c.bg.primary,
    '--background-secondary': c.bg.secondary,
    '--background-tertiary': c.bg.tertiary,
    '--background-elevated': c.bg.elevated,
    '--foreground': c.text.primary,
    '--foreground-secondary': c.text.secondary,
    '--foreground-muted': c.text.tertiary,
    '--foreground-subtle': c.text.muted,
    '--border': c.border.default,
    '--border-strong': c.border.strong,
    '--border-subtle': c.border.subtle,
    '--primary': c.interactive.primary,
    '--primary-foreground': c.text.inverse,
    '--primary-hover': c.interactive.primaryHover,
    '--secondary': c.interactive.secondary,
    '--secondary-foreground': c.text.primary,
    '--secondary-hover': c.interactive.secondaryHover,
    '--shadow-sm': s.sm,
    '--shadow-md': s.md,
    '--shadow-lg': s.lg,
  };
};
