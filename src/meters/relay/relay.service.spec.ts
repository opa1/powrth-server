import { ServiceUnavailableException } from '@nestjs/common'
import { DatabaseService } from '../../database/database.service'
import { TcpServer } from '../tcp/tcp.server'
import { RelayService } from './relay.service'

describe('RelayService', () => {
  let relayService: RelayService
  let db: {
    relayEvent: { create: jest.Mock }
    meterEvent: { create: jest.Mock }
  }
  let tcpServer: { sendToMeter: jest.Mock }

  beforeEach(() => {
    db = {
      relayEvent: { create: jest.fn() },
      meterEvent: { create: jest.fn() },
    }
    tcpServer = { sendToMeter: jest.fn() }

    // RelayService has only two plain constructor dependencies, and TcpServer
    // has a real forwardRef circular dependency on MetersService that Nest's
    // testing-module DI resolves reliably in the full app but not reliably
    // under Jest's per-file module loading. Constructing directly sidesteps
    // that entirely without touching any production wiring.
    relayService = new RelayService(
      db as unknown as DatabaseService,
      tcpServer as unknown as TcpServer,
    )
  })

  test('sendCommand — meter connected — sends frame, creates RelayEvent', async () => {
    tcpServer.sendToMeter.mockReturnValue(true)
    db.relayEvent.create.mockResolvedValue({ id: 'evt_1', action: 'TRIP' })
    db.meterEvent.create.mockResolvedValue({})

    await relayService.sendCommand({
      meterId: 'meter_1',
      meterAddr: '111111111111',
      action: 'TRIP',
      trigger: 'MANUAL_PROVIDER',
      initiatedByUserId: 'uid_1',
    })

    expect(tcpServer.sendToMeter).toHaveBeenCalledWith('111111111111', expect.any(Buffer))

    const frameArg = tcpServer.sendToMeter.mock.calls[0][1] as Buffer
    expect(frameArg[0]).toBe(0xfe)
    expect(frameArg[frameArg.length - 1]).toBe(0x16)

    expect(db.relayEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TRIP',
          trigger: 'MANUAL_PROVIDER',
          success: false,
        }),
      }),
    )
  })

  test('sendCommand — meter not connected — throws ServiceUnavailableException', async () => {
    tcpServer.sendToMeter.mockReturnValue(false)

    await expect(
      relayService.sendCommand({
        meterId: 'meter_1',
        meterAddr: '111111111111',
        action: 'TRIP',
        trigger: 'MANUAL_PROVIDER',
      }),
    ).rejects.toThrow(ServiceUnavailableException)

    expect(db.relayEvent.create).not.toHaveBeenCalled()
  })
})
