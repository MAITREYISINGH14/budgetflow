import { Pipe, PipeTransform } from '@angular/core';
import { formatDisplayDate } from '../../core/utils/dates';

@Pipe({ name: 'displayDate' })
export class DisplayDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? formatDisplayDate(value) : '';
  }
}
