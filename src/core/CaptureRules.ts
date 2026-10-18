import type { CaptureConfig } from './config.js';

export interface CaptureState {
  ownerId: string | null;
  capturingFactionId: string | null;
  progress: number;
}

export class CaptureRules {
  static plan(
    state: CaptureState,
    presence: Readonly<Record<string, number>>,
    config: CaptureConfig,
  ): {
    progress: number;
    capturingFactionId: string | null;
    capturedBy: string | null;
  } {
    let { progress, capturingFactionId } = state;
    const factions = Object.entries(presence);
    if (factions.length > 1)
      return { progress, capturingFactionId, capturedBy: null };
    const entry = factions[0];
    if (!entry)
      progress =
        config.decayPerTick >= progress ? 0 : progress - config.decayPerTick;
    else {
      const [faction, count] = entry;
      const gain =
        config.gainByPlayers[Math.min(count, config.gainByPlayers.length) - 1]!;
      if (
        faction === state.ownerId ||
        (capturingFactionId !== null && capturingFactionId !== faction)
      ) {
        progress = gain >= progress ? 0 : progress - gain;
      } else {
        capturingFactionId = faction;
        progress =
          gain >= config.threshold - progress
            ? config.threshold
            : progress + gain;
        if (progress === config.threshold)
          return { progress: 0, capturingFactionId: null, capturedBy: faction };
      }
    }
    return {
      progress,
      capturingFactionId: progress === 0 ? null : capturingFactionId,
      capturedBy: null,
    };
  }
}
