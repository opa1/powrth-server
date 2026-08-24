import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    if (!this.schema) {
      return value
    }

    try {
      return this.schema.parse(value)
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: error.issues,
        })
      }
      throw error
    }
  }
}
