import { createGate } from './gate';
import type { GateOptions, GateResult, GateStatus, GraceBannerDetails } from './types';

export { createGate };
export const createNextGate = createGate;
export type { GateOptions, GateResult, GateStatus, GraceBannerDetails };

/**
 * Default export for Next.js 16 proxy.ts or middleware.ts integration.
 * Usage:
 * ```ts
 * import { createGate } from '@rapidshift/sdk/next';
 * export default createGate({ secretKey: process.env.RSL_SECRET_KEY! });
 * ```
 */
export default createGate;
