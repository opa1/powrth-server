import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as crypto from 'node:crypto'
import { ConfigService } from '../config/config.service'
import { DatabaseService } from '../database/database.service'
import { Role, User } from '../generated/prisma/client'
import { UsersService } from '../users/users.service'
import { AppleStrategy } from './strategies/apple.strategy'
import { GoogleStrategy } from './strategies/google.strategy'
import { XStrategy } from './strategies/x.strategy'

interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface AuthResponse extends TokenPair {
  user: {
    id: string
    name: string | null
    avatar: string | null
    role: Role | null
    walletAddress: string
    isNewUser: boolean
  }
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ACCESS_TOKEN_TTL = '15m'

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly googleStrategy: GoogleStrategy,
    private readonly appleStrategy: AppleStrategy,
    private readonly xStrategy: XStrategy,
  ) {}

  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    const profile = await this.googleStrategy.verify(idToken)

    const { user, isNewUser } = await this.usersService.upsertByProvider({
      provider: 'google',
      providerId: profile.googleId,
      name: profile.name,
      avatar: profile.avatar,
      email: profile.email,
    })

    const tokens = await this.issueTokenPair(user.id, user.role)
    return this.buildAuthResponse(user, isNewUser, tokens)
  }

  async loginWithApple(
    identityToken: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthResponse> {
    const profile = await this.appleStrategy.verify(identityToken)
    const composedName = [firstName, lastName].filter(Boolean).join(' ').trim()
    const name = composedName.length > 0 ? composedName : undefined

    const { user, isNewUser } = await this.usersService.upsertByProvider({
      provider: 'apple',
      providerId: profile.appleId,
      name,
      email: profile.email,
    })

    const tokens = await this.issueTokenPair(user.id, user.role)
    return this.buildAuthResponse(user, isNewUser, tokens)
  }

  async loginWithX(code: string, codeVerifier: string, redirectUri: string): Promise<AuthResponse> {
    const profile = await this.xStrategy.verify(code, codeVerifier, redirectUri)

    const { user, isNewUser } = await this.usersService.upsertByProvider({
      provider: 'x',
      providerId: profile.xId,
      name: profile.name,
      avatar: profile.avatar,
    })

    const tokens = await this.issueTokenPair(user.id, user.role)
    return this.buildAuthResponse(user, isNewUser, tokens)
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const refreshTokenHash = this.hashToken(rawRefreshToken)
    const session = await this.db.authSession.findUnique({ where: { refreshTokenHash } })

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException()
    }

    const user = await this.usersService.findById(session.userId)

    if (!user) {
      throw new UnauthorizedException()
    }

    await this.db.authSession.delete({ where: { id: session.id } })

    return this.issueTokenPair(user.id, user.role)
  }

  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    const refreshTokenHash = this.hashToken(rawRefreshToken)
    await this.db.authSession.deleteMany({ where: { userId, refreshTokenHash } })
  }

  async onboarding(userId: string, role: Role, name: string): Promise<User> {
    await this.usersService.setRole(userId, role)
    return this.db.user.update({ where: { id: userId }, data: { name } })
  }

  private async issueTokenPair(userId: string, role: Role | null): Promise<TokenPair> {
    const accessToken = this.jwtService.sign({ sub: userId, role }, { expiresIn: ACCESS_TOKEN_TTL })

    const rawRefreshToken = crypto.randomUUID() + crypto.randomUUID()
    const refreshTokenHash = this.hashToken(rawRefreshToken)

    await this.db.authSession.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    })

    return { accessToken, refreshToken: rawRefreshToken }
  }

  private buildAuthResponse(user: User, isNewUser: boolean, tokens: TokenPair): AuthResponse {
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        walletAddress: user.walletAddress,
        isNewUser,
      },
    }
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex')
  }
}
