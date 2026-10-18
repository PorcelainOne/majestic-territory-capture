import { expect, it } from 'vitest';
import { resolveConfig } from '../src/core/config.js';
import { ConfigValidationError } from '../src/index.js';

const zone = {
  id: 'a',
  center: { x: 0, y: 0 },
  radius: 10,
  initialOwner: null,
};

it.each([
  [null, 'config'],
  [{ zones: [] }, 'zones'],
  [{ zones: [zone, zone] }, 'zones[1].id'],
  [{ zones: [{ ...zone, id: '' }] }, 'zones[0].id'],
  [{ zones: [{ ...zone, center: { x: NaN, y: 0 } }] }, 'zones[0].center.x'],
  [
    { zones: [{ ...zone, center: { x: 0, y: Infinity } }] },
    'zones[0].center.y',
  ],
  [{ zones: [{ ...zone, radius: 0 }] }, 'zones[0].radius'],
  [{ zones: [{ ...zone, radius: Infinity }] }, 'zones[0].radius'],
  [{ zones: [{ ...zone, initialOwner: '' }] }, 'zones[0].initialOwner'],
  [{ zones: [{ ...zone, initialOwner: undefined }] }, 'zones[0].initialOwner'],
  [
    { zones: [{ ...zone, capture: { threshold: 0 } }] },
    'zones[0].capture.threshold',
  ],
  [
    { zones: [{ ...zone, capture: { threshold: 0.5 } }] },
    'zones[0].capture.threshold',
  ],
  [
    {
      zones: [{ ...zone, capture: { threshold: Number.MAX_SAFE_INTEGER + 1 } }],
    },
    'zones[0].capture.threshold',
  ],
  [
    { zones: [{ ...zone, capture: { gainByPlayers: [] } }] },
    'zones[0].capture.gainByPlayers',
  ],
  [
    { zones: [{ ...zone, capture: { gainByPlayers: [0] } }] },
    'zones[0].capture.gainByPlayers[0]',
  ],
  [
    { zones: [{ ...zone, capture: { gainByPlayers: [10, 10] } }] },
    'zones[0].capture.gainByPlayers[1]',
  ],
  [
    { zones: [{ ...zone, capture: { gainByPlayers: [10, 5] } }] },
    'zones[0].capture.gainByPlayers[1]',
  ],
  [
    {
      zones: [
        { ...zone, capture: { gainByPlayers: [Number.MAX_SAFE_INTEGER + 1] } },
      ],
    },
    'zones[0].capture.gainByPlayers[0]',
  ],
  [
    { zones: [{ ...zone, capture: { decayPerTick: -1 } }] },
    'zones[0].capture.decayPerTick',
  ],
  [{ zones: [{ ...zone, income: { amount: -1 } }] }, 'zones[0].income.amount'],
  [
    { zones: [{ ...zone, income: { amount: Infinity } }] },
    'zones[0].income.amount',
  ],
  [
    { zones: [{ ...zone, income: { intervalTicks: 0 } }] },
    'zones[0].income.intervalTicks',
  ],
  [
    { zones: [{ ...zone, income: { intervalTicks: 1.5 } }] },
    'zones[0].income.intervalTicks',
  ],
  [
    { zones: [{ ...zone, capture: { treshold: 5 } }] },
    'zones[0].capture.treshold',
  ],
  [{ zones: [{ ...zone, extra: true }] }, 'zones[0].extra'],
  [{ zones: [{ ...zone, center: { x: 0, y: 0, z: 0 } }] }, 'zones[0].center.z'],
  [{ zones: [zone], defaults: { other: 1 } }, 'defaults.other'],
  [
    { zones: [zone], defaults: { capture: { threshold: undefined } } },
    'defaults.capture.threshold',
  ],
  [{ zones: [zone], extra: true }, 'config.extra'],
])('rejects invalid config with the field path (%#)', (input, path) => {
  expect(() => resolveConfig(input)).toThrow(ConfigValidationError);
  try {
    resolveConfig(input);
  } catch (error) {
    expect((error as ConfigValidationError).path).toBe(path);
  }
});

it('merges defaults and per-zone fields without replacing sibling settings', () => {
  const [resolved] = resolveConfig({
    defaults: {
      capture: { threshold: 30, gainByPlayers: [1, 3] },
      income: { amount: 9, intervalTicks: 4 },
    },
    zones: [{ ...zone, capture: { threshold: 40 }, income: { amount: 0 } }],
  });
  expect(resolved?.capture).toEqual({
    threshold: 40,
    gainByPlayers: [1, 3],
    decayPerTick: 0,
  });
  expect(resolved?.income).toEqual({ amount: 0, intervalTicks: 4 });
  expect(Object.isFrozen(resolved)).toBe(true);
  expect(Object.isFrozen(resolved?.capture.gainByPlayers)).toBe(true);
  expect(Object.isFrozen(resolved?.center)).toBe(true);
});

it('accepts nonnegative zero settings, fractional geometry and increasing gains without diminishing returns', () => {
  expect(() =>
    resolveConfig({
      zones: [
        {
          ...zone,
          radius: 0.1,
          center: { x: 0.5, y: -0.5 },
          capture: { gainByPlayers: [1, 10, 100], decayPerTick: 0 },
          income: { amount: 0 },
        },
      ],
    }),
  ).not.toThrow();
});
