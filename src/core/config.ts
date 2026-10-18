import { ConfigValidationError } from './errors.js';
import type { Vec2 } from './types.js';

export interface CaptureConfig {
  readonly threshold: number;
  readonly gainByPlayers: readonly number[];
  readonly decayPerTick: number;
}
export interface IncomeConfig {
  readonly amount: number;
  readonly intervalTicks: number;
}
export interface ZoneConfig {
  readonly id: string;
  readonly center: Vec2;
  readonly radius: number;
  readonly initialOwner: string | null;
  readonly capture?: Partial<CaptureConfig>;
  readonly income?: Partial<IncomeConfig>;
}
export interface SimulationConfig {
  readonly defaults?: {
    readonly capture?: Partial<CaptureConfig>;
    readonly income?: Partial<IncomeConfig>;
  };
  readonly zones: readonly ZoneConfig[];
}
export interface ResolvedZoneConfig extends Omit<
  ZoneConfig,
  'capture' | 'income'
> {
  readonly capture: CaptureConfig;
  readonly income: IncomeConfig;
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(path: string, message: string): never {
  throw new ConfigValidationError(path, message);
}
function object(
  value: unknown,
  path: string,
  keys: string[],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'expected object');
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown key');
  return result;
}
function integer(
  value: unknown,
  path: string,
  min: number,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min)
    fail(path, `expected safe integer >= ${min}`);
}
function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(path, 'expected finite number');
}
function capture(value: unknown, path: string): Partial<CaptureConfig> {
  const v = object(value, path, ['threshold', 'gainByPlayers', 'decayPerTick']);
  if ('threshold' in v) integer(v.threshold, `${path}.threshold`, 1);
  if ('decayPerTick' in v) integer(v.decayPerTick, `${path}.decayPerTick`, 0);
  if ('gainByPlayers' in v) {
    if (!Array.isArray(v.gainByPlayers) || v.gainByPlayers.length === 0)
      fail(`${path}.gainByPlayers`, 'expected nonempty array');
    let previous = 0;
    for (const [i, gain] of v.gainByPlayers.entries()) {
      integer(gain, `${path}.gainByPlayers[${i}]`, 1);
      if (gain <= previous)
        fail(`${path}.gainByPlayers[${i}]`, 'must strictly increase');
      previous = gain;
    }
  }
  return structuredClone(v) as Partial<CaptureConfig>;
}
function income(value: unknown, path: string): Partial<IncomeConfig> {
  const v = object(value, path, ['amount', 'intervalTicks']);
  if ('amount' in v) integer(v.amount, `${path}.amount`, 0);
  if ('intervalTicks' in v)
    integer(v.intervalTicks, `${path}.intervalTicks`, 1);
  return structuredClone(v) as Partial<IncomeConfig>;
}

export function resolveConfig(input: unknown): readonly ResolvedZoneConfig[] {
  const root = object(input, 'config', ['defaults', 'zones']);
  const defaults =
    'defaults' in root
      ? object(root.defaults, 'defaults', ['capture', 'income'])
      : {};
  const defaultCapture = {
    threshold: 100,
    gainByPlayers: [10, 15, 18],
    decayPerTick: 0,
    ...('capture' in defaults
      ? capture(defaults.capture, 'defaults.capture')
      : {}),
  };
  const defaultIncome = {
    amount: 5,
    intervalTicks: 10,
    ...('income' in defaults ? income(defaults.income, 'defaults.income') : {}),
  };
  if (!Array.isArray(root.zones) || root.zones.length === 0)
    fail('zones', 'expected nonempty array');
  const ids = new Set<string>();
  const zones = root.zones.map(
    (entry: unknown, i: number): ResolvedZoneConfig => {
      const path = `zones[${i}]`;
      const v = object(entry, path, [
        'id',
        'center',
        'radius',
        'initialOwner',
        'capture',
        'income',
      ]);
      if (!isId(v.id) || ids.has(v.id))
        fail(`${path}.id`, 'expected unique nonempty id');
      ids.add(v.id);
      const center = object(v.center, `${path}.center`, ['x', 'y']);
      finite(center.x, `${path}.center.x`);
      finite(center.y, `${path}.center.y`);
      finite(v.radius, `${path}.radius`);
      if (v.radius <= 0) fail(`${path}.radius`, 'must be positive');
      if (v.initialOwner !== null && !isId(v.initialOwner))
        fail(`${path}.initialOwner`, 'expected faction id or null');
      const resolvedCapture = {
        ...defaultCapture,
        ...('capture' in v ? capture(v.capture, `${path}.capture`) : {}),
      };
      const resolvedIncome = {
        ...defaultIncome,
        ...('income' in v ? income(v.income, `${path}.income`) : {}),
      };
      return Object.freeze({
        id: v.id,
        center: Object.freeze({ x: center.x, y: center.y }),
        radius: v.radius,
        initialOwner: v.initialOwner,
        capture: Object.freeze({
          ...resolvedCapture,
          gainByPlayers: Object.freeze([...resolvedCapture.gainByPlayers]),
        }),
        income: Object.freeze(resolvedIncome),
      });
    },
  );
  return Object.freeze(zones);
}
