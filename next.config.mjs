/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
         hostname: 'ui-avatars.com',
             port: '',
        pathname: '/api/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
         hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, // Adicione esta linha
  },
};

export default nextConfig;