import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import { OtpPurpose, UserStatus, UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { ConfigService } from '../config/platform-config.module.js';
import { SmsService } from './sms.service.js';

const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_SECONDS = 600;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

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

  async verifyOtp(phone: string, code: string): Promise<TokenPair> {
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

    await this.redis.client.del(key, `${key}:attempts`);
    await this.prisma.otpCode.updateMany({
      where: { phone, purpose: 'LOGIN', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: UserRole.CUSTOMER },
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.role, user.phone);
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

  private async issueTokens(
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
