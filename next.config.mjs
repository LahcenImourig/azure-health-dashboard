/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: [
      '@azure/identity',
      '@azure/arm-advisor',
      '@azure/arm-costmanagement',
      '@azure/arm-resourcehealth',
      '@azure/arm-resourcegraph',
      '@azure/arm-subscriptions',
      '@azure/monitor-query',
    ],
  },
  images: {
    domains: ['avatars.githubusercontent.com', 'lh3.googleusercontent.com'],
  },
};

export default nextConfig;
