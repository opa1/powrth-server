function bcd(n: number): number {
  return Math.floor(n / 10) * 16 + (n % 10)
}

export function buildRelayFrame(meterAddr: string, action: 'TRIP' | 'CLOSE'): Buffer {
  const addrBytes = (meterAddr.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16))

  const n1 = action === 'TRIP' ? 0x1a : 0x1b

  const expiry = new Date(Date.now() + 60_000)

  const rawBytes = [
    0x00, // PA: cipher level, no auth
    0x00,
    0x00,
    0x00, // P0 P1 P2: password
    0x00,
    0x00,
    0x00,
    0x00, // C0 C1 C2 C3: operator code
    n1,
    bcd(expiry.getSeconds()),
    bcd(expiry.getMinutes()),
    bcd(expiry.getHours()),
    bcd(expiry.getDate()),
    bcd(expiry.getMonth() + 1),
    bcd(expiry.getFullYear() % 100),
  ]

  const dataBytes = rawBytes.map((b) => (b + 0x33) & 0xff)
  const dataLength = dataBytes.length

  const frameCore = [0x68, ...addrBytes, 0x68, 0x1c, dataLength, ...dataBytes]
  const checksum = frameCore.reduce((sum, b) => (sum + b) & 0xff, 0)

  return Buffer.from([0xfe, 0xfe, 0xfe, 0xfe, ...frameCore, checksum, 0x16])
}
