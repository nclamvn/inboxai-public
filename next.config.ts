import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig, type SentryBuildOptions } from '@sentry/nextjs/config';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  ...(process.env.INBOXAI_E2E_BUILD === '1' ? {
    distDir: '.next-build',
    typescript: { tsconfigPath: 'tsconfig.e2e.json' },
  } : {}),
  // Externalize packages that don't work with bundling
  serverExternalPackages: ['imapflow', 'nodemailer', 'mailparser', 'pino', 'thread-stream', 'onnxruntime-node'],
  outputFileTracingExcludes: { '/api/ask-inbox': ['node_modules/.cache/inboxai-ask-e5/**'] },

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
      'recharts',
      'framer-motion',
    ],
  },
};

// Sentry configuration options
const sentryBuildOptions: SentryBuildOptions = {
  // Organization and project in Sentry
  org: process.env.SENTRY_ORG || 'prismy-b4',
  project: process.env.SENTRY_PROJECT || 'inboxai-web',

  // Auth token for uploading source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppresses source map uploading logs during build
  silent: true,

  // No authenticated upload is available in local/CI fixtures. Avoid generating
  // maps there, and delete SDK-generated maps after an authorized release upload.
  sourcemaps: {
    disable: process.env.NODE_ENV !== 'production' || !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },

  // Widen the upload scope to include more files
  widenClientFileUpload: true,
};

// Apply bundle analyzer, then Sentry
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

export default withSentryConfig(configWithAnalyzer, sentryBuildOptions);
