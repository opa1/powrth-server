import { Injectable, UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { JwksClient } from 'jwks-rsa'
import { ConfigService } from '../../config/config.service'

export interface AppleProfile {
  appleId: string
  email?: string
  name?: string
}

const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys'
const APPLE_ISSUER = 'https://appleid.apple.com'

@Injectable()
export class AppleStrategy {
  private readonly jwksClient: JwksClient
  private readonly teamId: string

  constructor(private readonly configService: ConfigService) {
    this.teamId = this.configService.get('APPLE_TEAM_ID')
    this.jwksClient = new JwksClient({ jwksUri: APPLE_JWKS_URI })
  }

  async verify(identityToken: string): Promise<AppleProfile> {
    try {
      const decoded = jwt.decode(identityToken, { complete: true })

      if (!decoded || typeof decoded.payload === 'string') {
        throw new UnauthorizedException('Invalid Apple token')
      }

      const kid = decoded.header.kid

      if (!kid) {
        throw new UnauthorizedException('Invalid Apple token')
      }

      const signingKey = await this.jwksClient.getSigningKey(kid)
      const publicKey = signingKey.getPublicKey()

      const payload = jwt.verify(identityToken, publicKey, {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: this.teamId,
      })

      if (typeof payload === 'string' || !payload.sub) {
        throw new UnauthorizedException('Invalid Apple token')
      }

      return {
        appleId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException('Invalid Apple token')
    }
  }
}
