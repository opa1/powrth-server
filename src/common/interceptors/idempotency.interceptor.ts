import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { Observable, of } from 'rxjs'
import { mergeMap } from 'rxjs/operators'
import { User } from '../../generated/prisma/client'
import { IdempotencyService } from '../services/idempotency.service'

const MAX_KEY_LENGTH = 128

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name)

  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: User }>()
    const key = request.headers['idempotency-key'] as string | undefined

    if (!key || key.length > MAX_KEY_LENGTH) {
      return next.handle()
    }

    const userId = request.user?.id
    if (!userId) {
      return next.handle()
    }

    const existing = await this.idempotency.get(key, userId)
    if (existing) {
      return of(existing.response)
    }

    // Awaited (not fire-and-forget) so the key is durably stored before the
    // response reaches the client — otherwise a fast retry can race ahead of
    // the write and slip through as a second, non-idempotent request.
    return next.handle().pipe(
      mergeMap(async (response: unknown) => {
        try {
          await this.idempotency.store(key, userId, response)
        } catch (err) {
          this.logger.error(`[Idempotency] Store failed: ${(err as Error).message}`)
        }
        return response
      }),
    )
  }
}
