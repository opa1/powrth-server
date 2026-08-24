import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { DatabaseService } from '../../database/database.service'
import { RelayAction, RelayEvent, RelayTrigger } from '../../generated/prisma/client'
import { TcpServer } from '../tcp/tcp.server'
import { buildRelayFrame } from './relay.builder'

interface SendCommandInput {
  meterId: string
  meterAddr: string
  action: RelayAction
  trigger: RelayTrigger
  initiatedByUserId?: string
}

@Injectable()
export class RelayService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tcpServer: TcpServer,
  ) {}

  async sendCommand(input: SendCommandInput): Promise<RelayEvent> {
    const frame = buildRelayFrame(input.meterAddr, input.action)

    const sent = this.tcpServer.sendToMeter(input.meterAddr, frame)
    if (!sent) {
      throw new ServiceUnavailableException('Meter not connected')
    }

    const relayEvent = await this.db.relayEvent.create({
      data: {
        meterId: input.meterId,
        action: input.action,
        trigger: input.trigger,
        initiatedByUserId: input.initiatedByUserId,
        commandSentAt: new Date(),
        success: false,
      },
    })

    await this.db.meterEvent.create({
      data: {
        meterId: input.meterId,
        type: 'RELAY_COMMAND_SENT',
        payload: { action: input.action, trigger: input.trigger },
      },
    })

    return relayEvent
  }
}
