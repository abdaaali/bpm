import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.use(helmet({ contentSecurityPolicy: false }));
  // Behind the TLS edge proxy: trust X-Forwarded-* so client IPs (rate limiting)
  // and protocol are correct.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // CORS allowlist (comma-separated CORS_ORIGINS). Never a wildcard with
  // credentials. In production an allowlist is REQUIRED — with none set we
  // fail closed (deny cross-origin); in dev we reflect the origin for convenience.
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const corsFallback = process.env.NODE_ENV === 'production' ? false : true;
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : corsFallback,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID', 'X-User-ID'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));

  const config = new DocumentBuilder()
    .setTitle('BPM Portal API')
    .setDescription('API Gateway for the BPM Portal — routes to all microservices')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  app.enableShutdownHooks();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`API Gateway running on port ${port}`);
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });
