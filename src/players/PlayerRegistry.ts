import { copyPlayer } from '../core/presence.js';
import type { IPlayer, IPlayerSource } from '../core/types.js';

export class PlayerRegistry implements IPlayerSource {
  private readonly players = new Map<string, IPlayer>();

  upsert(player: IPlayer): void {
    const copy = copyPlayer(player);
    this.players.set(copy.id, copy);
  }

  remove(playerId: string): boolean {
    return this.players.delete(playerId);
  }

  getPlayers(): readonly IPlayer[] {
    return [...this.players.values()].map(copyPlayer);
  }
}
