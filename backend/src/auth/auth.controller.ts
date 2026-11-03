import { BadRequestException, Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import {
  FirebaseVerifyDto,
  RefreshTokenDto,
  RequestOtpDto,
  SignupDto,
  SignupVerifyDto,
  VerifyOtpDto,
} from './dto/auth.dto.js';
import { clearAuthCookies, COOKIE, makeCsrfToken, readCookie, roleFromAccessToken, setAuthCookies } from './cookies.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Set the WEB session as httpOnly cookies (access + refresh) plus the readable
   * cs_session / cs_csrf flags. The native app ignores these and uses the tokens
   * returned in the response body with `Authorization: Bearer`.
   */
  private issueSession(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
    setAuthCookies(res, tokens, makeCsrfToken(), roleFromAccessToken(tokens.accessToken));
  }

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request login OTP',
    description:
      'Generates a 6-digit one-time password and sends it via SMS gateway (captured locally in MailHog at http://localhost:18025). Rate limited to 3 requests per 10 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP successfully generated and sent.',
    schema: { example: { ok: true, ttlSeconds: 300 } },
  })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify OTP & obtain JWT tokens',
    description:
      'Validates the 6-digit OTP code against the phone number. Returns a short-lived access token and a rotating refresh token with user profile info.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified; returns JWT access & refresh tokens.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 'b5e1a234-5678-90ab-cdef-1234567890ab',
          phone: '+923001110001',
          role: 'CUSTOMER',
          fullName: 'Ayesha Khan',
        },
      },
    },
  })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.verifyOtp(dto.phone, dto.code, dto.audience);
    this.issueSession(res, result);
    return result;
  }

  @Public()
  @Post('signup')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start sign-up',
    description:
      'Creates a pending sign-up for a new phone number and sends a SIGNUP-purpose OTP. Returns 409 if the number is already registered (sign in instead).',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent to complete the sign-up.',
    schema: { example: { ttlSeconds: 300 } },
  })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('signup/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete sign-up & obtain JWT tokens',
    description:
      'Verifies the SIGNUP OTP and creates the account with the role chosen at POST /auth/signup. Returns JWT access & refresh tokens.',
  })
  async signupVerify(@Body() dto: SignupVerifyDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.signupVerify(dto.phone, dto.code);
    this.issueSession(res, result);
    return result;
  }

  @Public()
  @Post('firebase/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in or sign up with a Firebase phone-auth ID token',
    description:
      'The client sends its own OTP via the Firebase SDK and confirms it there; this only verifies the resulting ID token. ' +
      'First time this phone number is seen, fullName + role create the account (like POST /auth/signup/verify); ' +
      'after that they are ignored and this behaves like POST /auth/otp/verify.',
  })
  async firebaseVerify(@Body() dto: FirebaseVerifyDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.firebaseAuth(
      dto.idToken,
      { fullName: dto.fullName, email: dto.email, role: dto.role },
      dto.audience,
    );
    this.issueSession(res, result);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchanges a valid refresh token for a new access token and rotated refresh token.',
  })
  @ApiResponse({
    status: 200,
    description: 'New tokens issued.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Web sends the refresh token as an httpOnly cookie; native sends it in the body.
    const refreshToken = dto.refreshToken ?? readCookie(req, COOKIE.refresh);
    if (!refreshToken) throw new BadRequestException('Missing refresh token');
    const result = await this.auth.refresh(refreshToken);
    this.issueSession(res, result);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Logout & invalidate tokens',
    description: 'Adds the refresh token to the Redis deny-list to revoke the session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session revoked.',
    schema: { example: { ok: true } },
  })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? readCookie(req, COOKIE.refresh);
    clearAuthCookies(res);
    if (!refreshToken) return { ok: true };
    return this.auth.logout(refreshToken);
  }
}
