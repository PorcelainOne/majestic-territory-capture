import { CaptureRules } from './CaptureRules.js';
import { PeriodicIncome } from './PeriodicIncome.js';
import type { ResolvedZoneConfig } from './config.js';
import type { IZoneState, TerritoryEvent } from './types.js';

interface ZoneData {
  ownerId: string | null;
  capturingFactionId: string | null;
  progress: number;
  isContested: boolean;
  factionsPresent: Record<string, number>;
  ownedSinceTick: number | null;
  ownedTicks: number;
}
export interface ZoneDraft {
  data: ZoneData;
  events: TerritoryEvent[];
  income: { factionId: string; amount: number } | null;
}

export class Zone {
  private readonly effect = new PeriodicIncome();
  private data: ZoneData;

  constructor(readonly config: ResolvedZoneConfig) {
    this.data = {
      ownerId: null,
      capturingFactionId: null,
      progress: 0,
      isContested: false,
      factionsPresent: {},
      ownedSinceTick: null,
      ownedTicks: 0,
    };
    if (config.initialOwner !== null)
      this.assign(this.data, config.initialOwner, 0);
  }

  private release(data: ZoneData): void {
    data.ownerId = null;
    data.ownedSinceTick = null;
    data.ownedTicks = 0;
  }

  private assign(data: ZoneData, factionId: string, tick: number): void {
    data.ownerId = factionId;
    data.ownedSinceTick = tick;
    data.ownedTicks = 0;
    data.progress = 0;
    data.capturingFactionId = null;
  }

  plan(presence: Record<string, number>, tick: number): ZoneDraft {
    const data = structuredClone(this.data);
    const events: TerritoryEvent[] = [];
    const base = { tick, zoneId: this.config.id };
    const factions = Object.keys(presence).sort();
    data.factionsPresent = presence;
    data.isContested = factions.length > 1;
    if (data.isContested !== this.data.isContested) {
      events.push(
        data.isContested
          ? {
              type: 'contestStarted',
              payload: { ...base, factionIds: factions },
            }
          : { type: 'contestEnded', payload: base },
      );
    }
    const capture = CaptureRules.plan(data, presence, this.config.capture);
    data.progress = capture.progress;
    data.capturingFactionId = capture.capturingFactionId;
    let income: ZoneDraft['income'] = null;
    if (capture.capturedBy !== null) {
      const previousOwnerId = data.ownerId;
      if (previousOwnerId !== null) this.release(data);
      this.assign(data, capture.capturedBy, tick);
      events.push(
        {
          type: 'zoneCaptured',
          payload: { ...base, factionId: capture.capturedBy, previousOwnerId },
        },
        {
          type: 'ownerChanged',
          payload: {
            ...base,
            previousOwnerId,
            ownerId: capture.capturedBy,
            reason: 'capture',
          },
        },
      );
    } else if (data.ownerId !== null) {
      const effect = this.effect.plan(data.ownedTicks, this.config.income);
      data.ownedTicks = effect.ownedTicks;
      if (effect.amount !== null)
        income = { factionId: data.ownerId, amount: effect.amount };
    }
    return { data, events, income };
  }

  setOwner(ownerId: string | null, tick: number): TerritoryEvent[] {
    if (ownerId === this.data.ownerId) return [];
    const data = structuredClone(this.data);
    const previousOwnerId = data.ownerId;
    if (previousOwnerId !== null) this.release(data);
    if (ownerId !== null) this.assign(data, ownerId, tick);
    data.progress = 0;
    data.capturingFactionId = null;
    this.data = data;
    return [
      {
        type: 'ownerChanged',
        payload: {
          tick,
          zoneId: this.config.id,
          previousOwnerId,
          ownerId,
          reason: 'manual',
        },
      },
    ];
  }

  commit(draft: ZoneDraft): void {
    this.data = draft.data;
  }

  snapshot(): IZoneState {
    return structuredClone({
      ownerId: this.data.ownerId,
      capturingFactionId: this.data.capturingFactionId,
      progress: this.data.progress,
      isContested: this.data.isContested,
      factionsPresent: this.data.factionsPresent,
      ownedSinceTick: this.data.ownedSinceTick,
      id: this.config.id,
      center: this.config.center,
      radius: this.config.radius,
      threshold: this.config.capture.threshold,
    });
  }
}
