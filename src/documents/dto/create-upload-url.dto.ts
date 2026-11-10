import { IsInt, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { MAX_DOCUMENT_BYTES } from '../domain/invoice-document.js';

export class CreateUploadUrlDto {
  @IsString()
  @Length(26, 26)
  invoiceId: string;

  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @MaxLength(127)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_BYTES)
  sizeBytes: number;
}
