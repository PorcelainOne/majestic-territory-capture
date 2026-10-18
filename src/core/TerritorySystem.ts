import { resolveConfig, isId } from './config.js';
import type { SimulationConfig } from './config.js';
import { ReentrantCallError, UnknownZoneError } from './errors.js';
import { EventBus } from './EventBus.js';
import type { HandlerErrorCallback } from './EventBus.js';
import { FactionLedger } from './FactionLedger.js';
import { playerSnapshot, resolvePresence } from './presence.js';
import { Zone } from './Zone.js';
import type {
  IPlayerSource,
  IZoneState,
  TerritoryEvent,
  TerritoryEvents,
} from './types.js';

export class TerritorySystem {
  private readonly zones: Map<string, Zone>;
  private readonly ledger = new FactionLedger();
  private readonly events: EventBus;
  private busy = false;
  private tickNumber = 0;

  constructor(
    config: SimulationConfig,
    private readonly players: IPlayerSource,
    options: { onHandlerError?: HandlerErrorCallback } = {},
  ) {
    this.zones = new Map(
      resolveConfig(config).map((config) => [config.id, new Zone(config)]),
    );
    this.events = new EventBus(options.onHandlerError);
  }

  get currentTick(): number {
    return this.tickNumber;
  }
  getZones(): IZoneState[] {
    return [...this.zones.values()].map((zone) => zone.snapshot());
  }
  getZone(zoneId: string): IZoneState | null {
    return this.zones.get(zoneId)?.snapshot() ?? null;
  }
  getFactionScores(): Record<string, number> {
    return this.ledger.snapshot();
  }
  on<E extends keyof TerritoryEvents>(
    event: E,
    handler: (payload: TerritoryEvents[E]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  tick(): void {
    this.exclusive(() => {
      const nextTick = this.tickNumber + 1;
      if (!Number.isSafeInteger(nextTick))
        throw new RangeError('Tick exceeds safe integer range');
      const players = playerSnapshot(this.players.getPlayers());
      const scores = this.ledger.draft();
      const events: TerritoryEvent[] = [];
      const drafts = [...this.zones.values()].map((zone) => {
        const draft = zone.plan(
          resolvePresence(players, zone.config.center, zone.config.radius),
          nextTick,
        );
        events.push(...draft.events);
        if (draft.income !== null) {
          const { factionId, amount } = draft.income;
          const balance = this.ledger.grant(scores, factionId, amount);
          events.push({
            type: 'incomeGranted',
            payload: {
              tick: nextTick,
              zoneId: zone.config.id,
              factionId,
              amount,
              balance,
            },
          });
        }
        return { zone, draft };
      });
      for (const { zone, draft } of drafts) zone.commit(draft);
      this.ledger.commit(scores);
      this.tickNumber = nextTick;
      this.events.dispatch(events);
    });
  }

  setOwner(zoneId: string, factionId: string | null): void {
    this.exclusive(() => {
      const zone = this.zones.get(zoneId);
      if (!zone) throw new UnknownZoneError(zoneId);
      if (factionId !== null && !isId(factionId))
        throw new TypeError('Expected nonempty faction id or null');
      this.events.dispatch(zone.setOwner(factionId, this.tickNumber));
    });
  }

  private exclusive(action: () => void): void {
    if (this.busy) throw new ReentrantCallError();
    this.busy = true;
    try {
      action();
    } finally {
      this.busy = false;
    }
  }
}
