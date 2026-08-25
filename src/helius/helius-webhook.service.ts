import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import { ConfigService } from '../config/config.service'
import { resolveNetworkConfig } from '../config/network.config'

interface HeliusWebhookConfig {
  webhookURL: string
  transactionTypes: string[]
  accountAddresses: string[]
  webhookType: string
  authHeader?: string
  [key: string]: unknown
}

const HELIUS_API_BASE = 'https://api.helius.xyz/v0/webhooks'

/**
 * Keeps a Helius webhook's account-address watchlist in sync with which user
 * wallets should be monitored for deposits. Call addAddress() when a wallet
 * should start being watched (new user, reactivation) and removeAddress()
 * when it shouldn't (deactivation). Network-aware: reads whichever webhook ID
 * is configured for the currently active NETWORK.
 *
 * Never throws — a Helius outage must not block user creation or admin
 * actions. Failures are logged so missed syncs are visible operationally.
 */
@Injectable()
export class HeliusWebhookService {
  private readonly logger = new Logger(HeliusWebhookService.name)

  constructor(private readonly configService: ConfigService) {}

  async addAddress(walletAddress: string): Promise<void> {
    await this.mutateAddresses((current) => Array.from(new Set([...current, walletAddress])))
  }

  async removeAddress(walletAddress: string): Promise<void> {
    await this.mutateAddresses((current) => current.filter((addr) => addr !== walletAddress))
  }

  private async mutateAddresses(mutate: (current: string[]) => string[]): Promise<void> {
    const apiKey = this.configService.get('HELIUS_API_KEY')
    const { heliusWebhookId: webhookId, network } = resolveNetworkConfig(this.configService)

    if (!webhookId) {
      this.logger.warn(
        `[Helius] No webhook ID configured for network '${network}' — skipping address sync`,
      )
      return
    }

    try {
      const url = `${HELIUS_API_BASE}/${webhookId}?api-key=${apiKey}`
      const { data: webhook } = await axios.get<HeliusWebhookConfig>(url)
      const accountAddresses = mutate(webhook.accountAddresses ?? [])
      await axios.put(url, { ...webhook, accountAddresses })
    } catch (error) {
      this.logger.error(
        `[Helius] Failed to sync webhook address list: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
