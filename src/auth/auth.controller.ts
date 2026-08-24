import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { User } from '../generated/prisma/client'
import { AuthService } from './auth.service'
import { appleAuthSchema, AppleAuthDto } from './dto/apple-auth.dto'
import { googleAuthSchema, GoogleAuthDto } from './dto/google-auth.dto'
import { onboardingSchema, OnboardingDto } from './dto/onboarding.dto'
import { refreshSchema, RefreshDto } from './dto/refresh.dto'
import { xAuthSchema, XAuthDto } from './dto/x-auth.dto'

interface MeResponse {
  id: string
  name: string | null
  avatar: string | null
  email: string | null
  role: User['role']
  walletAddress: string
  createdAt: Date
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // NestJS's ThrottlerGuard checks every route against every configured
  // named throttler (AND logic), not just the one named in @Throttle().
  // Without explicitly skipping the unrelated buckets here, this route
  // would also be bound by e.g. the 'wallet' bucket's own default limit.
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @SkipThrottle({ billing: true, wallet: true })
  @Post('auth/google')
  loginWithGoogle(@Body(new ZodValidationPipe(googleAuthSchema)) dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto.idToken)
  }

  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @SkipThrottle({ billing: true, wallet: true })
  @Post('auth/apple')
  loginWithApple(@Body(new ZodValidationPipe(appleAuthSchema)) dto: AppleAuthDto) {
    return this.authService.loginWithApple(dto.identityToken, dto.firstName, dto.lastName)
  }

  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @SkipThrottle({ billing: true, wallet: true })
  @Post('auth/x')
  loginWithX(@Body(new ZodValidationPipe(xAuthSchema)) dto: XAuthDto) {
    return this.authService.loginWithX(dto.code, dto.codeVerifier, dto.redirectUri)
  }

  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @SkipThrottle({ billing: true, wallet: true })
  @Post('auth/refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken)
  }

  @UseGuards(AuthGuard)
  @Delete('auth/logout')
  async logout(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
  ): Promise<{ message: string }> {
    await this.authService.logout(user.id, dto.refreshToken)
    return { message: 'Logged out' }
  }

  @UseGuards(AuthGuard)
  @Post('auth/onboarding')
  onboarding(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(onboardingSchema)) dto: OnboardingDto,
  ) {
    return this.authService.onboarding(user.id, dto.role, dto.name)
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: User): MeResponse {
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
    }
  }
}
