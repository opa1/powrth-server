import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { FastifyReply } from 'fastify'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<FastifyReply>()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as { message?: string | string[] }).message ?? exception.message)

    void response.status(status).send({
      success: false,
      error: {
        code: status,
        message,
      },
      timestamp: new Date().toISOString(),
    })
  }
}
