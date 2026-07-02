import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error','warn','log'] });
  // Fail-closed CORS: allowlist from CORS_ORIGINS, never a wildcard. Alarm
  // webhooks are server-to-server (no Origin header), so this doesn't affect them.
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(helmet());
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3005;
  await app.listen(port);
  new Logger('Bootstrap').log(`Integration Hub running on :${port}`);
}
bootstrap();
