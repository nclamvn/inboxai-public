import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Executive palette
        executive: {
          bg: {
            DEFAULT: '#FFFFFF',
            secondary: '#FAFAFA',
            tertiary: '#F5F5F5',
            inverse: '#1A1A1A',
          },
          text: {
            DEFAULT: '#1A1A1A',
            secondary: '#6B6B6B',
            tertiary: '#9B9B9B',
            inverse: '#FFFFFF',
          },
          border: {
            DEFAULT: '#EBEBEB',
            hover: '#D4D4D4',
            focus: '#1A1A1A',
            subtle: '#F5F5F5',
          },
        },
        // Legacy colors (keep for backward compatibility)
        primary: {
          DEFAULT: '#334155',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        secondary: {
          DEFAULT: '#6366F1',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        accent: {
          DEFAULT: '#10B981',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        priority: {
          urgent: '#DC2626',
          high: '#F59E0B',
          medium: '#6366F1',
          low: '#64748B',
          minimal: '#CBD5E1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em' }],
        'h1': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em' }],
        'h2': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
        'h3': ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        'h4': ['16px', { lineHeight: '24px' }],
        'body': ['15px', { lineHeight: '24px' }],
        'body-sm': ['14px', { lineHeight: '22px' }],
        'caption': ['13px', { lineHeight: '20px' }],
        'tiny': ['12px', { lineHeight: '16px' }],
        'overline': ['11px', { lineHeight: '16px', letterSpacing: '0.08em' }],
      },
      spacing: {
        '18': '72px',
        '22': '88px',
        '26': '104px',
        '30': '120px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgba(0, 0, 0, 0.08)',
        'medium': '0 4px 12px -4px rgba(0, 0, 0, 0.12)',
        'strong': '0 8px 24px -8px rgba(0, 0, 0, 0.16)',
        'executive-sm': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'executive-md': '0 2px 8px rgba(0, 0, 0, 0.06)',
        'executive-lg': '0 4px 16px rgba(0, 0, 0, 0.08)',
        'executive-xl': '0 8px 32px rgba(0, 0, 0, 0.10)',
        'focus-ring': '0 0 0 2px #1A1A1A',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [],
}

export default config
