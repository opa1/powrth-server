import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../../database/database.service'
import { IdempotencyKey, Prisma } from '../../generated/prisma/client'

/**
 * Controller responses may contain non-plain-JSON values (e.g. Date instances),
 * which serialize fine through Prisma's Json column but aren't structurally
 * assignable to Prisma.InputJsonValue. Accept `unknown` here and cast once,
 * at the point of writing, rather than forcing every caller to pre-shape its
 * response into strict JSON.
 */

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

@Injectable()
export class IdempotencyService {
  constructor(private readonly db: DatabaseService) {}

  async get(key: string, userId: string): Promise<IdempotencyKey | null> {
    const record = await this.db.idempotencyKey.findUnique({
      where: { key_userId: { key, userId } },
    })

    if (!record) {
      return null
    }

    if (record.expiresAt <= new Date()) {
      await this.db.idempotencyKey.delete({ where: { id: record.id } })
      return null
    }

    return record
  }

  async store(key: string, userId: string, response: unknown): Promise<void> {
    await this.db.idempotencyKey.upsert({
      where: { key_userId: { key, userId } },
      create: {
        key,
        userId,
        response: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
      update: {},
    })
  }
}
