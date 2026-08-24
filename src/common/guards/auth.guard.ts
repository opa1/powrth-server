import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { FastifyRequest } from 'fastify'
import { User } from '../../generated/prisma/client'
import { UsersService } from '../../users/users.service'

interface AccessTokenPayload {
  sub: string
  role: string | null
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: User }>()
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException()
    }

    const token = authHeader.slice('Bearer '.length)

    let payload: AccessTokenPayload
    try {
      payload = this.jwtService.verify<AccessTokenPayload>(token)
    } catch {
      throw new UnauthorizedException()
    }

    const user = await this.usersService.findById(payload.sub)

    if (!user || !user.isActive) {
      throw new UnauthorizedException()
    }

    request.user = user
    return true
  }
}
