export const imageRemotePatterns = [
  {
    protocol: 'https',
    hostname: 'assets.coingecko.com',
    pathname: '/coins/images/**',
  },
];

export const imageRemoteHostnames = imageRemotePatterns.map((pattern) => pattern.hostname);
