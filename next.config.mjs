/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuração para permitir imagens de domínios externos
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
      // CORREÇÃO: Adicionando o domínio 'placehold.co' à lista de permissões
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;

