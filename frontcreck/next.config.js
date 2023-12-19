/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy:
      "default-src 'self' https://lastfm.freetls.fastly.net; script-src 'none'; sandbox;",
  },
};

module.exports = nextConfig;
