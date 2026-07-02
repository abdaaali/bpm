import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet({ contentSecurityPolicy: false }));
  // Fail-closed CORS: allowlist from CORS_ORIGINS, never a wildcard (behind gateway).
  const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app,
    new DocumentBuilder().setTitle('Org Service').setVersion('1.0').addBearerAuth().build()
  ));
  app.enableShutdownHooks();
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Org Service running on port ${port}`);
}
bootstrap().catch((e) => { console.error(e); process.exit(1); });
