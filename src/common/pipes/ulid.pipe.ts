import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

@Injectable()
export class UlidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!ULID_PATTERN.test(value)) throw new BadRequestException(`"${value}" is not a valid id`);
    return value;
  }
}
