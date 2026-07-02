import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS allowlist from ALLOWED_ORIGINS (the contractor portal origin). In
  // production an allowlist is REQUIRED — fail closed if unset; reflect in dev.
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({
    origin: allowed.length ? allowed : (process.env.NODE_ENV === 'production' ? false : true),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-ID'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));

  app.enableShutdownHooks();

  const port = process.env.PORT || 3007;
  await app.listen(port);
  console.log(`External API service running on port ${port}`);
}

bootstrap();
