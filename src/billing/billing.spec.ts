import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DatabaseService } from '../database/database.service'
import { Prisma } from '../generated/prisma/client'
import { RelayService } from '../meters/relay/relay.service'
import { BillingService } from './billing.service'
import { PlatformConfigService } from './platform-config.service'

describe('BillingService', () => {
  let billingService: BillingService
  let db: {
    meter: { findUnique: jest.Mock }
    user: { findUnique: jest.Mock; update: jest.Mock }
    consumer: { findUnique: jest.Mock }
    provider: { findUnique: jest.Mock; update: jest.Mock }
    transaction: { create: jest.Mock; findUnique: jest.Mock }
    energyBalance: { upsert: jest.Mock }
    $transaction: jest.Mock
  }
  let relayService: { sendCommand: jest.Mock }
  let platformConfigService: { getConfig: jest.Mock }

  const mockConfig = {
    feeRatePercent: new Prisma.Decimal('0.02'),
    minCreditLoadUsdc: new Prisma.Decimal('1.00'),
  }

  const mockMeter = {
    id: 'meter_1',
    meterAddr: '111111111111',
    providerId: 'prov_1',
    consumerId: 'cons_1',
    pricePerKwh: null,
    relayState: 'ON',
    provider: {
      id: 'prov_1',
      pricePerKwh: new Prisma.Decimal('0.25'),
      user: { id: 'prov_user_1', usdcBalance: new Prisma.Decimal('0') },
    },
    consumer: { id: 'cons_1' },
  }

  beforeEach(async () => {
    db = {
      meter: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      consumer: { findUnique: jest.fn() },
      provider: { findUnique: jest.fn(), update: jest.fn() },
      transaction: { create: jest.fn(), findUnique: jest.fn() },
      energyBalance: { upsert: jest.fn() },
      // BillingService uses the batch-array form of $transaction: each array
      // element is already an invoked (pending) mock call, so $transaction
      // just needs to await them together.
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    }
    relayService = { sendCommand: jest.fn() }
    platformConfigService = { getConfig: jest.fn() }

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: DatabaseService, useValue: db },
        { provide: PlatformConfigService, useValue: platformConfigService },
        { provide: RelayService, useValue: relayService },
      ],
    }).compile()

    billingService = moduleRef.get(BillingService)

    platformConfigService.getConfig.mockResolvedValue(mockConfig)
    db.consumer.findUnique.mockResolvedValue({ id: 'cons_1' })
    db.transaction.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'tx_1', ...args.data }),
    )
    db.energyBalance.upsert.mockResolvedValue({})
    db.provider.update.mockResolvedValue({})
    db.user.update.mockResolvedValue({})
    db.transaction.findUnique.mockResolvedValue({ id: 'tx_1', meter: mockMeter, loadedBy: null })
  })

  test('loadCredit — calculates fee, providerEarning, kwhAmount correctly', async () => {
    db.meter.findUnique.mockResolvedValue(mockMeter)
    db.user.findUnique.mockResolvedValue({ usdcBalance: new Prisma.Decimal('50') })

    await billingService.loadCredit({
      callerUserId: 'cons_user_1',
      callerRole: 'CONSUMER',
      meterId: 'meter_1',
      usdcAmount: 10,
    })

    const createArg = db.transaction.create.mock.calls[0][0].data
    expect(Number(createArg.platformFee)).toBeCloseTo(0.2, 6)
    expect(Number(createArg.providerEarning)).toBeCloseTo(9.8, 6)
    expect(Number(createArg.kwhAmount)).toBeCloseTo(39.2, 4)
  })

  test('loadCredit — caller usdcBalance insufficient — throws BadRequestException', async () => {
    db.meter.findUnique.mockResolvedValue(mockMeter)
    db.user.findUnique.mockResolvedValue({ usdcBalance: new Prisma.Decimal('5') })

    await expect(
      billingService.loadCredit({
        callerUserId: 'cons_user_1',
        callerRole: 'CONSUMER',
        meterId: 'meter_1',
        usdcAmount: 10,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  test('loadCredit — amount below minimum — throws BadRequestException', async () => {
    db.meter.findUnique.mockResolvedValue(mockMeter)
    db.user.findUnique.mockResolvedValue({ usdcBalance: new Prisma.Decimal('50') })

    await expect(
      billingService.loadCredit({
        callerUserId: 'cons_user_1',
        callerRole: 'CONSUMER',
        meterId: 'meter_1',
        usdcAmount: 0.5,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  test('loadCredit — meter relayState OFF — sends CLOSE relay command', async () => {
    const offMeter = { ...mockMeter, relayState: 'OFF' }
    db.meter.findUnique.mockResolvedValue(offMeter)
    db.user.findUnique.mockResolvedValue({ usdcBalance: new Prisma.Decimal('50') })
    relayService.sendCommand.mockResolvedValue({})

    await billingService.loadCredit({
      callerUserId: 'cons_user_1',
      callerRole: 'CONSUMER',
      meterId: 'meter_1',
      usdcAmount: 5,
    })

    expect(relayService.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLOSE',
        trigger: 'TOPUP_RECONNECT',
      }),
    )
  })

  test('loadCredit — relay CLOSE fails — does not throw, transaction still committed', async () => {
    const offMeter = { ...mockMeter, relayState: 'OFF' }
    db.meter.findUnique.mockResolvedValue(offMeter)
    db.user.findUnique.mockResolvedValue({ usdcBalance: new Prisma.Decimal('50') })
    relayService.sendCommand.mockRejectedValue(new Error('Meter offline'))

    await expect(
      billingService.loadCredit({
        callerUserId: 'cons_user_1',
        callerRole: 'CONSUMER',
        meterId: 'meter_1',
        usdcAmount: 5,
      }),
    ).resolves.not.toThrow()
  })

  test('loadCredit — consumer accessing meter not assigned to them — throws ForbiddenException', async () => {
    const otherMeter = { ...mockMeter, consumerId: 'other_consumer' }
    db.meter.findUnique.mockResolvedValue(otherMeter)
    db.consumer.findUnique.mockResolvedValue({ id: 'my_consumer' })
    db.user.findUnique.mockResolvedValue({ usdcBalance: new Prisma.Decimal('50') })

    await expect(
      billingService.loadCredit({
        callerUserId: 'uid',
        callerRole: 'CONSUMER',
        meterId: 'meter_1',
        usdcAmount: 5,
      }),
    ).rejects.toThrow(ForbiddenException)
  })
})
