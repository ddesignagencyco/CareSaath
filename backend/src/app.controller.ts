import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';
import { PrismaService } from './common/prisma/prisma.service.js';
import { RedisService } from './common/redis/redis.module.js';

@ApiTags('System & Health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/html')
  root() {
    return `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CareSaath API | Status</title>
  <meta name="description" content="CareSaath API status and health overview">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <style>
    :root {
      --bg: radial-gradient(1200px 800px at 50% 0%, #1a2142 0%, #0b1026 55%, #070b1a 100%);
      --card: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
      --border: rgba(138, 180, 255, 0.25);
      --text-primary: #f8fafc;
      --text-secondary: #cbd5f5;
      --text-tertiary: #94a3b8;
      --accent: #22c55e;
      --accent-glow: rgba(34, 197, 94, 0.25);
      --link: #8ab4ff;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background: var(--bg);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      position: relative;
      overflow: hidden;
    }

    body::before,
    body::after {
      content: "";
      position: absolute;
      width: 420px;
      height: 420px;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.4;
      pointer-events: none;
    }

    body::before {
      top: -160px;
      left: -160px;
      background: radial-gradient(circle, rgba(138, 180, 255, 0.28), transparent);
    }

    body::after {
      bottom: -220px;
      right: -180px;
      background: radial-gradient(circle, rgba(34, 197, 94, 0.18), transparent);
    }

    main {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      text-align: center;
      z-index: 1;
      width: min(680px, 100%);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 18px;
      border-radius: 999px;
      border: 1px solid rgba(34, 197, 94, 0.45);
      background: radial-gradient(circle, rgba(34, 197, 94, 0.18) 0%, transparent 70%);
      text-transform: uppercase;
      letter-spacing: 0.28em;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .pulse {
      position: relative;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 0 var(--accent-glow);
      animation: pulse 2.6s infinite;
    }

    .pulse::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      box-shadow: 0 0 0 8px transparent;
    }

    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
      }
    }

    .hero {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .hero__title {
      font-size: clamp(2.8rem, 6vw, 5rem);
      font-weight: 700;
      letter-spacing: -0.08em;
    }

    .hero__subtitle {
      margin: 0 auto;
      max-width: 520px;
      font-size: clamp(1rem, 1.6vw, 1.08rem);
      color: var(--text-tertiary);
    }

    .card {
      position: relative;
      width: min(640px, 100%);
      border-radius: 18px;
      border: 1px solid var(--border);
      background: var(--card);
      backdrop-filter: blur(18px) saturate(120%);
      -webkit-backdrop-filter: blur(18px) saturate(120%);
      box-shadow: 0 60px 120px -80px rgba(138, 180, 255, 0.45);
      overflow: hidden;
    }

    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(600px 200px at 50% 0%, rgba(138, 180, 255, 0.12), transparent);
      pointer-events: none;
    }

    .card__inner {
      position: relative;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1px;
      background: radial-gradient(circle, rgba(138, 180, 255, 0.18), transparent);
    }

    .card__item {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      text-align: center;
      padding: clamp(20px, 4vw, 28px);
      background: radial-gradient(400px 140px at 50% 0%, rgba(248, 250, 252, 0.01), transparent);
    }

    .card__item-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      border: 1px solid rgba(138, 180, 255, 0.4);
      background: radial-gradient(circle, rgba(138, 180, 255, 0.18), transparent);
      color: var(--link);
    }

    .card__label {
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .card__desc {
      font-size: 0.98rem;
      color: var(--text-tertiary);
    }

    .card__link {
      margin-top: 4px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 18px;
      border-radius: 999px;
      border: 1px solid transparent;
      color: var(--link);
      font-weight: 500;
      text-decoration: none;
      transition: all 180ms ease;
    }

    .card__link:hover {
      color: var(--text-primary);
      border-color: rgba(138, 180, 255, 0.5);
      background: radial-gradient(circle, rgba(138, 180, 255, 0.16), transparent);
    }

    .card__link i {
      transition: transform 180ms ease;
    }

    .card__link:hover i {
      transform: translateX(4px);
    }

    footer {
      position: relative;
      z-index: 1;
      margin-top: 28px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--text-tertiary);
      font-size: 0.95rem;
    }

    footer__meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .divider {
      opacity: 0.4;
    }

    @media (max-width: 640px) {
      .card__inner {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>
  <main>
    <div class="badge">
      <span class="pulse"></span>
      <span>All Systems Operational</span>
    </div>
    <div class="hero">
      <h1 class="hero__title">CareSaath API</h1>
      <p class="hero__subtitle">Secure, reliable and production-ready backend powering the CareSaath home nursing &
        physiotherapy marketplace.</p>
    </div>
    <div class="card">
      <div class="card__inner">
        <article class="card__item">
          <div class="card__item-header">
            <div class="card__icon">
              <i class="bi bi-heart-pulse"></i>
            </div>
            <span class="card__label">Health Probe</span>
          </div>
          <p class="card__desc">Instant liveness & readiness check</p>
          <a class="card__link" href="/health">Check status <i class="bi bi-arrow-right"></i></a>
        </article>
        <article class="card__item">
          <div class="card__item-header">
            <div class="card__icon">
              <i class="bi bi-journal-text"></i>
            </div>
            <span class="card__label">API Reference</span>
          </div>
          <p class="card__desc">Interactive Swagger documentation</p>
          <a class="card__link" href="/docs">Open docs <i class="bi bi-arrow-right"></i></a>
        </article>
        <article class="card__item">
          <div class="card__item-header">
            <div class="card__icon">
              <i class="bi bi-code-slash"></i>
            </div>
            <span class="card__label">REST Endpoints</span>
          </div>
          <p class="card__desc">Base path for all versioned routes</p>
          <a class="card__link" href="/api/v1">Explore /api/v1 <i class="bi bi-arrow-right"></i></a>
        </article>
      </div>
    </div>
  </main>
  <footer>
    <div class="footer__meta">
      <span>CareSaath</span>
      <span class="divider">•</span>
      <span>Backend Infrastructure</span>
      <span class="divider">•</span>
      <span>https://caresaath-api.onrender.com</span>
    </div>
    <span>Built for dependable home healthcare</span>
  </footer>
</body>

</html>`;
  }

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 as soon as the process is accepting requests. It deliberately does not touch Postgres or Redis, so a slow dependency never causes a restart loop.',
  })
  @ApiResponse({
    status: 200,
    description: 'API process is alive.',
    schema: {
      example: { status: 'ok' },
    },
  })
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks PostgreSQL and Redis. Returns 503 when either dependency is unavailable, so the platform can stop routing traffic to an instance that cannot serve it.',
  })
  @ApiResponse({
    status: 200,
    description: 'Database and cache are reachable.',
    schema: { example: { status: 'ok', checks: { database: 'up', redis: 'up' } } },
  })
  @ApiResponse({
    status: 503,
    description: 'One or more dependencies are unavailable.',
    schema: {
      example: { status: 'error', checks: { database: 'down', redis: 'up' } },
    },
  })
  async readiness() {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);
    const checks = {
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
    };
    if (!database || !redis) {
      throw new ServiceUnavailableException({ status: 'error', checks });
    }
    return { status: 'ok', checks };
  }
}
