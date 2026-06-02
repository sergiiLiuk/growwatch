import { Pipe, PipeTransform } from '@angular/core';
import { formatTemp, formatHumidity } from '../../core/utils/format';

@Pipe({ name: 'gwTemp', standalone: true })
export class TempPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 1): string {
    return formatTemp(value, digits);
  }
}

@Pipe({ name: 'gwHumidity', standalone: true })
export class HumidityPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 1): string {
    return formatHumidity(value, digits);
  }
}
