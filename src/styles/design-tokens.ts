/**
 * INBOXAI DESIGN SYSTEM
 * Apple x Notion Executive Design Language
 *
 * PHILOSOPHY:
 * - Substance over decoration
 * - Typography is UI
 * - Space is luxury
 * - Every pixel matters
 */

export const colors = {
  // === BACKGROUNDS ===
  bg: {
    primary: '#FFFFFF',      // Main background
    secondary: '#FAFAFA',    // Subtle sections
    tertiary: '#F5F5F5',     // Cards, inputs
    inverse: '#1A1A1A',      // Dark backgrounds
  },

  // === TEXT ===
  text: {
    primary: '#1A1A1A',      // Main text
    secondary: '#6B6B6B',    // Supporting text
    tertiary: '#9B9B9B',     // Muted text
    inverse: '#FFFFFF',      // On dark backgrounds
    link: '#1A1A1A',         // Links (underline on hover)
  },

  // === BORDERS ===
  border: {
    default: '#EBEBEB',      // Standard borders
    hover: '#D4D4D4',        // Hover state
    focus: '#1A1A1A',        // Focus state
    subtle: '#F5F5F5',       // Very subtle
  },

  // === INTERACTIVE ===
  interactive: {
    primary: '#1A1A1A',      // Primary buttons
    primaryHover: '#333333', // Primary hover
    secondary: '#F5F5F5',    // Secondary buttons
    secondaryHover: '#EBEBEB',
    ghost: 'transparent',
    ghostHover: '#F5F5F5',
  },

  // === STATUS (Use SPARINGLY) ===
  status: {
    // Only for small badges, indicators
    urgent: {
      bg: '#FEF2F2',
      text: '#DC2626',
      border: '#FECACA',
    },
    warning: {
      bg: '#FFFBEB',
      text: '#B45309',
      border: '#FDE68A',
    },
    success: {
      bg: '#F0FDF4',
      text: '#16A34A',
      border: '#BBF7D0',
    },
    info: {
      bg: '#EFF6FF',
      text: '#2563EB',
      border: '#BFDBFE',
    },
  },

  // === SEMANTIC (Only for icon containers) ===
  semantic: {
    red: { bg: '#FEF2F2', icon: '#DC2626' },
    amber: { bg: '#FFFBEB', icon: '#D97706' },
    emerald: { bg: '#F0FDF4', icon: '#059669' },
    blue: { bg: '#EFF6FF', icon: '#2563EB' },
    violet: { bg: '#F5F3FF', icon: '#7C3AED' },
  },
} as const

export const typography = {
  // === FONT FAMILY ===
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, Menlo, monospace',
  },

  // === FONT SIZES (px / line-height / letter-spacing / weight) ===
  display: {
    fontSize: '48px',
    lineHeight: '56px',
    letterSpacing: '-0.02em',
    fontWeight: 500,
  },
  h1: {
    fontSize: '32px',
    lineHeight: '40px',
    letterSpacing: '-0.01em',
    fontWeight: 500,
  },
  h2: {
    fontSize: '24px',
    lineHeight: '32px',
    letterSpacing: '-0.01em',
    fontWeight: 500,
  },
  h3: {
    fontSize: '18px',
    lineHeight: '26px',
    letterSpacing: '-0.01em',
    fontWeight: 500,
  },
  h4: {
    fontSize: '16px',
    lineHeight: '24px',
    letterSpacing: '0',
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
    letterSpacing: '0',
    fontWeight: 400,
  },
  overline: {
    fontSize: '11px',
    lineHeight: '16px',
    letterSpacing: '0.08em',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
  },
} as const

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
  32: '128px',
} as const

export const radius = {
  none: '0px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  full: '9999px',
} as const

export const shadows = {
  none: 'none',
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 2px 8px rgba(0, 0, 0, 0.06)',
  lg: '0 4px 16px rgba(0, 0, 0, 0.08)',
  xl: '0 8px 32px rgba(0, 0, 0, 0.10)',
  '2xl': '0 16px 64px rgba(0, 0, 0, 0.12)',
  focus: '0 0 0 2px #1A1A1A',
} as const

export const transitions = {
  fast: '100ms ease-out',
  default: '150ms ease-out',
  slow: '200ms ease-out',
  slower: '300ms ease-out',
} as const

export const zIndex = {
  dropdown: 50,
  sticky: 100,
  modal: 200,
  popover: 300,
  toast: 400,
  tooltip: 500,
} as const

// === COMPONENT-SPECIFIC TOKENS ===

export const components = {
  button: {
    height: {
      sm: '32px',
      md: '40px',
      lg: '48px',
    },
    padding: {
      sm: '0 12px',
      md: '0 16px',
      lg: '0 24px',
    },
    fontSize: {
      sm: '13px',
      md: '14px',
      lg: '15px',
    },
    radius: radius.lg,
  },

  input: {
    height: '40px',
    padding: '0 12px',
    fontSize: '15px',
    radius: radius.lg,
    borderColor: colors.border.default,
    focusBorderColor: colors.border.focus,
  },

  card: {
    padding: spacing[6],
    radius: radius.xl,
    borderColor: colors.border.default,
    hoverBorderColor: colors.border.hover,
  },

  modal: {
    radius: radius['2xl'],
    padding: spacing[6],
    maxWidth: '480px',
    backdropColor: 'rgba(0, 0, 0, 0.4)',
  },

  badge: {
    height: '20px',
    padding: '0 8px',
    fontSize: '11px',
    fontWeight: 500,
    radius: radius.sm,
  },

  avatar: {
    sizes: {
      sm: '28px',
      md: '36px',
      lg: '48px',
      xl: '64px',
    },
    radius: radius.full,
    bgColor: colors.bg.tertiary,
    textColor: colors.text.secondary,
  },

  sidebar: {
    width: '240px',
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
    maxWidth: '360px',
  },
} as const
