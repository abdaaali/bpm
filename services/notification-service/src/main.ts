import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error','warn','log'] });
  // Fail-closed CORS: allowlist from CORS_ORIGINS, never a wildcard (behind gateway).
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(helmet());
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3006;
  await app.listen(port);
  new Logger('Bootstrap').log(`Notification Service running on :${port}`);
}
bootstrap();
