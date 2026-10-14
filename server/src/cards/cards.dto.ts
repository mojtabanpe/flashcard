import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
export class CreateCardDto {
  @IsUUID() deck_id!: string;
  @IsString() @MinLength(1) @MaxLength(100000) front!: string;
  @IsString() @MinLength(1) @MaxLength(100000) back!: string;
  @IsOptional() @IsString() @Matches(/^(?:[uU]\d+)?$/) unit?: string;
  @IsOptional() @IsString() @MaxLength(100000) examples?: string;
}
export class UpdateCardDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100000) front?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100000) back?: string;
  @IsOptional() @IsString() @Matches(/^(?:[uU]\d+)?$/) unit?: string;
  @IsOptional() @IsString() @MaxLength(100000) examples?: string;
}
export class ReviewDto {
  @IsIn(['again', 'hard', 'good', 'easy']) rating!:
    'again' | 'hard' | 'good' | 'easy';
}
