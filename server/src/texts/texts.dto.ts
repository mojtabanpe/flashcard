import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
export class CreateTextDto {
  @IsString() @Matches(/\S/) @MaxLength(200) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(50000) body!: string;
  @IsOptional() @IsBoolean() ai?: boolean;
}
export class ReviewTextDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
