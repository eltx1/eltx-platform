import nodemailer from 'nodemailer';

const REQUIRED_SMTP_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;

type MissingKey = typeof REQUIRED_SMTP_KEYS[number];

function collectMissingEnv(): MissingKey[] {
  return REQUIRED_SMTP_KEYS.filter((key) => !process.env[key]) as MissingKey[];
}

export function createTransporter() {
  const missing = collectMissingEnv();
  if (missing.length) {
    return {
      error: `Missing SMTP config: ${missing.join(', ')}`,
    } as const;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return { transporter } as const;
}

export function getFromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || '';
}
