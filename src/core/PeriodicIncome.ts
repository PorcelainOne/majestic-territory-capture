import type { IncomeConfig } from './config.js';

export interface IOwnershipEffect {
  plan(
    ownedTicks: number,
    config: IncomeConfig,
  ): { ownedTicks: number; amount: number | null };
}

export class PeriodicIncome implements IOwnershipEffect {
  plan(
    ownedTicks: number,
    config: IncomeConfig,
  ): { ownedTicks: number; amount: number | null } {
    const next = ownedTicks + 1;
    if (!Number.isSafeInteger(next))
      throw new RangeError('Ownership tick counter exceeds safe integer range');
    return {
      ownedTicks: next,
      amount: next % config.intervalTicks === 0 ? config.amount : null,
    };
  }
}
