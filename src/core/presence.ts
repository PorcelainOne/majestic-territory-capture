import { isId } from './config.js';
import { InvalidPlayerError } from './errors.js';
import type { IPlayer, Vec2 } from './types.js';

export function copyPlayer(value: unknown): IPlayer {
  if (value === null || typeof value !== 'object')
    throw new InvalidPlayerError('Expected player object');
  const player = value as Partial<IPlayer>;
  if (
    !isId(player.id) ||
    !isId(player.factionId) ||
    !player.position ||
    !Number.isFinite(player.position.x) ||
    !Number.isFinite(player.position.y)
  ) {
    throw new InvalidPlayerError(
      'Player requires nonempty id/factionId and finite coordinates',
    );
  }
  return {
    id: player.id,
    factionId: player.factionId,
    position: { x: player.position.x, y: player.position.y },
  };
}

export function playerSnapshot(input: readonly IPlayer[]): IPlayer[] {
  if (!Array.isArray(input))
    throw new InvalidPlayerError('Expected player array');
  const seen = new Set<string>();
  return input.map((value) => {
    const player = copyPlayer(value);
    if (seen.has(player.id))
      throw new InvalidPlayerError(`Duplicate player id: ${player.id}`);
    seen.add(player.id);
    return player;
  });
}

export function resolvePresence(
  players: readonly IPlayer[],
  center: Vec2,
  radius: number,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const player of players) {
    const dx = player.position.x - center.x;
    const dy = player.position.y - center.y;
    // hypot avoids overflow/underflow when squaring valid but extreme coordinates.
    if (Math.hypot(dx, dy) <= radius)
      counts.set(player.factionId, (counts.get(player.factionId) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
