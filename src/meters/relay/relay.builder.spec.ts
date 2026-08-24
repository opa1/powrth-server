import { buildRelayFrame } from './relay.builder'

describe('buildRelayFrame', () => {
  test('TRIP frame ends with 0x16', () => {
    const frame = buildRelayFrame('111111111111', 'TRIP')
    expect(frame[frame.length - 1]).toBe(0x16)
  })

  test('CLOSE frame ends with 0x16', () => {
    const frame = buildRelayFrame('111111111111', 'CLOSE')
    expect(frame[frame.length - 1]).toBe(0x16)
  })

  test('frame starts with preamble FE FE FE FE', () => {
    const frame = buildRelayFrame('111111111111', 'TRIP')
    expect([...frame.subarray(0, 4)]).toEqual([0xfe, 0xfe, 0xfe, 0xfe])
  })

  test('frame has control byte 0x1C', () => {
    const frame = buildRelayFrame('111111111111', 'TRIP')
    // preamble(4) + 0x68(1) + addr(6) + 0x68(1) + ctrl(1)
    expect(frame[4 + 1 + 6 + 1]).toBe(0x1c)
  })

  test('TRIP N1 byte is 0x4D (0x1A + 0x33)', () => {
    const frame = buildRelayFrame('111111111111', 'TRIP')
    // preamble(4) + 0x68(1) + addr(6) + 0x68(1) + ctrl(1) + L(1) + PA(1)+P(3)+C(4) = 8 data bytes before N1
    const n1Offset = 4 + 1 + 6 + 1 + 1 + 1 + 8
    expect(frame[n1Offset]).toBe(0x4d)
  })

  test('CLOSE N1 byte is 0x4E (0x1B + 0x33)', () => {
    const frame = buildRelayFrame('111111111111', 'CLOSE')
    const n1Offset = 4 + 1 + 6 + 1 + 1 + 1 + 8
    expect(frame[n1Offset]).toBe(0x4e)
  })

  test('checksum is correct for known meter address', () => {
    const frame = buildRelayFrame('111111111111', 'CLOSE')
    const core = frame.subarray(4, frame.length - 2)
    const expectedCS = core.reduce((s, b) => (s + b) & 0xff, 0)
    const actualCS = frame[frame.length - 2]
    expect(actualCS).toBe(expectedCS)
  })

  test('different meter addresses produce different checksums', () => {
    const f1 = buildRelayFrame('111111111111', 'TRIP')
    const f2 = buildRelayFrame('202108100034', 'TRIP')
    expect(f1[f1.length - 2]).not.toBe(f2[f2.length - 2])
  })
})
