import { Injectable } from '@nestjs/common'
import { EnvConfig } from './env.schema'

@Injectable()
export class ConfigService {
  constructor(private readonly env: EnvConfig) {}

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.env[key]
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production'
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development'
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test'
  }
}
