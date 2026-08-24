export interface LoginPacket {
  meterAddr: string
  imei: string
  iccid: string
  signal: string
  softVer: string
}

export interface EnergyReading {
  meterAddr: string
  balanceKwh: number
  totalEnergyKwh: number
  voltageA: number
  currentA: number
  activePowerW: number
  signal: number
  relayState: 'ON' | 'OFF' | 'UNKNOWN'
  rawFrame: string
}

export type ParseResult =
  | { type: 'login'; data: LoginPacket; consumed: number }
  | { type: 'energy'; data: EnergyReading; consumed: number }
  | { type: 'relay_ack'; success: boolean; consumed: number }
  | { type: 'heartbeat'; meterAddr: string; consumed: number }
  | { type: 'incomplete' }
  | { type: 'unknown'; consumed: number }

const FRAME_START = 0x68
const FRAME_END = 0x16
const CTRL_ENERGY_REPORT = 0x91
const CTRL_RELAY_ACK_OK = 0x9c
const CTRL_RELAY_ACK_FAIL = 0xdc
const JSON_START = 0x7b
const JSON_END = 0x7d
const BCD_TO_ASCII_OFFSET = 0x33

function bcdDecode(bytes: number[]): number {
  let value = 0
  let multiplier = 1
  for (const byte of bytes) {
    const lo = byte & 0x0f
    const hi = (byte >> 4) & 0x0f
    value += lo * multiplier + hi * multiplier * 10
    multiplier *= 100
  }
  return value
}

function bcdSlice(decoded: number[], start: number, end: number): number {
  return bcdDecode(decoded.slice(start, end))
}

function parseLogin(buffer: Buffer): ParseResult {
  const endIndex = buffer.indexOf(JSON_END)
  if (endIndex === -1) {
    return { type: 'incomplete' }
  }

  const jsonStr = buffer.subarray(0, endIndex + 1).toString('utf8')

  try {
    const parsed = JSON.parse(jsonStr) as {
      MeterAdr?: string
      Iccid?: string
      Csq?: string
      Imei?: string
      SoftVer?: string
    }

    return {
      type: 'login',
      data: {
        meterAddr: parsed.MeterAdr ?? '',
        imei: parsed.Imei ?? '',
        iccid: parsed.Iccid ?? '',
        signal: parsed.Csq ?? '',
        softVer: parsed.SoftVer ?? '',
      },
      consumed: endIndex + 1,
    }
  } catch {
    return { type: 'unknown', consumed: endIndex + 1 }
  }
}

function parseEnergyReport(buffer: Buffer, dataLength: number, frameLen: number): ParseResult {
  const addrBytes = buffer.subarray(1, 7)
  const meterAddr = Buffer.from(addrBytes).toString('hex')

  const dataField = buffer.subarray(10, 10 + dataLength)
  const decoded: number[] = []
  for (let i = 0; i < dataField.length; i++) {
    decoded.push((dataField[i] - BCD_TO_ASCII_OFFSET) & 0xff)
  }

  const balanceKwh = bcdSlice(decoded, 5, 9) / 100
  const totalEnergyKwh = bcdSlice(decoded, 9, 13) / 100
  const voltageA = bcdSlice(decoded, 69, 73) / 10
  const currentA = bcdSlice(decoded, 81, 85) / 1000
  const activePowerW = bcdSlice(decoded, 93, 97) / 10

  // Signal and relay status are raw bytes: not BCD-encoded, not offset by 0x33.
  const signal = dataField[137]
  const relayByte = dataField[138]
  const relayState: 'ON' | 'OFF' | 'UNKNOWN' =
    relayByte === 0x4e ? 'ON' : relayByte === 0x4d ? 'OFF' : 'UNKNOWN'

  return {
    type: 'energy',
    data: {
      meterAddr,
      balanceKwh,
      totalEnergyKwh,
      voltageA,
      currentA,
      activePowerW,
      signal,
      relayState,
      rawFrame: Buffer.from(buffer.subarray(0, frameLen)).toString('hex'),
    },
    consumed: frameLen,
  }
}

function parseDlt645Frame(buffer: Buffer): ParseResult {
  if (buffer.length < 12) {
    return { type: 'incomplete' }
  }

  const dataLength = buffer[9]
  const frameLen = dataLength + 12

  if (buffer.length < frameLen) {
    return { type: 'incomplete' }
  }

  if (buffer[frameLen - 1] !== FRAME_END) {
    return { type: 'unknown', consumed: 1 }
  }

  const ctrl = buffer[8]

  if (ctrl === CTRL_ENERGY_REPORT) {
    return parseEnergyReport(buffer, dataLength, frameLen)
  }

  if (ctrl === CTRL_RELAY_ACK_OK) {
    return { type: 'relay_ack', success: true, consumed: frameLen }
  }

  if (ctrl === CTRL_RELAY_ACK_FAIL) {
    return { type: 'relay_ack', success: false, consumed: frameLen }
  }

  return { type: 'unknown', consumed: frameLen }
}

function parseHeartbeat(buffer: Buffer): ParseResult | null {
  if (buffer.length < 6) {
    return null
  }

  const first = buffer[0]
  for (let i = 1; i < 6; i++) {
    if (buffer[i] !== first) {
      return null
    }
  }

  return {
    type: 'heartbeat',
    meterAddr: Buffer.from(buffer.subarray(0, 6)).toString('hex'),
    consumed: 6,
  }
}

export function parseNext(buffer: Buffer): ParseResult {
  if (buffer.length === 0) {
    return { type: 'incomplete' }
  }

  if (buffer[0] === JSON_START) {
    return parseLogin(buffer)
  }

  if (buffer[0] === FRAME_START) {
    return parseDlt645Frame(buffer)
  }

  const heartbeat = parseHeartbeat(buffer)
  if (heartbeat) {
    return heartbeat
  }

  return { type: 'unknown', consumed: 1 }
}
