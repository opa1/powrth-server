import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import * as net from 'node:net'
import { ConfigService } from '../../config/config.service'
import { MetersService } from '../meters.service'
import { parseNext } from './frame.parser'

@Injectable()
export class TcpServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpServer.name)
  private server?: net.Server

  private readonly socketsByMeterAddr = new Map<string, net.Socket>()
  private readonly buffersByConnId = new Map<string, Buffer>()
  private readonly meterAddrByConnId = new Map<string, string>()

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MetersService))
    private readonly metersService: MetersService,
  ) {}

  onModuleInit(): void {
    const port = this.configService.get('TCP_PORT')

    this.server = net.createServer((socket) => this.handleConnection(socket))
    this.server.listen(port, '0.0.0.0', () => {
      this.logger.log(`TCP server listening on port ${port}`)
    })
  }

  onModuleDestroy(): void {
    this.server?.close()
  }

  sendToMeter(meterAddr: string, frame: Buffer): boolean {
    const socket = this.socketsByMeterAddr.get(meterAddr)

    if (!socket) {
      return false
    }

    socket.write(frame)
    return true
  }

  private handleConnection(socket: net.Socket): void {
    const connId = `${socket.remoteAddress}:${socket.remotePort}`
    this.buffersByConnId.set(connId, Buffer.alloc(0))

    socket.on('data', (chunk: Buffer) => {
      let buffer = Buffer.concat([this.buffersByConnId.get(connId) ?? Buffer.alloc(0), chunk])

      for (;;) {
        const result = parseNext(buffer)

        if (result.type === 'incomplete') {
          break
        }

        buffer = buffer.subarray(result.consumed)

        switch (result.type) {
          case 'login':
            this.socketsByMeterAddr.set(result.data.meterAddr, socket)
            this.meterAddrByConnId.set(connId, result.data.meterAddr)
            void this.metersService.handleLogin(result.data, socket)
            break
          case 'energy':
            void this.metersService.handleEnergyReport(result.data)
            break
          case 'relay_ack': {
            const meterAddr = this.meterAddrByConnId.get(connId)
            if (meterAddr) {
              void this.metersService.handleRelayAck(meterAddr, result.success)
            }
            break
          }
          case 'heartbeat':
            void this.metersService.handleHeartbeat(result.meterAddr)
            break
          case 'unknown':
            this.logger.warn(`Skipped ${result.consumed} unknown byte(s) from ${connId}`)
            break
        }
      }

      this.buffersByConnId.set(connId, buffer)
    })

    socket.on('close', () => {
      const meterAddr = this.meterAddrByConnId.get(connId)

      if (meterAddr) {
        this.socketsByMeterAddr.delete(meterAddr)
        this.meterAddrByConnId.delete(connId)
        void this.metersService.handleDisconnect(meterAddr)
      }

      this.buffersByConnId.delete(connId)
    })

    socket.on('error', (err) => {
      this.logger.error(`Socket error on ${connId}: ${err.message}`)
    })
  }
}
