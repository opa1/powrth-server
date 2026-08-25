import { ConfigService } from './config.service'

export interface NetworkConfig {
  network: 'mainnet' | 'devnet'
  isMainnet: boolean
  rpcUrl: string
  usdcMintAddress: string
  heliusWebhookId: string | undefined
  heliusWebhookSecret: string
}

export function resolveNetworkConfig(config: ConfigService): NetworkConfig {
  const network = config.get('NETWORK')
  const isMainnet = network === 'mainnet'
  return {
    network,
    isMainnet,
    rpcUrl: isMainnet ? config.get('SOLANA_RPC_URL_MAINNET') : config.get('SOLANA_RPC_URL_DEVNET'),
    usdcMintAddress: isMainnet
      ? config.get('USDC_MINT_ADDRESS_MAINNET')
      : config.get('USDC_MINT_ADDRESS_DEVNET'),
    heliusWebhookId: isMainnet
      ? config.get('HELIUS_WEBHOOK_ID_MAINNET')
      : config.get('HELIUS_WEBHOOK_ID_DEVNET'),
    heliusWebhookSecret: isMainnet
      ? config.get('HELIUS_WEBHOOK_SECRET_MAINNET')
      : config.get('HELIUS_WEBHOOK_SECRET_DEVNET'),
  }
}
