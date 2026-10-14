import { IsString, Matches, MaxLength } from 'class-validator';
export class CreateTextDto {
  @IsString() @Matches(/\S/) @MaxLength(200) title!: string;
  @IsString() @Matches(/\S/) @MaxLength(50000) body!: string;
}
