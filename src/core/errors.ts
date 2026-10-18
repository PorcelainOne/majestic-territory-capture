export class UnknownZoneError extends Error {
  constructor(id: string) {
    super(`Unknown zone: ${id}`);
    this.name = 'UnknownZoneError';
  }
}
export class ConfigValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ConfigValidationError';
  }
}
export class InvalidPlayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPlayerError';
  }
}
export class ReentrantCallError extends Error {
  constructor() {
    super('Cannot tick or change ownership during a tick or event dispatch');
    this.name = 'ReentrantCallError';
  }
}
export class ScoreOverflowError extends Error {
  constructor(faction: string) {
    super(`Score exceeds safe integer range: ${faction}`);
    this.name = 'ScoreOverflowError';
  }
}
