import { Body, Controller, Post, Req } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { DepositService } from '../wallet/deposit.service'

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly depositService: DepositService) {}

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
