export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface IPlayer {
  readonly id: string;
  readonly factionId: string;
  readonly position: Vec2;
}

export interface IPlayerSource {
  getPlayers(): readonly IPlayer[];
}

export interface IZoneState {
  readonly id: string;
  readonly center: Vec2;
  readonly radius: number;
  readonly ownerId: string | null;
  readonly capturingFactionId: string | null;
  readonly progress: number;
  readonly threshold: number;
  readonly isContested: boolean;
  readonly factionsPresent: Readonly<Record<string, number>>;
  readonly ownedSinceTick: number | null;
}

export interface TerritoryEvents {
  zoneCaptured: {
    tick: number;
    zoneId: string;
    factionId: string;
    previousOwnerId: string | null;
  };
  ownerChanged: {
    tick: number;
    zoneId: string;
    previousOwnerId: string | null;
    ownerId: string | null;
    reason: 'capture' | 'manual';
  };
  contestStarted: { tick: number; zoneId: string; factionIds: string[] };
  contestEnded: { tick: number; zoneId: string };
  incomeGranted: {
    tick: number;
    zoneId: string;
    factionId: string;
    amount: number;
    balance: number;
  };
}

export type TerritoryEvent = {
  [E in keyof TerritoryEvents]: { type: E; payload: TerritoryEvents[E] };
}[keyof TerritoryEvents];
