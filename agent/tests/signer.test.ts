import test from 'node:test';
import assert from 'node:assert';
import { KeyPair } from 'near-api-js';
import {
  AgentSigner,
  buildPaymentArgs,
  buildRestrictedFunctionCallAction,
  validateRestrictedKey,
  ZERO_DEPOSIT,
} from '../dist/signer.js';
import { loadConfig, EXPECTED_RESTRICTED_PUBLIC_KEY } from '../dist/config.js';
import type { PaymentIntent } from '../dist/types.js';

test('Signer: buildPaymentArgs creates correct JSON schema', () => {
  const intent: PaymentIntent = {
    intentId: 'intent_123',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.15',
    amountYocto: '150000000000000000000000',
    reason: 'Monthly API inference',
    ttlSeconds: 1800,
    createdAt: 1000,
  };

  const args = buildPaymentArgs(intent);
  assert.strictEqual(args.destination, 'merchant.vault-parent.testnet');
  assert.strictEqual(args.amount, '150000000000000000000000');
  assert.strictEqual(args.reason, 'Monthly API inference');
  assert.strictEqual(args.ttl_nanos, 1800 * 1_000_000_000);
});

test('Signer: buildRestrictedFunctionCallAction enforces strictly zero deposit and request_payment method', () => {
  const args = {
    destination: 'merchant.vault-parent.testnet',
    amount: '100000000000000000000000',
    reason: 'Test',
  };

  const action = buildRestrictedFunctionCallAction(args);
  assert.strictEqual(action.functionCall.methodName, 'request_payment');
  assert.strictEqual(action.functionCall.deposit, ZERO_DEPOSIT);
  assert.strictEqual(action.functionCall.deposit, 0n);
  assert.strictEqual(action.functionCall.gas, 30_000_000_000_000n);
});

test('Signer: validateRestrictedKey rejects mismatched or FullAccess keys', () => {
  const randomKey = KeyPair.fromRandom('ed25519');
  assert.notStrictEqual(randomKey.getPublicKey().toString(), EXPECTED_RESTRICTED_PUBLIC_KEY);

  assert.throws(
    () => {
      validateRestrictedKey(randomKey, EXPECTED_RESTRICTED_PUBLIC_KEY);
    },
    /Access key security validation failure/
  );
});

test('Signer: previewPayload generates complete unbroadcast payload with zero deposit', () => {
  const config = loadConfig({
    agentAccountId: 'agent-a.vault-parent.testnet',
    vaultContractId: 'contract.vault-parent.testnet',
    expectedPublicKey: EXPECTED_RESTRICTED_PUBLIC_KEY,
  });

  const signer = new AgentSigner(config);
  const intent: PaymentIntent = {
    intentId: 'intent_456',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.05',
    amountYocto: '50000000000000000000000',
    reason: 'Micro-payment test',
    createdAt: Date.now(),
  };

  const preview = signer.previewPayload(intent);
  assert.strictEqual(preview.signerId, 'agent-a.vault-parent.testnet');
  assert.strictEqual(preview.receiverId, 'contract.vault-parent.testnet');
  assert.strictEqual(preview.methodName, 'request_payment');
  assert.strictEqual(preview.deposit, '0');
  assert.strictEqual(preview.gas, '30000000000000');
  assert.strictEqual(preview.args.destination, 'merchant.vault-parent.testnet');
});

test('Signer: signAndSendPayment strictly throws when phase1StrictBoundary is active', async () => {
  const config = loadConfig({
    phase1StrictBoundary: true,
  });
  const signer = new AgentSigner(config);
  const intent: PaymentIntent = {
    intentId: 'intent_789',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000',
    reason: 'Boundary check',
    createdAt: Date.now(),
  };

  await assert.rejects(
    async () => {
      await signer.signAndSendPayment(intent);
    },
    /Strict Phase 1 Execution Boundary Active/
  );
});
