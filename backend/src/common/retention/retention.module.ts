import {
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformConfigModule, ConfigService } from '../../config/platform-config.module.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 60;

export interface RetentionResult {
  expiredOtps: number;
  consumedOtps: number;
  oldNotifications: number;
}

/**
 * Data retention (SRS §6 Data lifecycle). Periodically purges short-lived
 * records: expired login/check-in OTPs, already-consumed OTPs and delivered
 * notifications past their retention window. Interval and windows are tunable
 * via platform config / env; the job is disabled when RETENTION_ENABLED=false.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env['RETENTION_ENABLED'] === 'false') {
      this.logger.log('Retention job disabled (RETENTION_ENABLED=false)');
      return;
    }
    const minutes = Number(process.env['RETENTION_INTERVAL_MINUTES'] ?? DEFAULT_INTERVAL_MINUTES);
    const intervalMs = Math.max(1, minutes) * 60 * 1000;
    this.timer = setInterval(() => {
      void this.run();
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`Retention job scheduled every ${minutes} minute(s)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Run one cleanup pass. Returns counts; safe to call directly (e.g. tests). */
  async run(now = new Date()): Promise<RetentionResult> {
    const notificationDays = await this.config.getNumber('retention.notificationDays');
    const notificationCutoff = new Date(now.getTime() - notificationDays * DAY_MS);

    const [expiredOtps, consumedOtps, oldNotifications] = await this.prisma.$transaction([
      this.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.otpCode.deleteMany({ where: { consumedAt: { not: null } } }),
      this.prisma.notification.deleteMany({
        where: {
          createdAt: { lt: notificationCutoff },
          status: { in: ['SENT', 'FAILED'] },
        },
      }),
    ]);

    const result: RetentionResult = {
      expiredOtps: expiredOtps.count,
      consumedOtps: consumedOtps.count,
      oldNotifications: oldNotifications.count,
    };
    if (result.expiredOtps || result.consumedOtps || result.oldNotifications) {
      this.logger.log(
        `Retention pass: ${result.expiredOtps} expired OTPs, ${result.consumedOtps} consumed OTPs, ${result.oldNotifications} notifications`,
      );
    }
    return result;
  }
}

@Module({
  imports: [PlatformConfigModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
