import type { TerritoryEvent, TerritoryEvents } from './types.js';

export type HandlerErrorCallback = (
  error: unknown,
  event: keyof TerritoryEvents,
) => void;

export class EventBus {
  private readonly handlers = new Map<
    keyof TerritoryEvents,
    Set<(payload: never) => void>
  >();

  constructor(
    private readonly onHandlerError: HandlerErrorCallback = console.error,
  ) {}

  on<E extends keyof TerritoryEvents>(
    event: E,
    handler: (payload: TerritoryEvents[E]) => void,
  ): () => void {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  dispatch(events: readonly TerritoryEvent[]): void {
    for (const event of events) {
      const handlers = [...(this.handlers.get(event.type) ?? [])];
      for (const handler of handlers) {
        try {
          handler(structuredClone(event.payload) as never);
        } catch (error) {
          try {
            this.onHandlerError(error, event.type);
          } catch (reportError) {
            try {
              console.error(reportError);
            } catch {
              /* Reporting must not interrupt dispatch. */
            }
          }
        }
      }
    }
  }
}
