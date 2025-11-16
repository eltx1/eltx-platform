// IMPORTANT: Env is loaded from /home/dash/.env via dotenv. Do NOT enable 'export' or 'standalone', and do NOT modify scripts to remove '-r dotenv/config'.
import dotenv from 'dotenv';
dotenv.config({ path: '/home/dash/.env' });

const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
