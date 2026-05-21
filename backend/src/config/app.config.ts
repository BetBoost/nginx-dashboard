import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  url: process.env.APP_URL ?? 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.ADMIN_PASSWORD ?? 'ChangeMeNow!',
  },
}));
