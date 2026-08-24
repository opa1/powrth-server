import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { ConsumersService } from '../consumers/consumers.service'
import { Meter, MeterEvent, MeterReading, RelayAction, User } from '../generated/prisma/client'
import { ProvidersService } from '../providers/providers.service'
import { AssignMeterDto, assignMeterSchema } from './dto/assign-meter.dto'
import { MeterQueryDto, meterQuerySchema } from './dto/meter-query.dto'
import { RegisterMeterDto, registerMeterSchema } from './dto/register-meter.dto'
import { RelayCommandDto, relayCommandSchema } from './dto/relay-command.dto'
import {
  MeterDetail,
  MeterSummary,
  MeterReadingSummary,
  MetersService,
  MeterWithRelations,
} from './meters.service'
import { RelayService } from './relay/relay.service'

@Controller('meters')
export class MetersController {
  constructor(
    private readonly metersService: MetersService,
    private readonly relayService: RelayService,
    private readonly providersService: ProvidersService,
    private readonly consumersService: ConsumersService,
  ) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Post()
  async register(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(registerMeterSchema)) dto: RegisterMeterDto,
  ): Promise<MeterDetail> {
    const provider = await this.providersService.findByUserId(user.id)
    const registered = await this.metersService.register(provider.id, dto)
    const meter = await this.metersService.findById(registered.id)
    return this.toDetail(meter)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER', 'CONSUMER')
  @Get()
  async list(@CurrentUser() user: User): Promise<MeterSummary[]> {
    if (user.role === 'PROVIDER') {
      const provider = await this.providersService.findByUserId(user.id)
      const meters = await this.metersService.listByProvider(provider.id)
      return meters.map((meter) => this.toSummary(meter, meter.consumer))
    }

    const consumer = await this.consumersService.findByUserId(user.id)
    const meters = await this.metersService.listByConsumer(consumer.id)
    return meters.map((meter) =>
      this.toSummary(meter, { id: consumer.id, user: { id: user.id, name: user.name } }),
    )
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER', 'CONSUMER')
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<MeterDetail> {
    const meter = await this.metersService.findById(id)
    await this.assertAccess(meter, user)
    return this.toDetail(meter)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Patch(':id/assign')
  async assign(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(assignMeterSchema)) dto: AssignMeterDto,
  ): Promise<MeterDetail> {
    const provider = await this.providersService.findByUserId(user.id)
    await this.metersService.assign(provider.id, id, dto.consumerId)
    const meter = await this.metersService.findById(id)
    return this.toDetail(meter)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Delete(':id/assign')
  async unassign(@Param('id') id: string, @CurrentUser() user: User): Promise<MeterDetail> {
    const provider = await this.providersService.findByUserId(user.id)
    await this.metersService.unassign(provider.id, id)
    const meter = await this.metersService.findById(id)
    return this.toDetail(meter)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Post(':id/relay')
  async relay(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(relayCommandSchema)) dto: RelayCommandDto,
  ): Promise<{ relayEventId: string; action: RelayAction; commandSentAt: Date }> {
    const provider = await this.providersService.findByUserId(user.id)
    const meter = await this.metersService.findById(id)

    if (meter.providerId !== provider.id) {
      throw new ForbiddenException()
    }

    const relayEvent = await this.relayService.sendCommand({
      meterId: meter.id,
      meterAddr: meter.meterAddr,
      action: dto.action,
      trigger: 'MANUAL_PROVIDER',
      initiatedByUserId: user.id,
    })

    return {
      relayEventId: relayEvent.id,
      action: relayEvent.action,
      commandSentAt: relayEvent.commandSentAt,
    }
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER', 'CONSUMER')
  @Get(':id/readings')
  async readings(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(meterQuerySchema)) query: MeterQueryDto,
  ): Promise<{ items: MeterReadingSummary[]; total: number }> {
    const meter = await this.metersService.findById(id)
    await this.assertAccess(meter, user)

    const { items, total } = await this.metersService.getReadings(id, query)
    return { items: items.map((reading) => this.toReadingSummary(reading)), total }
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Get(':id/events')
  async events(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(meterQuerySchema)) query: MeterQueryDto,
  ): Promise<{ items: MeterEvent[]; total: number }> {
    const provider = await this.providersService.findByUserId(user.id)
    const meter = await this.metersService.findById(id)

    if (meter.providerId !== provider.id) {
      throw new ForbiddenException()
    }

    return this.metersService.getEvents(id, query)
  }

  private async assertAccess(meter: MeterWithRelations, user: User): Promise<void> {
    if (user.role === 'PROVIDER') {
      const provider = await this.providersService.findByUserId(user.id)
      if (meter.providerId !== provider.id) {
        throw new ForbiddenException()
      }
      return
    }

    if (user.role === 'CONSUMER') {
      const consumer = await this.consumersService.findByUserId(user.id)
      if (meter.consumerId !== consumer.id) {
        throw new ForbiddenException()
      }
      return
    }

    throw new ForbiddenException()
  }

  private toSummary(
    meter: Meter,
    consumer: { id: string; user: { id: string; name: string | null } } | null,
  ): MeterSummary {
    return {
      id: meter.id,
      meterAddr: meter.meterAddr,
      status: meter.status,
      relayState: meter.relayState,
      lastSeen: meter.lastSeen,
      pricePerKwh: meter.pricePerKwh ? meter.pricePerKwh.toNumber() : null,
      consumer,
    }
  }

  private toDetail(meter: MeterWithRelations): MeterDetail {
    if (!meter.provider) {
      throw new ForbiddenException()
    }

    const provider = meter.provider
    const consumer = meter.consumer

    return {
      id: meter.id,
      meterAddr: meter.meterAddr,
      serial: meter.serial,
      imei: meter.imei,
      iccid: meter.iccid,
      softVer: meter.softVer,
      status: meter.status,
      relayState: meter.relayState,
      lastSeen: meter.lastSeen,
      pricePerKwh: meter.pricePerKwh ? meter.pricePerKwh.toNumber() : null,
      installedAt: meter.installedAt,
      createdAt: meter.createdAt,
      provider: {
        id: provider.id,
        businessName: provider.businessName,
        user: { id: provider.user.id, name: provider.user.name },
      },
      consumer: consumer
        ? {
            id: consumer.id,
            user: {
              id: consumer.user.id,
              name: consumer.user.name,
              walletAddress: consumer.user.walletAddress,
            },
          }
        : null,
    }
  }

  private toReadingSummary(reading: MeterReading): MeterReadingSummary {
    return {
      id: reading.id,
      voltageA: reading.voltageA.toNumber(),
      currentA: reading.currentA.toNumber(),
      activePowerW: reading.activePower.toNumber(),
      totalEnergyKwh: reading.totalEnergy.toNumber(),
      remainingKwh: reading.remainingKwh.toNumber(),
      relayState: reading.relayState,
      signal: reading.signal,
      readAt: reading.readAt,
    }
  }
}
