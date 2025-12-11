import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize packages that don't work with bundling
  serverExternalPackages: ['imapflow', 'nodemailer', 'mailparser', 'pino', 'thread-stream'],

  // Empty turbopack config to silence the warning
  turbopack: {},
};

export default nextConfig;
