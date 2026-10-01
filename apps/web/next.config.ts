import type { NextConfig } from 'next';

/**
 * Static export: the whole app is client-rendered and served as files (Render Static Site now,
 * S3 + CloudFront later). The API is the only dynamic origin.
 */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  transpilePackages: ['@hbe/shared'],
};
export default config;
