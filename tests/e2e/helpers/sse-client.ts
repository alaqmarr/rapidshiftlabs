/**
 * Realtime SSE Stream Reader & Assertion Helper for E2E Tests
 */

export interface CapturedSseEvent {
  topic: string;
  event: string;
  data: any;
  timestamp: number;
}

export class TestSseClient {
  private capturedEvents: CapturedSseEvent[] = [];
  private isListening: boolean = false;

  recordEvent(topic: string, event: string, data: any): void {
    this.capturedEvents.push({
      topic,
      event,
      data,
      timestamp: Date.now()
    });
  }

  getEvents(topicFilter?: string): CapturedSseEvent[] {
    if (!topicFilter) return [...this.capturedEvents];
    return this.capturedEvents.filter((e) => e.topic === topicFilter || e.topic.startsWith(topicFilter));
  }

  clear(): void {
    this.capturedEvents = [];
  }

  /**
   * Asserts that an event matching predicate arrives within maxWaitMs (default 3000ms).
   */
  async waitForEvent(
    predicate: (evt: CapturedSseEvent) => boolean,
    maxWaitMs: number = 3000
  ): Promise<CapturedSseEvent> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const match = this.capturedEvents.find(predicate);
      if (match) {
        return match;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timed out after ${maxWaitMs}ms waiting for expected SSE event`);
  }
}
