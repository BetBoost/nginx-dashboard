import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = config.get<number>('app.port', 4000);
  const corsOrigins = config.get<string[]>('app.corsOrigins', []);

  app.setGlobalPrefix('api', { exclude: ['health', 'docs'] });
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ── Swagger ────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nginx Dashboard API')
    .setDescription('REST API for managing nginx subdomains across remote Linux servers')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`API ready on http://0.0.0.0:${port}`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

void bootstrap();
