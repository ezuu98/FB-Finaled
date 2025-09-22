/** @type {import('next').NextConfig} */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  async rewrites() {
    const base = API_BASE.replace(/\/$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${base}/:path*`,
      },
    ];
  },
};

export default nextConfig
