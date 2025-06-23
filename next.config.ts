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
      // CORREÇÃO: Adicionando o domínio da Microsoft para a logo do OneDrive
      {
        protocol: 'https',
        hostname: 'img-prod-cms-rt-microsoft-com.akamaized.net',
        port: '',
        pathname: '**',
      },
    ],
  },
};

export default nextConfig;
