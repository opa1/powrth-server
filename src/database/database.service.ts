import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { ConfigService } from '../config/config.service'
import { PrismaClient } from '../generated/prisma/client'

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)

  constructor(configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.get('DATABASE_URL'),
    })

    super({ adapter })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('Database connection established')
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
