import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import {
  RefreshTokenDto,
  RequestOtpDto,
  SignupDto,
  SignupVerifyDto,
  VerifyOtpDto,
} from './dto/auth.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request login OTP',
    description:
      'Generates a 6-digit one-time password and sends it via SMS gateway (logged in the server console in local development). Rate limited to 3 requests per 10 minutes.',
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
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.audience);
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
  signupVerify(@Body() dto: SignupVerifyDto) {
    return this.auth.signupVerify(dto.phone, dto.code);
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
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
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
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
