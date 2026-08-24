import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface TransformedResponse<T> {
  success: true
  data: T
  timestamp: string
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, TransformedResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<TransformedResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        timestamp: new Date().toISOString(),
      })),
    )
  }
}
