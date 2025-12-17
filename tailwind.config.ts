import type { Config } from 'tailwindcss';

/**
 * InboxAI Tailwind Configuration
 * Unified with design-tokens.ts
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ========================================
      // COLORS - CSS Variables
      // ========================================
      colors: {
        // Core semantic colors
        background: {
          DEFAULT: 'var(--background)',
          secondary: 'var(--background-secondary)',
          tertiary: 'var(--background-tertiary)',
          elevated: 'var(--background-elevated)',
        },
        foreground: {
          DEFAULT: 'var(--foreground)',
          secondary: 'var(--foreground-secondary)',
          muted: 'var(--foreground-muted)',
          subtle: 'var(--foreground-subtle)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
          subtle: 'var(--border-subtle)',
        },
        // Interactive
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--primary-hover)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
          hover: 'var(--secondary-hover)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        // Card
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        // Input
        input: {
          DEFAULT: 'var(--input)',
          border: 'var(--input-border)',
          focus: 'var(--input-focus)',
        },
        // Muted (legacy support)
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        // Hover
        hover: 'var(--hover)',
        // Status colors
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          bg: 'var(--warning-bg)',
        },
        error: {
          DEFAULT: 'var(--error)',
          bg: 'var(--error-bg)',
        },
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
        },
        // Category colors
        category: {
          work: 'var(--category-work)',
          'work-bg': 'var(--category-work-bg)',
          personal: 'var(--category-personal)',
          'personal-bg': 'var(--category-personal-bg)',
          transaction: 'var(--category-transaction)',
          'transaction-bg': 'var(--category-transaction-bg)',
          newsletter: 'var(--category-newsletter)',
          'newsletter-bg': 'var(--category-newsletter-bg)',
          promotion: 'var(--category-promotion)',
          'promotion-bg': 'var(--category-promotion-bg)',
          social: 'var(--category-social)',
          'social-bg': 'var(--category-social-bg)',
          spam: 'var(--category-spam)',
          'spam-bg': 'var(--category-spam-bg)',
        },
        // Priority (static - same in light/dark)
        priority: {
          urgent: '#DC2626',
          high: '#F59E0B',
          medium: '#6366F1',
          low: '#64748B',
          minimal: '#CBD5E1',
        },
      },

      // ========================================
      // TYPOGRAPHY
      // ========================================
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      fontSize: {
        // Utility scale
        xs: ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        sm: ['13px', { lineHeight: '18px', letterSpacing: '0' }],
        base: ['14px', { lineHeight: '22px', letterSpacing: '-0.01em' }],
        lg: ['16px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
        xl: ['18px', { lineHeight: '26px', letterSpacing: '-0.02em' }],
        '2xl': ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        '3xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '42px', letterSpacing: '-0.02em' }],
        '5xl': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em' }],
        // Semantic scale
        display: ['48px', { lineHeight: '56px', letterSpacing: '-0.02em' }],
        h1: ['32px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
        h2: ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        h3: ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        h4: ['16px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
        body: ['15px', { lineHeight: '24px', letterSpacing: '0' }],
        'body-sm': ['14px', { lineHeight: '22px', letterSpacing: '0' }],
        caption: ['13px', { lineHeight: '20px', letterSpacing: '0' }],
        tiny: ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        overline: ['11px', { lineHeight: '16px', letterSpacing: '0.08em' }],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      // ========================================
      // SPACING
      // ========================================
      spacing: {
        '0.5': '2px',
        '1.5': '6px',
        '2.5': '10px',
        '3.5': '14px',
        '18': '72px',
        '22': '88px',
        '26': '104px',
        '30': '120px',
      },

      // ========================================
      // BORDER RADIUS
      // ========================================
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },

      // ========================================
      // SHADOWS
      // ========================================
      boxShadow: {
        // CSS variable shadows (theme-aware)
        card: 'var(--card-shadow)',
        'card-hover': 'var(--card-shadow-hover)',
        // Static shadows (for specific use cases)
        xs: '0 1px 2px rgba(0, 0, 0, 0.03)',
        soft: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        medium: '0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.03)',
        strong: '0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.03)',
        heavy: '0 20px 25px rgba(0, 0, 0, 0.10), 0 8px 10px rgba(0, 0, 0, 0.04)',
        // Focus states
        'focus-ring': '0 0 0 3px var(--focus-ring)',
        'focus-primary': '0 0 0 3px rgba(17, 24, 39, 0.15)',
        // Inner shadows
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)',
        'inner-strong': 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
      },

      // ========================================
      // Z-INDEX
      // ========================================
      zIndex: {
        dropdown: '50',
        sticky: '100',
        fixed: '150',
        'modal-backdrop': '190',
        modal: '200',
        popover: '300',
        toast: '400',
        tooltip: '500',
        max: '9999',
      },

      // ========================================
      // ANIMATIONS
      // ========================================
      transitionDuration: {
        '0': '0ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '500': '500ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease-out',
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'scale-out': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'fade-out': 'fade-out 150ms ease-out',
        'slide-in-up': 'slide-in-up 200ms ease-out',
        'slide-in-down': 'slide-in-down 200ms ease-out',
        'scale-in': 'scale-in 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'scale-out': 'scale-out 150ms ease-out',
        shimmer: 'shimmer 2s infinite linear',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        spin: 'spin 1s linear infinite',
      },

      // ========================================
      // COMPONENT SIZES
      // ========================================
      width: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },
      height: {
        header: '56px',
      },
      maxWidth: {
        'modal-sm': '400px',
        'modal-md': '480px',
        'modal-lg': '640px',
        'modal-xl': '800px',
        toast: '400px',
      },
      minHeight: {
        'touch-target': '44px',
      },
    },
  },
  plugins: [],
};

export default config;
