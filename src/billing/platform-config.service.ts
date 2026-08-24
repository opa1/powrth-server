import { BadRequestException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { PlatformConfig } from '../generated/prisma/client'

const SINGLETON_ID = 'singleton'

interface UpdateConfigInput {
  feeRatePercent?: number
  minCreditLoadUsdc?: number
  minWithdrawalUsdc?: number
  feeWalletAddress?: string
}

@Injectable()
export class PlatformConfigService {
  constructor(private readonly db: DatabaseService) {}

  async getConfig(): Promise<PlatformConfig> {
    return this.db.platformConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    })
  }

  async updateConfig(input: UpdateConfigInput): Promise<PlatformConfig> {
    if (
      input.feeRatePercent !== undefined &&
      (input.feeRatePercent < 0 || input.feeRatePercent > 1)
    ) {
      throw new BadRequestException('feeRatePercent must be between 0 and 1')
    }

    await this.getConfig()

    const data: UpdateConfigInput = {}
    if (input.feeRatePercent !== undefined) {
      data.feeRatePercent = input.feeRatePercent
    }
    if (input.minCreditLoadUsdc !== undefined) {
      data.minCreditLoadUsdc = input.minCreditLoadUsdc
    }
    if (input.minWithdrawalUsdc !== undefined) {
      data.minWithdrawalUsdc = input.minWithdrawalUsdc
    }
    if (input.feeWalletAddress !== undefined) {
      data.feeWalletAddress = input.feeWalletAddress
    }

    return this.db.platformConfig.update({ where: { id: SINGLETON_ID }, data })
  }
}
