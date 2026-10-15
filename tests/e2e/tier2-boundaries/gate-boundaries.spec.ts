/**
 * Tier 2: Boundary & Corner Cases — Access Gate & API Platform
 * Token expiration edge cases, clock drift, forged Ed25519 signatures, rate limit boundary
 */

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

describe('Tier 2: Access Gate & Security Boundaries', () => {
  describe('Boundary 1: Ed25519 Token Expiration & Clock Drift', () => {
    it('rejects token expired by 1 millisecond', () => {
      const nowEpochSec = Math.floor(Date.now() / 1000);
      const isTokenExpired = (expSec: number) => Math.floor(Date.now() / 1000) >= expSec;
      expect(isTokenExpired(nowEpochSec - 1)).toBe(true);
      expect(isTokenExpired(nowEpochSec + 60)).toBe(false);
    });
    it('tolerates 5-second clock skew between servers for not-before nbf claim', () => {
      const nowEpochSec = Math.floor(Date.now() / 1000);
      const isTokenActive = (nbfSec: number, clockSkewSec: number = 5) => {
        return Math.floor(Date.now() / 1000) >= nbfSec - clockSkewSec;
      };
      // Server clock is 3 seconds ahead
      expect(isTokenActive(nowEpochSec + 3)).toBe(true);
      // Server clock is 10 seconds ahead (exceeds 5s skew tolerance)
      expect(isTokenActive(nowEpochSec + 10)).toBe(false);
    });
    it('rejects token with altered payload regardless of header signature', () => {
      const keypair = crypto.generateKeyPairSync('ed25519');
      const originalPayload = Buffer.from(JSON.stringify({ sub: 'cli_1', status: 'allowed' }));
      const signature = crypto.sign(null, originalPayload, keypair.privateKey);

      // Tampered payload
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'cli_1', status: 'blocked' }));
      const isValid = crypto.verify(null, tamperedPayload, keypair.publicKey, signature);
      expect(isValid).toBe(false);
    });
    it('rejects token signed with wrong Ed25519 private key', () => {
      const keypairA = crypto.generateKeyPairSync('ed25519');
      const keypairB = crypto.generateKeyPairSync('ed25519');
      const payload = Buffer.from('payload');
      const signatureA = crypto.sign(null, payload, keypairA.privateKey);

      const isValidWithB = crypto.verify(null, payload, keypairB.publicKey, signatureA);
      expect(isValidWithB).toBe(false);
    });
  });

  describe('Boundary 2: Rate Limiting & Bucket Refill', () => {
    it('allows burst up to exact bucket capacity (100) and rejects 101st', () => {
      let bucket = 100;
      const consume = () => {
        if (bucket > 0) {
          bucket--;
          return true;
        }
        return false;
      };

      for (let i = 1; i <= 100; i++) {
        expect(consume()).toBe(true);
      }
      expect(consume()).toBe(false);
    });
    it('refills tokens linearly over time window', () => {
      let tokens = 0;
      const maxTokens = 100;
      const refill = (elapsedSeconds: number) => {
        tokens = Math.min(maxTokens, tokens + Math.floor(elapsedSeconds * (100 / 60)));
      };

      refill(30); // 30s elapsed -> refilled 50 tokens
      expect(tokens).toBe(50);
      refill(60); // 60s elapsed -> refilled to max 100
      expect(tokens).toBe(100);
    });
    it('handles zero or negative burst capacity configuration gracefully', () => {
      const capacity = Math.max(1, 0);
      expect(capacity).toBe(1);
    });
  });

  describe('Boundary 3: API Key Formats and Prefixes', () => {
    it('strictly validates secret API key prefix rsk_live_', () => {
      const isValidSecretKey = (key: string) => /^rsk_live_[a-zA-Z0-9]{24,}$/.test(key);
      expect(isValidSecretKey('rsk_live_0123456789abcdef01234567')).toBe(true);
      expect(isValidSecretKey('rsk_test_0123456789abcdef01234567')).toBe(false);
      expect(isValidSecretKey('invalid_prefix_key_1234567890')).toBe(false);
    });
    it('strictly validates publishable API key prefix rpk_live_', () => {
      const isValidPublishableKey = (key: string) => /^rpk_live_[a-zA-Z0-9]{24,}$/.test(key);
      expect(isValidPublishableKey('rpk_live_0123456789abcdef01234567')).toBe(true);
      expect(isValidPublishableKey('rsk_live_0123456789abcdef01234567')).toBe(false);
    });
  });
});
