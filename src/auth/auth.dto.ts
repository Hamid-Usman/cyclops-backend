import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({
    example: 'at-least-8-characters',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'User Name', maxLength: 80 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  displayName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({
    example: 'at-least-8-characters',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class GoogleTokenDto {
  @ApiProperty({
    description:
      'Google ID token (the `credential` from Google Identity Services, or the `idToken` from a Google Sign-In SDK)',
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken: string;
}
