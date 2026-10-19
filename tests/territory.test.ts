import { describe, expect, it, vi } from 'vitest';
import {
  TerritorySystem,
  PlayerRegistry,
  UnknownZoneError,
  ReentrantCallError,
  InvalidPlayerError,
  ScoreOverflowError,
} from '../src/index.js';
import type {
  SimulationConfig,
  IPlayer,
  TerritoryEvents,
  IZoneState,
} from '../src/index.js';
import { runDemo } from '../src/demo/scenario.js';

function config(owner: string | null = null): SimulationConfig {
  return {
    defaults: {
      capture: { threshold: 100, gainByPlayers: [10, 15, 18], decayPerTick: 0 },
      income: { amount: 5, intervalTicks: 10 },
    },
    zones: [
      { id: 'a', center: { x: 0, y: 0 }, radius: 10, initialOwner: owner },
    ],
  };
}
function setup(input = config()) {
  const players = new PlayerRegistry();
  const system = new TerritorySystem(input, players);
  const put = (id: string, factionId = 'blue', x = 0, y = 0) =>
    players.upsert({ id, factionId, position: { x, y } });
  const run = (n: number) => {
    for (let i = 0; i < n; i++) system.tick();
  };
  const zone = () => system.getZone('a')!;
  return { system, players, put, run, zone };
}

describe('capture and presence', () => {
  it('initializes owned and neutral zones without attackers', () => {
    for (const owner of [null, 'red']) {
      const { system, zone } = setup(config(owner));
      expect(system.currentTick).toBe(0);
      expect(system.getFactionScores()).toEqual({});
      expect(zone()).toMatchObject({
        ownerId: owner,
        capturingFactionId: null,
        progress: 0,
        isContested: false,
        factionsPresent: {},
        ownedSinceTick: owner ? 0 : null,
      });
    }
  });

  it.each([1, 2, 3, 8])(
    'captures at the exact tick with %i players, with a speed cap',
    (count) => {
      for (const owner of [null, 'red']) {
        const { put, run, zone, system } = setup(config(owner));
        const gain = count === 1 ? 10 : count === 2 ? 15 : 18;
        for (let i = 0; i < count; i++) put(String(i));
        const ticks = Math.ceil(100 / gain);
        run(ticks - 1);
        expect(zone().progress).toBe((ticks - 1) * gain);
        expect(zone().ownerId).toBe(owner);
        run(1);
        expect(zone()).toMatchObject({
          ownerId: 'blue',
          progress: 0,
          capturingFactionId: null,
          ownedSinceTick: ticks,
        });
        expect(system.currentTick).toBe(ticks);
      }
    },
  );

  it('handles contest transitions once, freezes progress, and resumes on the ending tick', () => {
    const { system, put, run, players, zone } = setup(config('red'));
    const starts = vi.fn();
    const ends = vi.fn();
    system.on('contestStarted', starts);
    system.on('contestEnded', ends);
    put('b');
    run(3);
    put('r', 'red');
    put('g', 'green');
    run(2);
    expect(zone()).toMatchObject({
      progress: 30,
      capturingFactionId: 'blue',
      isContested: true,
    });
    expect(starts).toHaveBeenCalledTimes(1);
    expect(starts.mock.calls[0]?.[0].factionIds).toEqual([
      'blue',
      'green',
      'red',
    ]);
    players.remove('r');
    players.remove('g');
    run(1);
    expect(zone()).toMatchObject({ progress: 40, isContested: false });
    expect(ends).toHaveBeenCalledTimes(1);
    put('r', 'red');
    run(1);
    players.remove('r');
    players.remove('b');
    run(2);
    expect(ends).toHaveBeenCalledTimes(2);
    expect(zone()).toMatchObject({ progress: 40, isContested: false });
  });

  it('defenders erase progress gradually and do not capture their own zone', () => {
    const { put, run, players, zone } = setup(config('red'));
    put('b');
    run(6);
    players.remove('b');
    for (let i = 0; i < 3; i++) put(`r${i}`, 'red');
    for (const progress of [42, 24, 6, 0, 0]) {
      run(1);
      expect(zone().progress).toBe(progress);
    }
    expect(zone()).toMatchObject({ ownerId: 'red', capturingFactionId: null });
  });

  it('a third faction first erases another attacker and starts on the next tick', () => {
    const { put, run, players, zone } = setup();
    put('b');
    run(2);
    players.remove('b');
    put('g', 'green');
    run(1);
    expect(zone()).toMatchObject({ capturingFactionId: 'blue', progress: 10 });
    run(1);
    expect(zone()).toMatchObject({ capturingFactionId: null, progress: 0 });
    run(1);
    expect(zone()).toMatchObject({ capturingFactionId: 'green', progress: 10 });
  });

  it.each([0, 7, 100])(
    'empty zones decay by %i and clear attacker at zero',
    (decayPerTick) => {
      const c = config();
      const { put, run, players, zone } = setup({
        ...c,
        defaults: {
          ...c.defaults,
          capture: { ...c.defaults?.capture, decayPerTick },
        },
      });
      put('b');
      run(2);
      players.remove('b');
      run(1);
      expect(zone().progress).toBe(Math.max(0, 20 - decayPerTick));
      run(3);
      expect(zone().progress).toBe(decayPerTick ? 0 : 20);
      expect(zone().capturingFactionId).toBe(decayPerTick ? null : 'blue');
    },
  );

  it('reads movements, faction changes and deletions between ticks', () => {
    const { put, run, players, zone } = setup();
    put('b');
    run(1);
    put('b', 'blue', 20);
    run(1);
    expect(zone().progress).toBe(10);
    put('b', 'green');
    run(1);
    expect(zone()).toMatchObject({ progress: 0, capturingFactionId: null });
    run(1);
    expect(zone().capturingFactionId).toBe('green');
    expect(players.remove('b')).toBe(true);
    expect(players.remove('b')).toBe(false);
    run(1);
    expect(zone().factionsPresent).toEqual({});
  });

  it('includes the boundary and overlapping zones, excluding points outside', () => {
    const c = config();
    const { put, run, system } = setup({
      ...c,
      zones: [...c.zones, { ...c.zones[0]!, id: 'b' }],
    });
    put('edge', 'blue', 6, 8);
    put('outside', 'red', 10.001);
    run(1);
    expect(
      system.getZones().map((z) => [z.progress, z.factionsPresent]),
    ).toEqual([
      [10, { blue: 1 }],
      [10, { blue: 1 }],
    ]);
  });

  it.each([
    [99, 168, 195],
    [21, 220, 221],
  ])('includes boundary point (%i, %i) at radius %i', (x, y, radius) => {
    const { put, run, zone } = setup({
      zones: [{ ...config().zones[0]!, radius }],
    });
    put('edge', 'blue', x, y);
    put('outside', 'red', x, y + 0.001);
    run(1);
    expect(zone()).toMatchObject({
      progress: 10,
      isContested: false,
      factionsPresent: { blue: 1 },
    });
  });

  it.each([1e200, 1e-200])(
    'handles extreme radius %s without squared-distance overflow or underflow',
    (radius) => {
      const { put, run, zone } = setup({
        zones: [{ ...config().zones[0]!, radius }],
      });
      put('far', 'red', 2 * radius);
      run(1);
      expect(zone().factionsPresent).toEqual({});
      put('far', 'red', radius);
      run(1);
      expect(zone().factionsPresent).toEqual({ red: 1 });
    },
  );

  it('caps large safe gains without an unsafe intermediate sum', () => {
    const { put, run, zone } = setup({
      defaults: {
        capture: {
          threshold: Number.MAX_SAFE_INTEGER,
          gainByPlayers: [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
        },
      },
      zones: config().zones,
    });
    put('b');
    run(1);
    expect(zone().progress).toBe(Number.MAX_SAFE_INTEGER - 1);
    run(1);
    expect(zone().ownerId).toBe('blue');
    const fast = setup({
      defaults: {
        capture: { threshold: 1, gainByPlayers: [Number.MAX_SAFE_INTEGER] },
      },
      zones: config().zones,
    });
    fast.put('b');
    fast.run(1);
    expect(fast.zone().ownerId).toBe('blue');
  });
});

describe('ownership and income', () => {
  it.each([1, 3])(
    'starts income a full %i ticks after capture',
    (intervalTicks) => {
      const c = config('red');
      const { put, run, system, zone } = setup({
        ...c,
        defaults: {
          capture: { threshold: 20, gainByPlayers: [10] },
          income: { amount: 5, intervalTicks },
        },
      });
      const paid = vi.fn();
      system.on('incomeGranted', paid);
      put('b');
      run(1);
      expect(system.getFactionScores()).toEqual(
        intervalTicks === 1 ? { red: 5 } : {},
      );
      run(1);
      expect(zone().ownerId).toBe('blue');
      expect(paid.mock.calls.some(([event]) => event.tick === 2)).toBe(false);
      run(intervalTicks - 1);
      expect(system.getFactionScores().blue).toBeUndefined();
      run(1);
      expect(system.getFactionScores().blue).toBe(5);

      const previousRedBalance = system.getFactionScores().red;
      put('b', 'red');
      run(1);
      const previousBlueBalance = system.getFactionScores().blue;
      expect(previousBlueBalance).toBe(intervalTicks === 1 ? 10 : 5);
      run(1);
      expect(zone().ownerId).toBe('red');
      expect(system.getFactionScores().blue).toBe(previousBlueBalance);
      expect(system.getFactionScores().red).toBe(previousRedBalance);
      for (let i = 1; i < intervalTicks; i++) {
        run(1);
        expect(system.getFactionScores().blue).toBe(previousBlueBalance);
      }
      expect(system.getFactionScores().red).toBe(previousRedBalance);
      run(1);
      expect(system.getFactionScores().blue).toBe(previousBlueBalance);
      expect(system.getFactionScores().red).toBe((previousRedBalance ?? 0) + 5);
    },
  );

  it('pays initial owners, including during attacks and contests; zone overrides apply', () => {
    const c = config('red');
    const { put, run, system } = setup({
      ...c,
      zones: [{ ...c.zones[0]!, income: { amount: 7, intervalTicks: 2 } }],
    });
    put('b');
    run(1);
    expect(system.getFactionScores()).toEqual({});
    run(1);
    expect(system.getFactionScores()).toEqual({ red: 7 });
    put('r', 'red');
    run(2);
    expect(system.getFactionScores()).toEqual({ red: 14 });
  });

  it('manual ownership is idempotent, clears attacker and resets income only on change', () => {
    const c = config('red');
    const { system, put, run, zone } = setup({
      ...c,
      defaults: { income: { intervalTicks: 3, amount: 5 } },
    });
    put('b');
    run(2);
    const before = zone();
    const changed = vi.fn();
    const captured = vi.fn();
    system.on('ownerChanged', changed);
    system.on('zoneCaptured', captured);
    system.setOwner('a', 'red');
    expect(zone()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    run(1);
    expect(system.getFactionScores().red).toBe(5);
    system.setOwner('a', 'green');
    expect(changed).toHaveBeenCalledExactlyOnceWith({
      tick: 3,
      zoneId: 'a',
      previousOwnerId: 'red',
      ownerId: 'green',
      reason: 'manual',
    });
    expect(captured).not.toHaveBeenCalled();
    expect(zone()).toMatchObject({
      ownerId: 'green',
      ownedSinceTick: 3,
      capturingFactionId: null,
      progress: 0,
    });
    run(2);
    expect(system.getFactionScores().green).toBeUndefined();
    run(1);
    expect(system.getFactionScores().green).toBe(5);
    system.setOwner('a', null);
    expect(zone()).toMatchObject({
      ownerId: null,
      ownedSinceTick: null,
      progress: 0,
    });
    expect(system.getZone('missing')).toBeNull();
    expect(() => system.setOwner('missing', 'red')).toThrow(UnknownZoneError);
    expect(() => system.setOwner('a', '')).toThrow(TypeError);
  });

  it('setOwner(null) on an already neutral zone preserves unfinished capture', () => {
    const { put, run, system, zone } = setup();
    put('b');
    run(1);
    const before = zone();
    system.setOwner('a', null);
    expect(zone()).toEqual(before);
  });
});

describe('atomicity and snapshots', () => {
  it('rolls back time, both zones and scores if the second zone overflows', () => {
    const c = config('red');
    const { system, put, run } = setup({
      defaults: { income: { intervalTicks: 1 } },
      zones: [
        { ...c.zones[0]!, income: { amount: Number.MAX_SAFE_INTEGER } },
        { ...c.zones[0]!, id: 'b', income: { amount: 1 } },
      ],
    });
    put('attacker');
    const before = system.getZones();
    const handler = vi.fn();
    system.on('incomeGranted', handler);
    expect(() => run(1)).toThrow(ScoreOverflowError);
    expect(system.currentTick).toBe(0);
    expect(system.getZones()).toEqual(before);
    expect(system.getFactionScores()).toEqual({});
    expect(handler).not.toHaveBeenCalled();
    system.setOwner('b', null);
    run(1);
    expect(system.currentTick).toBe(1);
    expect(system.getFactionScores().red).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('recovers after source errors and validates arbitrary sources before committing', () => {
    let mode = 0;
    const player = { id: 'b', factionId: 'blue', position: { x: 0, y: 0 } };
    const system = new TerritorySystem(config(), {
      getPlayers() {
        if (mode === 0) throw new Error('source failed');
        if (mode === 1) return [player, player];
        if (mode === 2) return [{ ...player, position: { x: NaN, y: 0 } }];
        return [player];
      },
    });
    const before = system.getZones();
    expect(() => system.tick()).toThrow('source failed');
    for (mode = 1; mode <= 2; mode++) {
      expect(() => system.tick()).toThrow(InvalidPlayerError);
      expect(system.currentTick).toBe(0);
      expect(system.getZones()).toEqual(before);
    }
    system.tick();
    expect(system.getZone('a')?.progress).toBe(10);
  });

  it('rejects reentry from the source while preserving a usable system', () => {
    const system: TerritorySystem = new TerritorySystem(config(), {
      getPlayers() {
        expect(() => system.tick()).toThrow(ReentrantCallError);
        expect(() => system.setOwner('a', 'red')).toThrow(ReentrantCallError);
        return [];
      },
    });
    system.tick();
    expect(system.currentTick).toBe(1);
  });

  it('copies nested configuration, players, returned zones and balances', () => {
    const mutableConfig = structuredClone(config('red')) as {
      defaults: { capture: { gainByPlayers: number[] } };
      zones: { center: { x: number } }[];
    } & SimulationConfig;
    const { players, system, run } = setup(mutableConfig);
    const player = { id: 'b', factionId: 'blue', position: { x: 0, y: 0 } };
    players.upsert(player);
    player.position.x = 100;
    mutableConfig.defaults.capture.gainByPlayers[0] = 99;
    mutableConfig.zones[0]!.center.x = 100;
    const returned = players.getPlayers();
    Reflect.set(returned[0]!.position, 'x', 100);
    run(1);
    const zones = system.getZones() as {
      progress: number;
      center: { x: number };
      factionsPresent: Record<string, number>;
    }[];
    zones[0]!.progress = 99;
    zones[0]!.center.x = 500;
    zones[0]!.factionsPresent.blue = 999;
    expect(system.getZone('a')).toMatchObject({
      progress: 10,
      center: { x: 0 },
      factionsPresent: { blue: 1 },
    });
    players.remove('b');
    run(9);
    const scores = system.getFactionScores();
    scores.red = 999;
    expect(system.getFactionScores().red).toBe(5);
  });

  it('supports arbitrary nonempty faction ids without object prototype collisions', () => {
    const { system, put, run, zone } = setup();
    put('b', '__proto__');
    run(10);
    expect(zone().ownerId).toBe('__proto__');
    run(10);
    expect(Object.hasOwn(system.getFactionScores(), '__proto__')).toBe(true);
    expect(system.getFactionScores()['__proto__']).toBe(5);
  });
});

describe('events', () => {
  it('publishes fixed order after all zones commit', () => {
    const c = config('red');
    const { system, put, run } = setup({
      ...c,
      defaults: { capture: { threshold: 10 } },
      zones: [...c.zones, { ...c.zones[0]!, id: 'b' }],
    });
    const journal: string[] = [];
    const captures: TerritoryEvents['zoneCaptured'][] = [];
    const changes: TerritoryEvents['ownerChanged'][] = [];
    system.on('zoneCaptured', (e) => {
      journal.push(`${e.zoneId}:capture`);
      captures.push(e);
      expect(system.getZones().every((z) => z.ownerId === 'blue')).toBe(true);
    });
    system.on('ownerChanged', (e) => {
      journal.push(`${e.zoneId}:owner`);
      changes.push(e);
    });
    put('p');
    run(1);
    expect(journal).toEqual(['a:capture', 'a:owner', 'b:capture', 'b:owner']);
    expect(captures).toEqual(
      ['a', 'b'].map((zoneId) => ({
        tick: 1,
        zoneId,
        factionId: 'blue',
        previousOwnerId: 'red',
      })),
    );
    expect(changes).toEqual(
      ['a', 'b'].map((zoneId) => ({
        tick: 1,
        zoneId,
        previousOwnerId: 'red',
        ownerId: 'blue',
        reason: 'capture',
      })),
    );
  });

  it('isolates payload fields and nested arrays, including retained references', () => {
    const { system, put, run, zone } = setup();
    let retained: TerritoryEvents['contestStarted'] | undefined;
    system.on('contestStarted', (e) => {
      retained = e;
      e.zoneId = 'corrupt';
      e.factionIds.push('fake');
    });
    const later = vi.fn();
    system.on('contestStarted', later);
    put('r', 'red');
    put('b');
    run(1);
    expect(later).toHaveBeenCalledExactlyOnceWith({
      tick: 1,
      zoneId: 'a',
      factionIds: ['blue', 'red'],
    });
    retained!.factionIds.length = 0;
    expect(zone().factionsPresent).toEqual({ blue: 1, red: 1 });
    expect(later.mock.calls[0]?.[0].factionIds).toEqual(['blue', 'red']);
    run(1);
    expect(zone().isContested).toBe(true);
  });

  it('rejects mutations from tick and manual dispatch; allows player changes for next tick', () => {
    const { system, put, run, zone } = setup();
    let calls = 0;
    system.on('ownerChanged', () => {
      expect(() => system.setOwner('a', 'green')).toThrow(ReentrantCallError);
      expect(() => system.tick()).toThrow(ReentrantCallError);
      put('new', 'blue');
      calls++;
    });
    const observed: {
      tick: number;
      ownerId: string | null;
      progress: number;
    }[] = [];
    system.on('ownerChanged', () => {
      const { ownerId, progress } = zone();
      observed.push({ tick: system.currentTick, ownerId, progress });
    });
    system.setOwner('a', 'red');
    expect(zone().factionsPresent).toEqual({});
    run(1);
    expect(zone().progress).toBe(10);
    run(9);
    expect(calls).toBe(2);
    expect(zone().ownerId).toBe('blue');
    expect(observed).toEqual([
      { tick: 0, ownerId: 'red', progress: 0 },
      { tick: 10, ownerId: 'blue', progress: 0 },
    ]);
  });

  it('continues after listener and error callback failures, releasing the guard', () => {
    const errorReporter = vi.fn(() => {
      throw new Error('reporter');
    });
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const system = new TerritorySystem(config(), new PlayerRegistry(), {
        onHandlerError: errorReporter,
      });
      system.on('ownerChanged', () => {
        throw new Error('listener');
      });
      const second = vi.fn();
      system.on('ownerChanged', second);
      system.setOwner('a', 'red');
      expect(second).toHaveBeenCalledTimes(1);
      expect(errorReporter).toHaveBeenCalledTimes(1);
      expect(output).toHaveBeenCalledTimes(1);
      system.tick();
      expect(system.currentTick).toBe(1);
    } finally {
      output.mockRestore();
    }
  });

  it('uses a listener snapshot and supports unsubscribe', () => {
    const { system } = setup();
    const second = vi.fn();
    const added = vi.fn();
    let unsubscribe = () => {};
    system.on('ownerChanged', () => {
      unsubscribe();
      system.on('ownerChanged', added);
    });
    unsubscribe = system.on('ownerChanged', second);
    system.setOwner('a', 'red');
    expect(second).toHaveBeenCalledTimes(1);
    expect(added).not.toHaveBeenCalled();
    system.setOwner('a', 'blue');
    expect(second).toHaveBeenCalledTimes(1);
    expect(added).toHaveBeenCalledTimes(1);
  });
});

describe('delivery scenarios', () => {
  it('runs the real demo assertions', () => {
    const report = vi.fn();
    expect(runDemo(report).getZone('alpha')?.ownerId).toBe('green');
    expect(report).toHaveBeenCalledWith('Доход', 36, expect.any(Array), {
      red: 65,
      blue: 5,
    });
  });

  it('adds a working zone solely through configuration', () => {
    const { system, put, run } = setup({
      zones: [
        ...config().zones,
        {
          id: 'new',
          center: { x: 50, y: 0 },
          radius: 3,
          initialOwner: null,
          capture: { threshold: 10 },
        },
      ],
    });
    put('p', 'red', 50);
    run(1);
    expect(system.getZone('new')?.ownerId).toBe('red');
    expect(system.getZone('a')?.ownerId).toBeNull();
  });

  it('replays the same commands deterministically and preserves invariants', () => {
    function replay() {
      const { system, put, run, players } = setup();
      const states: IZoneState[][] = [];
      const journal: unknown[] = [];
      for (const name of [
        'zoneCaptured',
        'ownerChanged',
        'contestStarted',
        'contestEnded',
        'incomeGranted',
      ] as const)
        system.on(name, (event) => journal.push([name, event]));
      for (let tick = 0; tick < 100; tick++) {
        put('b', tick % 7 < 3 ? 'blue' : 'green', tick % 11 < 8 ? 0 : 50);
        if (tick % 5 === 0) put('r', 'red');
        else players.remove('r');
        run(1);
        const zones = system.getZones();
        for (const z of zones) {
          expect(z.progress).toBeGreaterThanOrEqual(0);
          expect(z.progress).toBeLessThanOrEqual(z.threshold);
          expect(z.progress === 0).toBe(z.capturingFactionId === null);
          expect(
            z.capturingFactionId === null || z.capturingFactionId !== z.ownerId,
          ).toBe(true);
        }
        states.push(zones);
      }
      return { states, journal, scores: system.getFactionScores() };
    }
    expect(replay()).toEqual(replay());
  });

  it('validates players on upsert', () => {
    const registry = new PlayerRegistry();
    for (const player of [
      null,
      { id: '', factionId: 'x', position: { x: 0, y: 0 } },
      { id: 'p', factionId: '', position: { x: 0, y: 0 } },
      { id: 'p', factionId: 'x', position: { x: Infinity, y: 0 } },
    ])
      expect(() => registry.upsert(player as IPlayer)).toThrow(
        InvalidPlayerError,
      );
    expect(registry.getPlayers()).toEqual([]);
  });
});
