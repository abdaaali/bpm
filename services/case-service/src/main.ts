import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error','warn','log'] });
  app.use(helmet());
  // Fail-closed CORS: allowlist from CORS_ORIGINS (comma-separated), never a
  // wildcard. Empty → no cross-origin (this service sits behind the gateway).
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3004;
  await app.listen(port);
  new Logger('Bootstrap').log(`Case Service running on :${port}`);
}
bootstrap();
