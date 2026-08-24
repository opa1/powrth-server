import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type * as net from 'node:net'
import { DatabaseService } from '../database/database.service'
import {
  Consumer,
  Meter,
  MeterEvent,
  MeterReading,
  MeterStatus,
  Provider,
  RelayState,
  User,
} from '../generated/prisma/client'
import { RelayService } from './relay/relay.service'
import { EnergyReading, LoginPacket } from './tcp/frame.parser'
import { TcpServer } from './tcp/tcp.server'

export interface MeterWithRelations extends Meter {
  provider: (Provider & { user: User }) | null
  consumer: (Consumer & { user: User }) | null
}

export interface MeterWithConsumer extends Meter {
  consumer: (Consumer & { user: User }) | null
}

export interface MeterWithProvider extends Meter {
  provider: (Provider & { user: User }) | null
}

export interface MeterSummary {
  id: string
  meterAddr: string
  status: MeterStatus
  relayState: RelayState
  lastSeen: Date | null
  pricePerKwh: number | null
  consumer: { id: string; user: { id: string; name: string | null } } | null
}

export interface MeterDetail {
  id: string
  meterAddr: string
  serial: string | null
  imei: string | null
  iccid: string | null
  softVer: string | null
  status: MeterStatus
  relayState: RelayState
  lastSeen: Date | null
  pricePerKwh: number | null
  installedAt: Date | null
  createdAt: Date
  provider: { id: string; businessName: string | null; user: { id: string; name: string | null } }
  consumer: {
    id: string
    user: { id: string; name: string | null; walletAddress: string }
  } | null
}

export interface MeterReadingSummary {
  id: string
  voltageA: number
  currentA: number
  activePowerW: number
  totalEnergyKwh: number
  remainingKwh: number
  relayState: RelayState
  signal: number
  readAt: Date
}

const METER_ADDR_PATTERN = /^[0-9a-fA-F]{12}$/

const DEFAULT_READINGS_TAKE = 20
const MAX_READINGS_TAKE = 50
const DEFAULT_EVENTS_TAKE = 50
const MAX_EVENTS_TAKE = 100

@Injectable()
export class MetersService {
  private readonly logger = new Logger(MetersService.name)

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => TcpServer))
    private readonly tcpServer: TcpServer,
    private readonly relayService: RelayService,
  ) {}

  // ---- TCP event handlers (called by TcpServer) ----

  async handleLogin(packet: LoginPacket, _socket: net.Socket): Promise<void> {
    const existing = await this.db.meter.findUnique({ where: { meterAddr: packet.meterAddr } })

    const meter = existing
      ? await this.db.meter.update({
          where: { meterAddr: packet.meterAddr },
          data: {
            imei: packet.imei,
            iccid: packet.iccid,
            softVer: packet.softVer,
            status: 'ONLINE',
            lastSeen: new Date(),
          },
        })
      : await this.db.meter.create({
          data: {
            meterAddr: packet.meterAddr,
            imei: packet.imei,
            iccid: packet.iccid,
            softVer: packet.softVer,
            status: 'ONLINE',
            lastSeen: new Date(),
          },
        })

    await this.db.meterEvent.create({
      data: {
        meterId: meter.id,
        type: 'LOGIN',
        payload: {
          imei: packet.imei,
          iccid: packet.iccid,
          signal: packet.signal,
          softVer: packet.softVer,
        },
      },
    })
  }

  async handleEnergyReport(reading: EnergyReading): Promise<void> {
    const meter = await this.db.meter.findUnique({ where: { meterAddr: reading.meterAddr } })

    if (!meter) {
      this.logger.warn(`Energy report for unknown meter ${reading.meterAddr}`)
      return
    }

    await this.db.meter.update({
      where: { id: meter.id },
      data: { status: 'ONLINE', relayState: reading.relayState, lastSeen: new Date() },
    })

    await this.db.meterReading.create({
      data: {
        meterId: meter.id,
        voltageA: reading.voltageA,
        currentA: reading.currentA,
        activePower: reading.activePowerW,
        totalEnergy: reading.totalEnergyKwh,
        remainingKwh: reading.balanceKwh,
        relayState: reading.relayState,
        signal: reading.signal,
        rawFrame: reading.rawFrame,
      },
    })

    await this.db.meterEvent.create({
      data: {
        meterId: meter.id,
        type: 'ENERGY_REPORT',
        payload: {
          voltageA: reading.voltageA,
          currentA: reading.currentA,
          activePowerW: reading.activePowerW,
          remainingKwh: reading.balanceKwh,
          relayState: reading.relayState,
          signal: reading.signal,
        },
      },
    })
  }

  async handleRelayAck(meterAddr: string, success: boolean): Promise<void> {
    const meter = await this.db.meter.findUnique({ where: { meterAddr } })

    if (!meter) {
      this.logger.warn(`Relay ack for unknown meter ${meterAddr}`)
      return
    }

    const pendingEvent = await this.db.relayEvent.findFirst({
      where: { meterId: meter.id, acknowledgedAt: null },
      orderBy: { commandSentAt: 'desc' },
    })

    if (pendingEvent) {
      await this.db.relayEvent.update({
        where: { id: pendingEvent.id },
        data: { acknowledgedAt: new Date(), success },
      })
    }

    await this.db.meterEvent.create({
      data: {
        meterId: meter.id,
        type: success ? 'RELAY_COMMAND_ACK' : 'RELAY_COMMAND_FAILED',
        payload: {},
      },
    })
  }

  async handleHeartbeat(meterAddr: string): Promise<void> {
    const meter = await this.db.meter.findUnique({ where: { meterAddr } })

    if (!meter) {
      this.logger.warn(`Heartbeat for unknown meter ${meterAddr}`)
      return
    }

    await this.db.meter.update({
      where: { id: meter.id },
      data: { status: 'ONLINE', lastSeen: new Date() },
    })

    await this.db.meterEvent.create({
      data: { meterId: meter.id, type: 'HEARTBEAT', payload: {} },
    })
  }

  async handleDisconnect(meterAddr: string): Promise<void> {
    const meter = await this.db.meter.findUnique({ where: { meterAddr } })

    if (!meter) {
      return
    }

    await this.db.meter.update({ where: { id: meter.id }, data: { status: 'OFFLINE' } })

    await this.db.meterEvent.create({
      data: { meterId: meter.id, type: 'DISCONNECTED', payload: {} },
    })
  }

  // ---- HTTP-facing methods ----

  async register(
    providerId: string,
    input: { meterAddr: string; pricePerKwh?: number },
  ): Promise<Meter> {
    if (!METER_ADDR_PATTERN.test(input.meterAddr)) {
      throw new BadRequestException('meterAddr must be a 12-char hex string')
    }

    const existing = await this.db.meter.findUnique({ where: { meterAddr: input.meterAddr } })

    if (existing?.providerId && existing.providerId !== providerId) {
      throw new ConflictException('Meter already registered to another provider')
    }

    const data = {
      providerId,
      ...(input.pricePerKwh !== undefined ? { pricePerKwh: input.pricePerKwh } : {}),
    }

    if (existing) {
      return this.db.meter.update({ where: { meterAddr: input.meterAddr }, data })
    }

    return this.db.meter.create({ data: { meterAddr: input.meterAddr, ...data } })
  }

  async assign(providerId: string, meterId: string, consumerId: string): Promise<Meter> {
    const meter = await this.db.meter.findUnique({ where: { id: meterId } })

    if (!meter) {
      throw new NotFoundException('Meter not found')
    }

    if (meter.providerId !== providerId) {
      throw new ForbiddenException()
    }

    if (meter.consumerId && meter.consumerId !== consumerId) {
      throw new ConflictException('Meter already assigned to another consumer')
    }

    return this.db.meter.update({ where: { id: meterId }, data: { consumerId } })
  }

  async unassign(providerId: string, meterId: string): Promise<Meter> {
    const meter = await this.db.meter.findUnique({ where: { id: meterId } })

    if (!meter) {
      throw new NotFoundException('Meter not found')
    }

    if (meter.providerId !== providerId) {
      throw new ForbiddenException()
    }

    return this.db.meter.update({ where: { id: meterId }, data: { consumerId: null } })
  }

  async findById(id: string): Promise<MeterWithRelations> {
    const meter = await this.db.meter.findUnique({
      where: { id },
      include: {
        provider: { include: { user: true } },
        consumer: { include: { user: true } },
      },
    })

    if (!meter) {
      throw new NotFoundException('Meter not found')
    }

    return meter
  }

  async listByProvider(providerId: string): Promise<MeterWithConsumer[]> {
    return this.db.meter.findMany({
      where: { providerId },
      include: { consumer: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async listByConsumer(consumerId: string): Promise<MeterWithProvider[]> {
    return this.db.meter.findMany({
      where: { consumerId },
      include: { provider: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getReadings(
    meterId: string,
    params: { skip?: number; take?: number },
  ): Promise<{ items: MeterReading[]; total: number }> {
    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_READINGS_TAKE, MAX_READINGS_TAKE)

    const [items, total] = await this.db.$transaction([
      this.db.meterReading.findMany({
        where: { meterId },
        orderBy: { readAt: 'desc' },
        skip,
        take,
      }),
      this.db.meterReading.count({ where: { meterId } }),
    ])

    return { items, total }
  }

  async getEvents(
    meterId: string,
    params: { skip?: number; take?: number },
  ): Promise<{ items: MeterEvent[]; total: number }> {
    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_EVENTS_TAKE, MAX_EVENTS_TAKE)

    const [items, total] = await this.db.$transaction([
      this.db.meterEvent.findMany({
        where: { meterId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.meterEvent.count({ where: { meterId } }),
    ])

    return { items, total }
  }
}
