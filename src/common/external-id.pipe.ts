import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

/** IDs that come from the main site. Letters, digits, dot, dash, underscore. */
export const EXTERNAL_ID = /^[A-Za-z0-9_.-]{1,64}$/;

@Injectable()
export class ExternalIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!EXTERNAL_ID.test(value)) throw new BadRequestException('Bad ID');
    return value;
  }
}
