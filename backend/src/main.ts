import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CareSaath API')
    .setDescription('Home nursing & physiotherapy marketplace backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);

  const base = `http://localhost:${port}`;
  const logger = new Logger('Bootstrap');
  logger.log(`API base:       ${base}/api/v1`);
  logger.log(`Swagger UI:     ${base}/docs`);
  logger.log(`OpenAPI JSON:   ${base}/docs-json`);
}
await bootstrap();
