import 'reflect-metadata'

try {
  process.loadEnvFile()
} catch {
  // No .env file present; rely on environment variables injected by the host (e.g. PM2, CI).
}

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe'
import { ConfigService } from './config/config.service'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  const configService = app.get(ConfigService)

  app.enableCors()
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalPipes(new ZodValidationPipe())

  const port = configService.get('PORT')
  await app.listen(port, '0.0.0.0')

  Logger.log(`Server listening on port ${port}`, 'Bootstrap')
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : error, undefined, 'Bootstrap')
  process.exit(1)
})
