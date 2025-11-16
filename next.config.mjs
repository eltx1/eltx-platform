// IMPORTANT: Env is loaded from /home/dash/.env via dotenv. Do NOT enable 'export' or 'standalone', and do NOT modify scripts to remove '-r dotenv/config'.
import dotenv from 'dotenv';
dotenv.config({ path: '/home/dash/.env' });

const REQUIRED_ENV_KEYS = [
  'DB_HOST',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'NEXT_PUBLIC_API_BASE',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
];

const missingEnv = REQUIRED_ENV_KEYS.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.warn('[ENV] Missing keys:', missingEnv.join(', '));
}

const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
