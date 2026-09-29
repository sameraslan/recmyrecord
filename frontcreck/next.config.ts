import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  async redirects() {
    return [
      { source: '/recommend', destination: '/', permanent: true },
      { source: '/recommend/album', destination: '/', permanent: true },
      { source: '/recommend/album/:path*', destination: '/', permanent: true },
      { source: '/insights', destination: '/', permanent: true },
      { source: '/insights/:path*', destination: '/', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/data/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

export default nextConfig;
