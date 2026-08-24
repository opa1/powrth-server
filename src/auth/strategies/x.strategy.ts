import { Injectable, UnauthorizedException } from '@nestjs/common'
import axios from 'axios'
import { ConfigService } from '../../config/config.service'

export interface XProfile {
  xId: string
  name?: string
  avatar?: string
}

interface XTokenResponse {
  access_token: string
}

interface XUserResponse {
  data: {
    id: string
    name?: string
    profile_image_url?: string
  }
}

const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const X_USER_URL = 'https://api.twitter.com/2/users/me'

@Injectable()
export class XStrategy {
  constructor(private readonly configService: ConfigService) {}

  async verify(code: string, codeVerifier: string, redirectUri: string): Promise<XProfile> {
    try {
      const clientId = this.configService.get('X_CLIENT_ID')
      const clientSecret = this.configService.get('X_CLIENT_SECRET')
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

      const tokenResponse = await axios.post<XTokenResponse>(
        X_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )

      const userResponse = await axios.get<XUserResponse>(X_USER_URL, {
        params: { 'user.fields': 'id,name,profile_image_url' },
        headers: {
          Authorization: `Bearer ${tokenResponse.data.access_token}`,
        },
      })

      const profile = userResponse.data.data

      if (!profile?.id) {
        throw new UnauthorizedException('Invalid X credentials')
      }

      return {
        xId: profile.id,
        name: profile.name,
        avatar: profile.profile_image_url,
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException('Invalid X credentials')
    }
  }
}
