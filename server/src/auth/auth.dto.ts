import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
export class CredentialsDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(6) @MaxLength(72) password!: string;
}
