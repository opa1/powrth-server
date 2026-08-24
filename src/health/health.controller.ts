import { Controller, Get } from '@nestjs/common'

interface HealthStatus {
  status: string
  timestamp: string
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }
}
