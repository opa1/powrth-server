import { Global, Module } from '@nestjs/common'
import { ConfigService } from './config.service'
import { EnvConfig, loadEnv } from './env.schema'

export const ENV_CONFIG = Symbol('ENV_CONFIG')

@Global()
@Module({
  providers: [
    {
      provide: ENV_CONFIG,
      useFactory: (): EnvConfig => loadEnv(),
    },
    {
      provide: ConfigService,
      useFactory: (env: EnvConfig): ConfigService => new ConfigService(env),
      inject: [ENV_CONFIG],
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
