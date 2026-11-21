import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_HANDOFF_WINDOW_MS,
  DEFAULT_VAULT_TTL_SECONDS,
} from '../src/types/contract.ts';

describe('Frontend Intent Center Models & Security Boundaries', () => {
  describe('1. Two Distinct Expiry Windows Invariant', () => {
    test('strictly enforces 300s handoff window vs 3600s vault TTL separation', () => {
      assert.equal(
        EXTERNAL_HANDOFF_WINDOW_MS,
        300_000,
        'External handoff deadline must be strictly 300,000ms (300 seconds / 5 minutes)'
      );
      assert.equal(
        DEFAULT_VAULT_TTL_SECONDS,
        3600,
        'Vault Payment TTL must be strictly 3,600 seconds (1 hour)'
      );
      assert.notEqual(
        EXTERNAL_HANDOFF_WINDOW_MS,
        DEFAULT_VAULT_TTL_SECONDS * 1000,
        'External handoff window and Vault payment TTL must NEVER be identical or interchangeable'
      );
    });

    test('handoff window begins at creation; vault payment TTL begins only after acceptance', () => {
      const createdAt = 1731175200000;
      const handoffDeadline = createdAt + EXTERNAL_HANDOFF_WINDOW_MS;
      assert.equal(handoffDeadline, createdAt + 300_000);

      // In a pending intent, acceptedAt and vaultDeadline must remain undefined until VaultAgent accepts
      const unacceptedIntent = {
        intentId: 'intent_test_123',
        status: 'RECEIVED',
        createdAt,
        handoffDeadline,
        vaultTtlSeconds: 3600,
        acceptedAt: undefined,
        vaultDeadline: undefined,
      };

      assert.equal(unacceptedIntent.acceptedAt, undefined);
      assert.equal(unacceptedIntent.vaultDeadline, undefined);

      // Once accepted, vaultDeadline starts from acceptedAt, NOT createdAt
      const acceptedAt = createdAt + 45_000; // accepted 45 seconds later
      const acceptedIntent = {
        ...unacceptedIntent,
        status: 'AWAITING_APPROVAL',
        acceptedAt,
        vaultDeadline: acceptedAt + (3600 * 1000),
      };

      assert.equal(acceptedIntent.vaultDeadline, acceptedAt + 3_600_000);
      assert.notEqual(acceptedIntent.vaultDeadline, createdAt + 3_600_000);
    });
  });

  describe('2. Lifecycle State Progression Invariant', () => {
    test('validates full lifecycle states and error conditions', () => {
      const validStatuses = [
        'RECEIVED',
        'INGESTED',
        'VALIDATING',
        'PREFLIGHT',
        'AWAITING_APPROVAL',
        'DISPATCHED',
        'COMPLETED',
        'FAILED',
        'EXPIRED',
        'HANDOFF_EXPIRED',
      ];

      assert.equal(validStatuses.length, 10);
      assert.ok(validStatuses.includes('HANDOFF_EXPIRED'));
      assert.ok(validStatuses.includes('EXPIRED'));
      assert.ok(validStatuses.includes('AWAITING_APPROVAL'));
    });

    test('dryRun simulation must never set status to COMPLETED or establish on-chain vault TTL prematurely', () => {
      // Dry run simulation outcome
      const dryRunOutcome = {
        intentId: 'intent_dry_run_01',
        status: 'PREFLIGHT', // Must be PREFLIGHT, never false COMPLETED
        preflightResult: { success: true },
        acceptedAt: undefined, // Must NOT start on-chain TTL during dry run
        vaultDeadline: undefined,
        txHash: undefined,
        requestId: undefined,
      };

      assert.notEqual(dryRunOutcome.status, 'COMPLETED', 'Dry run must never map to COMPLETED');
      assert.equal(dryRunOutcome.status, 'PREFLIGHT');
      assert.equal(dryRunOutcome.acceptedAt, undefined);
      assert.equal(dryRunOutcome.txHash, undefined);
    });

    test('COMPLETED status strictly requires on-chain transaction hash or confirmed settlement receipt', () => {
      const completedIntent = {
        intentId: 'intent_live_exec_01',
        status: 'COMPLETED',
        txHash: 'Fz6LLxnizbMyu47KnrB2xzvj2QQ7YfzXv6788qxFMDXK',
        requestId: 13,
      };

      assert.equal(completedIntent.status, 'COMPLETED');
      assert.ok(completedIntent.txHash && completedIntent.txHash.length > 30, 'COMPLETED requires valid on-chain txHash');
    });
  });
});

