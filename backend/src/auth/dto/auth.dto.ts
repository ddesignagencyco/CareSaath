import { IsString, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'phone must be a valid phone number (e.g. +923001234567)',
  })
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
