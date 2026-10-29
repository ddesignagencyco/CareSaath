import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import { OtpPurpose, UserStatus, UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { ConfigService } from '../config/platform-config.module.js';
import type { LoginAudience, SignupRole } from './dto/auth.dto.js';
import { SmsService } from './sms.service.js';

const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_SECONDS = 600;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: { id: string; phone: string; role: UserRole; fullName: string | null };
}

/** Roles each login audience may sign in with. */
const AUDIENCE_ROLES: Record<LoginAudience, UserRole[]> = {
  CUSTOMER: [UserRole.CUSTOMER],
  // A customer account becomes a caregiver through POST /caregiver/register.
  CAREGIVER: [UserRole.CAREGIVER, UserRole.CUSTOMER],
  ADMIN: [UserRole.ADMIN],
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  private async otpTtlSeconds(): Promise<number> {
    return this.config.getNumber('otp.ttlSeconds');
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private otpKey(phone: string, purpose: OtpPurpose): string {
    return `otp:${purpose}:${phone}`;
  }

  private signupPendingKey(phone: string): string {
    return `signup:pending:${phone}`;
  }

  /** Shared OTP check: looks up the stored hash, enforces the attempt limit, and verifies the code. */
  private async checkOtp(phone: string, code: string, purpose: OtpPurpose): Promise<string> {
    const key = this.otpKey(phone, purpose);
    const stored = await this.redis.client.get(key);
    if (!stored) {
      throw new UnauthorizedException('OTP expired or not requested');
    }
    const attempts = await this.redis.client.incr(`${key}:attempts`);
    if (attempts === 1) {
      await this.redis.client.expire(`${key}:attempts`, await this.otpTtlSeconds());
    }
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.client.del(key, `${key}:attempts`);
      throw new ForbiddenException('Too many attempts, request a new OTP');
    }
    if (stored !== this.hash(code)) {
      throw new UnauthorizedException('Invalid OTP');
    }
    return key;
  }

  async requestOtp(phone: string): Promise<{ ttlSeconds: number }> {
    const rateKey = `otp:rl:${phone}`;
    const used = await this.redis.client.incr(rateKey);
    if (used === 1) {
      await this.redis.client.expire(rateKey, OTP_REQUEST_WINDOW_SECONDS);
    }
    if (used > OTP_REQUEST_LIMIT) {
      throw new ForbiddenException('Too many OTP requests, try again later');
    }

    const code = randomInt(100000, 999999).toString();
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    const ttlSeconds = await this.otpTtlSeconds();
    await this.prisma.otpCode.create({
      data: {
        userId: existing?.id ?? null,
        phone,
        codeHash: this.hash(code),
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    await this.redis.client.set(
      this.otpKey(phone, 'LOGIN'),
      this.hash(code),
      'EX',
      ttlSeconds,
    );
    await this.sms.sendOtp(phone, code);
    return { ttlSeconds };
  }

  /**
   * Login only: requires an existing account (phone is the login identity).
   * Signing up with an unregistered number is a separate flow (`signup` /
   * `signupVerify`) so the two can never be conflated into one find-or-create.
   */
  async verifyOtp(phone: string, code: string, audience?: LoginAudience): Promise<LoginResult> {
    const key = this.otpKey(phone, 'LOGIN');
    const stored = await this.redis.client.get(key);
    if (!stored) {
      throw new UnauthorizedException('OTP expired or not requested');
    }

    const attempts = await this.redis.client.incr(`${key}:attempts`);
    if (attempts === 1) {
      await this.redis.client.expire(`${key}:attempts`, await this.otpTtlSeconds());
    }
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.client.del(key, `${key}:attempts`);
      throw new ForbiddenException('Too many attempts, request a new OTP');
    }

    if (stored !== this.hash(code)) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new NotFoundException('No account found with this number. Please sign up.');
    }
    if (audience && !AUDIENCE_ROLES[audience].includes(user.role)) {
      // Refuse before the OTP is consumed or tokens are issued.
      throw new ForbiddenException('This account cannot sign in to this app');
    }

    await this.redis.client.del(key, `${key}:attempts`);
    await this.prisma.otpCode.updateMany({
      where: { phone, purpose: 'LOGIN', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.role, user.phone);
    return {
      ...tokens,
      user: { id: user.id, phone: user.phone, role: user.role, fullName: user.fullName },
    };
  }

  /** Starts a sign-up: rejects an already-registered phone, then sends a SIGNUP-purpose OTP. */
  async signup(dto: { phone: string; fullName: string; email?: string; role: SignupRole }): Promise<{ ttlSeconds: number }> {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('This number is already registered');
    }

    const rateKey = `otp:rl:${dto.phone}`;
    const used = await this.redis.client.incr(rateKey);
    if (used === 1) {
      await this.redis.client.expire(rateKey, OTP_REQUEST_WINDOW_SECONDS);
    }
    if (used > OTP_REQUEST_LIMIT) {
      throw new ForbiddenException('Too many OTP requests, try again later');
    }

    const code = randomInt(100000, 999999).toString();
    const ttlSeconds = await this.otpTtlSeconds();
    await this.prisma.otpCode.create({
      data: {
        userId: null,
        phone: dto.phone,
        codeHash: this.hash(code),
        purpose: OtpPurpose.SIGNUP,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    await this.redis.client.set(this.otpKey(dto.phone, OtpPurpose.SIGNUP), this.hash(code), 'EX', ttlSeconds);
    await this.redis.client.set(
      this.signupPendingKey(dto.phone),
      JSON.stringify({ fullName: dto.fullName, email: dto.email ?? null, role: dto.role }),
      'EX',
      ttlSeconds,
    );
    await this.sms.sendOtp(dto.phone, code);
    return { ttlSeconds };
  }

  /** Completes a sign-up: verifies the SIGNUP OTP and creates the account with the role chosen at signup. */
  async signupVerify(phone: string, code: string): Promise<LoginResult> {
    const key = await this.checkOtp(phone, code, OtpPurpose.SIGNUP);

    const pendingRaw = await this.redis.client.get(this.signupPendingKey(phone));
    if (!pendingRaw) {
      throw new BadRequestException('Signup session expired, please sign up again');
    }
    const pending = JSON.parse(pendingRaw) as { fullName: string; email: string | null; role: SignupRole };

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('This number is already registered');
    }

    await this.redis.client.del(key, `${key}:attempts`, this.signupPendingKey(phone));
    await this.prisma.otpCode.updateMany({
      where: { phone, purpose: OtpPurpose.SIGNUP, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          phone,
          fullName: pending.fullName,
          ...(pending.email ? { email: pending.email } : {}),
          role: pending.role === 'CAREGIVER' ? UserRole.CAREGIVER : UserRole.CUSTOMER,
          lastLoginAt: new Date(),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }

    const tokens = await this.issueTokens(user.id, user.role, user.phone);
    return {
      ...tokens,
      user: { id: user.id, phone: user.phone, role: user.role, fullName: user.fullName },
    };
  }

  private changePhoneKey(userId: string): string {
    return `otp:${OtpPurpose.CHANGE_PHONE}:${userId}`;
  }

  /**
   * Phone is the login identity, so changing it goes through its own
   * CHANGE_PHONE-purpose OTP sent to the *new* number — the account isn't
   * moved until that number is proven reachable by its owner.
   */
  async requestPhoneChange(userId: string, newPhone: string): Promise<{ ttlSeconds: number }> {
    const existing = await this.prisma.user.findUnique({ where: { phone: newPhone } });
    if (existing) {
      throw new ConflictException('This number is already registered');
    }
    const rateKey = `otp:rl:${newPhone}`;
    const used = await this.redis.client.incr(rateKey);
    if (used === 1) {
      await this.redis.client.expire(rateKey, OTP_REQUEST_WINDOW_SECONDS);
    }
    if (used > OTP_REQUEST_LIMIT) {
      throw new ForbiddenException('Too many OTP requests, try again later');
    }

    const code = randomInt(100000, 999999).toString();
    const ttlSeconds = await this.otpTtlSeconds();
    await this.prisma.otpCode.create({
      data: {
        userId,
        phone: newPhone,
        codeHash: this.hash(code),
        purpose: OtpPurpose.CHANGE_PHONE,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    await this.redis.client.set(
      this.changePhoneKey(userId),
      JSON.stringify({ phone: newPhone, codeHash: this.hash(code) }),
      'EX',
      ttlSeconds,
    );
    await this.sms.sendOtp(newPhone, code);
    return { ttlSeconds };
  }

  async verifyPhoneChange(userId: string, code: string): Promise<{ phone: string }> {
    const key = this.changePhoneKey(userId);
    const stored = await this.redis.client.get(key);
    if (!stored) {
      throw new UnauthorizedException('OTP expired or not requested');
    }
    const { phone, codeHash } = JSON.parse(stored) as { phone: string; codeHash: string };

    const attempts = await this.redis.client.incr(`${key}:attempts`);
    if (attempts === 1) {
      await this.redis.client.expire(`${key}:attempts`, await this.otpTtlSeconds());
    }
    if (attempts > OTP_MAX_ATTEMPTS) {
      await this.redis.client.del(key, `${key}:attempts`);
      throw new ForbiddenException('Too many attempts, request a new OTP');
    }
    if (codeHash !== this.hash(code)) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('This number is already registered');
    }

    await this.redis.client.del(key, `${key}:attempts`);
    await this.prisma.otpCode.updateMany({
      where: { userId, purpose: OtpPurpose.CHANGE_PHONE, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { phone } });
    return { phone: updated.phone };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    // Rotating refresh tokens with a Redis deny-list for used tokens.
    const denyKey = `jwt:deny:${refreshToken}`;
    const denied = await this.redis.client.get(denyKey);
    if (denied) {
      throw new UnauthorizedException('Refresh token already used');
    }
    let payload: { sub: string; role: UserRole; phone: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env['JWT_REFRESH_SECRET'],
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
    await this.redis.client.set(denyKey, '1', 'EX', REFRESH_TOKEN_TTL_SECONDS);
    return this.issueTokens(user.id, user.role, user.phone);
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    if (refreshToken) {
      await this.redis.client.set(
        `jwt:deny:${refreshToken}`,
        '1',
        'EX',
        REFRESH_TOKEN_TTL_SECONDS,
      );
    }
    return { ok: true };
  }

  /** Mint a token pair from the user's current role (used after a role change). */
  async issueTokens(
    userId: string,
    role: UserRole,
    phone: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role, phone, type: 'access' },
      {
        secret: process.env['JWT_ACCESS_SECRET'],
        expiresIn: Number(process.env['JWT_ACCESS_TTL_SECONDS'] ?? 900),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, role, phone, type: 'refresh' },
      {
        secret: process.env['JWT_REFRESH_SECRET'],
        expiresIn: Number(process.env['JWT_REFRESH_TTL_SECONDS'] ?? REFRESH_TOKEN_TTL_SECONDS),
      },
    );
    return { accessToken, refreshToken };
  }

  /** Guard helper: reject suspended users on privileged actions. */
  assertActive(status: UserStatus): void {
    if (status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Account is not active');
    }
  }
}
