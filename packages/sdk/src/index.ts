/**
 * @rapidshift/sdk
 * Official SDK for RapidShift access gating, entitlement verification, and fail-open resilience.
 */

export { RapidShiftClient } from './client';
export { createGate } from './gate';
export { createExpressGate } from './express';
export { InMemoryCache } from './cache';

export type {
  AccessPassClaims,
  AccessStatusResponse,
  CacheEntry,
  CacheOptions,
  ClientIdentity,
  GateAccessState,
  GateFailMode,
  GateOptions,
  GateResult,
  GateStatus,
  GraceBannerDetails,
  RapidShiftClientOptions,
  RapidShiftPlatformStatus,
} from './types';
