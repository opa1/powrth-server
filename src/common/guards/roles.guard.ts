import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyRequest } from 'fastify'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { Role, User } from '../../generated/prisma/client'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: User }>()
    const user = request.user

    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException()
    }

    return true
  }
}
