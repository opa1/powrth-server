import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import * as crypto from 'node:crypto'
import { ConfigService } from '../config/config.service'
import { DatabaseService } from '../database/database.service'
import { UsersService } from '../users/users.service'
import { WalletService } from '../wallet/wallet.service'
import { AuthService } from './auth.service'
import { AppleStrategy } from './strategies/apple.strategy'
import { GoogleStrategy } from './strategies/google.strategy'
import { XStrategy } from './strategies/x.strategy'

describe('AuthService', () => {
  let authService: AuthService
  let usersService: UsersService
  let db: {
    user: {
      findUnique: jest.Mock
      create: jest.Mock
      update: jest.Mock
      aggregate: jest.Mock
    }
    authSession: { create: jest.Mock; findUnique: jest.Mock; delete: jest.Mock }
    provider: { create: jest.Mock }
    consumer: { create: jest.Mock }
    $transaction: jest.Mock
  }
  let walletService: { deriveAddress: jest.Mock }
  let googleStrategy: { verify: jest.Mock }

  beforeEach(async () => {
    db = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      authSession: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      provider: { create: jest.fn() },
      consumer: { create: jest.fn() },
      // UsersService uses the interactive-callback form of $transaction, so
      // invoking the callback with `db` itself makes tx.* calls resolve to
      // the same mocks used for assertions.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
    }
    walletService = { deriveAddress: jest.fn() }
    googleStrategy = { verify: jest.fn() }

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        UsersService,
        { provide: DatabaseService, useValue: db },
        { provide: WalletService, useValue: walletService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: JwtService, useValue: new JwtService({ secret: 'test-secret' }) },
        { provide: GoogleStrategy, useValue: googleStrategy },
        { provide: AppleStrategy, useValue: { verify: jest.fn() } },
        { provide: XStrategy, useValue: { verify: jest.fn() } },
      ],
    }).compile()

    authService = moduleRef.get(AuthService)
    usersService = moduleRef.get(UsersService)
  })

  describe('loginWithGoogle', () => {
    test('new user — creates user, derives wallet, returns tokens', async () => {
      googleStrategy.verify.mockResolvedValue({
        googleId: 'gid_123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://avatar.url',
      })
      db.user.findUnique.mockResolvedValue(null)
      db.user.aggregate.mockResolvedValue({ _max: { walletKeyIndex: null } })
      db.user.create.mockResolvedValue({
        id: 'uid_new',
        googleId: 'gid_123',
        name: 'Test User',
        avatar: 'https://avatar.url',
        email: 'test@example.com',
        walletAddress: 'FakePublicKey123',
        walletKeyIndex: 0,
        role: null,
        isActive: true,
      })
      db.authSession.create.mockResolvedValue({})
      walletService.deriveAddress.mockReturnValue('FakePublicKey123')

      const result = await authService.loginWithGoogle('fake_google_id_token')

      expect(result.user.walletAddress).toBe('FakePublicKey123')
      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
      expect(result.user.isNewUser).toBe(true)
      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ googleId: 'gid_123', walletKeyIndex: 0 }),
        }),
      )
    })

    test('existing user — returns same walletAddress, isNewUser false', async () => {
      const existingUser = {
        id: 'uid_1',
        googleId: 'gid_123',
        walletAddress: 'ExistingKey',
        walletKeyIndex: 3,
        role: 'CONSUMER',
        isActive: true,
        name: 'Test',
        avatar: null,
        email: null,
      }

      googleStrategy.verify.mockResolvedValue({
        googleId: 'gid_123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://avatar.url',
      })
      db.user.findUnique.mockResolvedValue(existingUser)
      db.user.update.mockResolvedValue({
        ...existingUser,
        name: 'Test User',
        avatar: 'https://avatar.url',
      })
      db.authSession.create.mockResolvedValue({})

      const result = await authService.loginWithGoogle('fake_id_token')

      expect(result.user.isNewUser).toBe(false)
      expect(result.user.walletAddress).toBe('ExistingKey')
      expect(db.user.create).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    test('valid token — returns new token pair and invalidates old', async () => {
      const rawToken = 'old_refresh_token'
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const fakeSession = {
        id: 'sess_1',
        userId: 'uid_1',
        refreshTokenHash: tokenHash,
        expiresAt: new Date(Date.now() + 3_600_000),
      }
      const fakeUser = { id: 'uid_1', role: 'PROVIDER', isActive: true }

      db.authSession.findUnique.mockResolvedValue(fakeSession)
      db.user.findUnique.mockResolvedValue(fakeUser)
      db.authSession.delete.mockResolvedValue({})
      db.authSession.create.mockResolvedValue({})

      const result = await authService.refresh(rawToken)

      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
      expect(db.authSession.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sess_1' } }),
      )
    })

    test('expired session — throws UnauthorizedException', async () => {
      const expiredSession = {
        id: 'sess_1',
        userId: 'uid_1',
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
      }
      db.authSession.findUnique.mockResolvedValue(expiredSession)

      await expect(authService.refresh('some_token')).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('UsersService.setRole', () => {
    test('sets role and creates Provider row', async () => {
      const fakeUser = { id: 'uid_1', role: null }
      db.user.findUnique.mockResolvedValue(fakeUser)
      db.user.update.mockResolvedValue({ ...fakeUser, role: 'PROVIDER' })
      db.provider.create.mockResolvedValue({})

      const result = await usersService.setRole('uid_1', 'PROVIDER')

      expect(db.provider.create).toHaveBeenCalled()
      expect(result.role).toBe('PROVIDER')
    })

    test('already set — throws BadRequestException', async () => {
      db.user.findUnique.mockResolvedValue({ id: 'uid_1', role: 'CONSUMER' })

      await expect(usersService.setRole('uid_1', 'PROVIDER')).rejects.toThrow(BadRequestException)
    })
  })
})
