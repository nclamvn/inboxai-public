import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';

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

export default withBundleAnalyzer(nextConfig);
