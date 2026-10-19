import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TerritorySystem, PlayerRegistry } from '../index.js';
import type { SimulationConfig, IZoneState } from '../index.js';

export function runDemo(
  report: (
    stage: string,
    tick: number,
    zones: IZoneState[],
    scores: Record<string, number>,
  ) => void = () => {},
): TerritorySystem {
  const config = JSON.parse(
    readFileSync(new URL('../../config/zones.json', import.meta.url), 'utf8'),
  ) as SimulationConfig;
  const players = new PlayerRegistry();
  const system = new TerritorySystem(config, players);
  const advance = (n: number) => {
    for (let i = 0; i < n; i++) system.tick();
  };
  const put = (id: string, factionId: string) =>
    players.upsert({ id, factionId, position: { x: 0, y: 0 } });
  const zone = () => {
    const state = system.getZone('alpha');
    assert.ok(state);
    return state;
  };
  const show = (stage: string) =>
    report(
      stage,
      system.currentTick,
      system.getZones(),
      system.getFactionScores(),
    );
  const captures: string[] = [];
  system.on('zoneCaptured', ({ factionId }) => captures.push(factionId));
  put('r1', 'red');
  advance(3);
  assert.equal(zone().progress, 30);
  put('r2', 'red');
  advance(4);
  assert.equal(zone().progress, 90);
  advance(1);
  assert.equal(zone().ownerId, 'red');
  assert.equal(zone().progress, 0);
  show('Захват с подкреплением');

  players.remove('r1');
  players.remove('r2');
  put('b1', 'blue');
  advance(6);
  assert.equal(zone().progress, 60);
  show('Синий атакует');
  for (let i = 1; i <= 3; i++) put(`r${i}`, 'red');
  advance(2);
  assert.equal(zone().isContested, true);
  assert.equal(zone().progress, 60);
  show('Оспаривание');
  players.remove('b1');
  advance(4);
  assert.equal(zone().isContested, false);
  assert.equal(zone().progress, 0);
  assert.equal(zone().capturingFactionId, null);
  show('Защита');

  for (let i = 1; i <= 3; i++) {
    players.remove(`r${i}`);
    put(`b${i}`, 'blue');
  }
  advance(5);
  assert.equal(zone().progress, 90);
  assert.equal(zone().ownerId, 'red');
  advance(1);
  assert.equal(zone().ownerId, 'blue');
  assert.deepEqual(captures, ['red', 'blue']);
  show('Перехват');
  const redBalance = system.getFactionScores().red ?? 0;
  advance(9);
  assert.equal(system.getFactionScores().blue, undefined);
  advance(1);
  assert.equal(system.getFactionScores().blue, 5);
  assert.equal(system.getFactionScores().red, redBalance + 20); // beta still belongs to red
  show('Доход');
  system.setOwner('alpha', 'green');
  assert.equal(zone().ownerId, 'green');
  assert.equal(zone().ownedSinceTick, system.currentTick);
  assert.equal(zone().progress, 0);
  show('Ручная смена');
  return system;
}
