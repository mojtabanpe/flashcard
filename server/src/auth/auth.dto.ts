import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export class CredentialsDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(6) @MaxLength(72) password!: string;
}
export class ChangePasswordDto {
  @IsString() @MaxLength(128) current_password!: string;
  @IsString() @MinLength(6) @MaxLength(72) new_password!: string;
}
export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class ResetPasswordDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
  @IsString() @MinLength(6) @MaxLength(72) password!: string;
}
