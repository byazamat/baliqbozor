import { Injectable } from '@nestjs/common';

/** Время последнего обработанного heartbeat — показывается в `/health`. */
@Injectable()
export class HeartbeatState {
  private last: Date | null = null;

  beat(at: Date = new Date()): void {
    this.last = at;
  }

  get lastBeatAt(): Date | null {
    return this.last;
  }
}
