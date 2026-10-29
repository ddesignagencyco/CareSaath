import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export const LOGIN_AUDIENCES = ['CUSTOMER', 'CAREGIVER', 'ADMIN'] as const;
export type LoginAudience = (typeof LOGIN_AUDIENCES)[number];

export const SIGNUP_ROLES = ['CUSTOMER', 'CAREGIVER'] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

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

  @ApiPropertyOptional({
    enum: LOGIN_AUDIENCES,
    description:
      'App the user is signing in to. ADMIN never creates accounts and requires an ADMIN user; CUSTOMER requires a customer account; CAREGIVER accepts a caregiver or a not-yet-registered customer account. A mismatch is refused (403) without issuing tokens.',
  })
  @IsOptional()
  @IsIn(LOGIN_AUDIENCES)
  audience?: LoginAudience;
}

export class SignupDto {
  @ApiProperty({
    example: '+923001110099',
    description: 'Pakistani mobile number with country code. Rejected with 409 if already registered.',
  })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;

  @ApiProperty({ example: 'Ayesha Khan', description: 'Full name for the new account' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ example: 'ayesha@example.com', description: 'Optional email on file from the start' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    enum: SIGNUP_ROLES,
    description: 'Account type to create. A CAREGIVER signup starts a caregiver-pending account; the caregiver still completes onboarding via POST /caregiver/register.',
  })
  @IsIn(SIGNUP_ROLES)
  role!: SignupRole;
}

export class SignupVerifyDto {
  @ApiProperty({ example: '+923001110099', description: 'Phone number that started the sign-up.' })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;

  @ApiProperty({ example: '123456', description: '6-digit SIGNUP-purpose OTP code.' })
  @IsString()
  @Length(4, 8)
  code!: string;
}

export class RequestPhoneChangeDto {
  @ApiProperty({
    example: '+923009990001',
    description: 'New phone number to move the account to. Rejected with 409 if already registered to another account.',
  })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'newPhone must be a valid phone number (e.g. +923001234567)',
  })
  newPhone!: string;
}

export class VerifyPhoneChangeDto {
  @ApiProperty({ example: '123456', description: 'CHANGE_PHONE-purpose OTP sent to the new number.' })
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
