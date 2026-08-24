import { Injectable, UnauthorizedException } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import { ConfigService } from '../../config/config.service'

export interface GoogleProfile {
  googleId: string
  email?: string
  name?: string
  avatar?: string
}

@Injectable()
export class GoogleStrategy {
  private readonly client: OAuth2Client
  private readonly clientId: string

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get('GOOGLE_CLIENT_ID')
    this.client = new OAuth2Client(this.clientId)
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      })

      const payload = ticket.getPayload()

      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google token')
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatar: payload.picture,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException('Invalid Google token')
    }
  }
}
