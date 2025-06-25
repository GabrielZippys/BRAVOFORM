/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      }
    ],
  },
  experimental: {
    css: {
      ignoreGlobal: true
    }
  },

  // ✅ Ignorar erros do ESLint no build (útil em Vercel)
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
