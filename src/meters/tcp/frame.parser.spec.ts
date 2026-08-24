import { parseNext } from './frame.parser'

function buildRelayAckFrame(): Buffer {
  const addr = [0x11, 0x11, 0x11, 0x11, 0x11, 0x11]
  const core = [0x68, ...addr, 0x68, 0x9c, 0x00]
  const cs = core.reduce((s, b) => (s + b) & 0xff, 0)
  return Buffer.from([...core, cs, 0x16])
}

function buildRelayNackFrame(): Buffer {
  const addr = [0x11, 0x11, 0x11, 0x11, 0x11, 0x11]
  const core = [0x68, ...addr, 0x68, 0xdc, 0x01, 0x00]
  const cs = core.reduce((s, b) => (s + b) & 0xff, 0)
  return Buffer.from([...core, cs, 0x16])
}

function buildEnergyFrame(): Buffer {
  const addr = [0x11, 0x11, 0x11, 0x11, 0x11, 0x11]
  const header = [0x68, ...addr, 0x68, 0x91, 0xa1]

  const data = new Array(161).fill(0x33)

  // voltageA at data[69-72]: encode 220.0V
  data[69] = 0x33
  data[70] = 0x55
  data[71] = 0x33
  data[72] = 0x33

  // currentA at data[81-84]: encode 5.000A
  data[81] = 0x33
  data[82] = 0x83
  data[83] = 0x33
  data[84] = 0x33

  // activePower at data[93-96]: encode 500.0W
  data[93] = 0x33
  data[94] = 0x83
  data[95] = 0x33
  data[96] = 0x33

  // remainingKwh at data[5-8]: encode 10.50 kWh
  data[5] = 0x83
  data[6] = 0x43
  data[7] = 0x33
  data[8] = 0x33

  // totalEnergy at data[9-12]: encode 100.00 kWh
  data[9] = 0x33
  data[10] = 0x33
  data[11] = 0x34
  data[12] = 0x33

  // signal at data[137]: raw byte (not BCD encoded)
  data[137] = 0x13

  // relayState at data[138]: 0x4E = ON (raw, not BCD encoded)
  data[138] = 0x4e

  const dataBuffer = Buffer.from(data)
  const frameWithoutCS = Buffer.from([...header, ...dataBuffer])
  const cs = frameWithoutCS.reduce((s, b) => (s + b) & 0xff, 0)
  return Buffer.concat([frameWithoutCS, Buffer.from([cs, 0x16])])
}

describe('parseNext', () => {
  test('returns incomplete for empty buffer', () => {
    expect(parseNext(Buffer.alloc(0))).toEqual({ type: 'incomplete' })
  })

  test('returns incomplete for partial JSON', () => {
    const buf = Buffer.from('{"MeterAdr":"2021')
    expect(parseNext(buf)).toEqual({ type: 'incomplete' })
  })

  test('parses valid login JSON packet', () => {
    const json =
      '{"MeterAdr":"202108100034","Iccid":"89860322432000231222",' +
      '"Csq":"19","Imei":"863488055937018","SoftVer":"1.0.2"}'
    const buf = Buffer.from(json)
    const result = parseNext(buf)

    expect(result.type).toBe('login')
    if (result.type !== 'login') return
    expect(result.consumed).toBe(buf.length)
    expect(result.data.meterAddr).toBe('202108100034')
    expect(result.data.imei).toBe('863488055937018')
  })

  test('parses heartbeat — 6 identical bytes', () => {
    const buf = Buffer.from([0x11, 0x11, 0x11, 0x11, 0x11, 0x11])
    const result = parseNext(buf)

    expect(result.type).toBe('heartbeat')
    if (result.type !== 'heartbeat') return
    expect(result.consumed).toBe(6)
  })

  test('returns incomplete for heartbeat when fewer than 6 bytes', () => {
    const buf = Buffer.from([0x11, 0x11, 0x11])
    const result = parseNext(buf)

    expect(result.type).toBe('unknown')
    if (result.type !== 'unknown') return
    expect(result.consumed).toBe(1)
  })

  test('parses relay ACK frame (ctrl=0x9C)', () => {
    const result = parseNext(buildRelayAckFrame())

    expect(result.type).toBe('relay_ack')
    if (result.type !== 'relay_ack') return
    expect(result.success).toBe(true)
    expect(result.consumed).toBe(12)
  })

  test('parses relay NACK frame (ctrl=0xDC)', () => {
    const result = parseNext(buildRelayNackFrame())

    expect(result.type).toBe('relay_ack')
    if (result.type !== 'relay_ack') return
    expect(result.success).toBe(false)
  })

  test('returns incomplete when DL/T 645 frame is truncated', () => {
    const full = buildRelayAckFrame()
    const partial = full.subarray(0, 8)
    expect(parseNext(partial)).toEqual({ type: 'incomplete' })
  })

  test('parses energy report frame and decodes values correctly', () => {
    const result = parseNext(buildEnergyFrame())

    expect(result.type).toBe('energy')
    if (result.type !== 'energy') return
    expect(result.data.voltageA).toBeCloseTo(220.0, 1)
    expect(result.data.currentA).toBeCloseTo(5.0, 2)
    expect(result.data.activePowerW).toBeCloseTo(500.0, 1)
    expect(result.data.balanceKwh).toBeCloseTo(10.5, 2)
    expect(result.data.totalEnergyKwh).toBeCloseTo(100.0, 2)
    expect(result.data.signal).toBe(0x13)
    expect(result.data.relayState).toBe('ON')
  })

  test('processes remaining buffer after consuming a frame', () => {
    const heartbeat = Buffer.from([0x11, 0x11, 0x11, 0x11, 0x11, 0x11])
    const ack = buildRelayAckFrame()
    const combined = Buffer.concat([ack, heartbeat])

    const r1 = parseNext(combined)
    expect(r1.type).toBe('relay_ack')
    if (r1.type !== 'relay_ack') return

    const remaining = combined.subarray(r1.consumed)
    const r2 = parseNext(remaining)
    expect(r2.type).toBe('heartbeat')
  })
})
