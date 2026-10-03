import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
// Vercel's preview toolbar (comments, feedback) only runs on preview deployments.
const preview = process.env.VERCEL_ENV === 'preview';
const live = preview ? ' https://vercel.live' : '';

// Every SSG page inlines its own RSC payload scripts, so hashes would differ per page, and nonces would force
// dynamic rendering: 'unsafe-inline' is the deliberate trade-off for a fully static site with no user HTML.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}${live}`,
  `style-src 'self' 'unsafe-inline'${live}`,
  // Covers come from Spotify's CDN; data: is the grain SVG in shell.css.
  `img-src 'self' data: blob: https://i.scdn.co${preview ? ' https://vercel.live https://vercel.com' : ''}`,
  `font-src 'self'${preview ? ' https://vercel.live https://assets.vercel.com' : ''}`,
  `connect-src 'self'${dev ? ' ws:' : ''}${preview ? ' https://vercel.live wss://ws-us3.pusher.com' : ''}`,
  // webgl.ts warms up WebGL in a Blob worker.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // 'self', not 'none': the e2e suite runs the core flow in a same-origin sandboxed iframe.
  "frame-ancestors 'self'",
  `frame-src ${preview ? 'https://vercel.live' : "'none'"}`,
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // No includeSubDomains/preload: owner decision.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // clipboard-write stays allowed (CopyLinkButton), motion sensors are untouched; bluetooth is left out (Chrome warns).
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=(), browsing-topics=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  // No next/image anywhere: this drops the otherwise reachable (and billable) /_next/image optimizer.
  images: { unoptimized: true },
  // Playwright's dev mode (E2E_DEV=1) opens 127.0.0.1; without this, next dev blocks its scripts and pages never hydrate.
  allowedDevOrigins: ['127.0.0.1'],
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
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
          // Only this site's pages load /data (OG images point at i.scdn.co): blocks hotlinking the atlases.
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
