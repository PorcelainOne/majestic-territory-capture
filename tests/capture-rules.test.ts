import { expect, it } from 'vitest';
import { CaptureRules } from '../src/core/CaptureRules.js';

it.each([
  {
    name: 'empty with decay',
    ownerId: 'red',
    presence: {},
    progress: 30,
    attacker: 'blue',
    expected: { progress: 23, capturingFactionId: 'blue', capturedBy: null },
  },
  {
    name: 'contested',
    ownerId: 'red',
    presence: { blue: 1, red: 3 },
    progress: 30,
    attacker: 'blue',
    expected: { progress: 30, capturingFactionId: 'blue', capturedBy: null },
  },
  {
    name: 'defender alone',
    ownerId: 'red',
    presence: { red: 1 },
    progress: 30,
    attacker: 'blue',
    expected: { progress: 20, capturingFactionId: 'blue', capturedBy: null },
  },
  {
    name: 'new attack on neutral',
    ownerId: null,
    presence: { blue: 1 },
    progress: 0,
    attacker: null,
    expected: { progress: 10, capturingFactionId: 'blue', capturedBy: null },
  },
  {
    name: 'ongoing attack',
    ownerId: 'red',
    presence: { blue: 2 },
    progress: 30,
    attacker: 'blue',
    expected: { progress: 45, capturingFactionId: 'blue', capturedBy: null },
  },
  {
    name: 'other attacker',
    ownerId: 'red',
    presence: { green: 2 },
    progress: 30,
    attacker: 'blue',
    expected: { progress: 15, capturingFactionId: 'blue', capturedBy: null },
  },
  {
    name: 'other attacker erases without carry',
    ownerId: 'red',
    presence: { green: 2 },
    progress: 10,
    attacker: 'blue',
    expected: { progress: 0, capturingFactionId: null, capturedBy: null },
  },
  {
    name: 'threshold reached',
    ownerId: 'red',
    presence: { blue: 2 },
    progress: 90,
    attacker: 'blue',
    expected: { progress: 0, capturingFactionId: null, capturedBy: 'blue' },
  },
  {
    name: 'idle owner',
    ownerId: 'red',
    presence: { red: 1 },
    progress: 0,
    attacker: null,
    expected: { progress: 0, capturingFactionId: null, capturedBy: null },
  },
])('$name', ({ ownerId, presence, progress, attacker, expected }) => {
  const state = { ownerId, progress, capturingFactionId: attacker };
  const before = structuredClone(state);
  expect(
    CaptureRules.plan(state, presence as Record<string, number>, {
      threshold: 100,
      gainByPlayers: [10, 15, 18],
      decayPerTick: 7,
    }),
  ).toEqual(expected);
  expect(state).toEqual(before);
});
