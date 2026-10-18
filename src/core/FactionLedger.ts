import { ScoreOverflowError } from './errors.js';

export class FactionLedger {
  private scores = new Map<string, number>();

  draft(): Map<string, number> {
    return new Map(this.scores);
  }

  grant(draft: Map<string, number>, factionId: string, amount: number): number {
    const balance = (draft.get(factionId) ?? 0) + amount;
    if (!Number.isSafeInteger(balance)) throw new ScoreOverflowError(factionId);
    draft.set(factionId, balance);
    return balance;
  }

  commit(draft: Map<string, number>): void {
    this.scores = draft;
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.scores);
  }
}
