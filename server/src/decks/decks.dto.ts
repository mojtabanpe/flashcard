import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class CreateDeckDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsIn(['amber', 'rose', 'sage', 'sky', 'violet', 'clay']) color!: string;
}
export class UpdateDeckDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional()
  @IsIn(['amber', 'rose', 'sage', 'sky', 'violet', 'clay'])
  color?: string;
}
