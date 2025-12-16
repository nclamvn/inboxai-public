import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Externalize packages that don't work with bundling
  serverExternalPackages: ['imapflow', 'nodemailer', 'mailparser', 'pino', 'thread-stream'],

  // Empty turbopack config to silence the warning
  turbopack: {},

  // Remove console.logs in production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Optimize imports - helps with tree-shaking
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

  // Experimental optimizations
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
      'recharts',
      'framer-motion',
    ],
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Organization and project in Sentry
  org: process.env.SENTRY_ORG || 'prismy-b4',
  project: process.env.SENTRY_PROJECT || 'inboxai-web',

  // Auth token for uploading source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppresses source map uploading logs during build
  silent: true,

  // Hide source maps from being served to the client
  hideSourceMaps: true,

  // Widen the upload scope to include more files
  widenClientFileUpload: true,

  // Disable source map uploading in development
  disableServerWebpackPlugin: process.env.NODE_ENV !== 'production',
  disableClientWebpackPlugin: process.env.NODE_ENV !== 'production',
};

// Apply bundle analyzer, then Sentry
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

export default withSentryConfig(configWithAnalyzer, sentryWebpackPluginOptions);
