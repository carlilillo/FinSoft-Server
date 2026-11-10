import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class ContinueAnalysisDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Length(26, 26, { each: true })
  emailIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
