import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { DRILL_ID } from './drill-codes.js';

/** Checks that a path parameter looks like a drill ID, such as "sh-008". */
@Injectable()
export class DrillIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!DRILL_ID.test(value)) {
      throw new BadRequestException('Drill ID must look like "sh-008"');
    }
    return value;
  }
}
