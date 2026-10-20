import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    example: '+923001110001',
    description:
      'Pakistani mobile number with country code. Demo accounts: Admin (+923000000000), Customer (+923001110001), Caregiver (+923001110011).',
  })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    example: '+923001110001',
    description: 'Phone number that requested the OTP.',
  })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;

  @ApiProperty({
    example: '123456',
    description:
      '6-digit OTP code received via SMS / captured in MailHog at http://localhost:18025 / server logs.',
  })
  @IsString()
  @Length(4, 8)
  code!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'JWT refresh token obtained from /auth/otp/verify.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  refreshToken!: string;
}
