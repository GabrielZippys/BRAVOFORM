import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Adicionando a configuração para permitir imagens externas
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '**',
      },
    ],
  },
};

export default nextConfig;
