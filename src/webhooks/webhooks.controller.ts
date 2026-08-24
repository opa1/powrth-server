import { Body, Controller, Post, Req } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { FastifyRequest } from 'fastify'
import { DepositService } from '../wallet/deposit.service'

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly depositService: DepositService) {}

  // Bare @SkipThrottle() only skips the 'default' named throttler — with
  // multiple named throttlers configured, NestJS checks every route against
  // ALL of them unless each is skipped explicitly by name. Helius must never
  // be rate-limited, so every configured bucket is skipped here.
  @SkipThrottle({ default: true, auth: true, billing: true, wallet: true })
  @Post('helius')
  async helius(
    @Req() request: FastifyRequest,
    @Body() body: any[],
  ): Promise<{ received: boolean }> {
    const authHeader = (request.headers['authorization'] as string) ?? ''
    await this.depositService.processHeliusWebhook(body, authHeader)
    return { received: true }
  }
}
