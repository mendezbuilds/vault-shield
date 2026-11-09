import test from 'node:test';
import assert from 'node:assert';
import { KeyPair } from 'near-api-js';
import { loadConfig, getSafeConfig, EXPECTED_RESTRICTED_PUBLIC_KEY } from '../dist/config.js';
import { AgentSigner } from '../dist/signer.js';
import type { PaymentIntent } from '../dist/types.js';

test('Security: getSafeConfig strictly strips privateKey from output', () => {
  const secret = 'ed25519:5Mh8G9...sensitive_secret_here...';
  const config = loadConfig({
    privateKey: secret,
  });

  const safe = getSafeConfig(config);
  assert.strictEqual((safe as any).privateKey, undefined);
  assert.strictEqual(safe.hasPrivateKey, true);
  assert.strictEqual(JSON.stringify(safe).includes(secret), false);
});

test('Security: previewPayload never leaks private key material', () => {
  const config = loadConfig({
    agentAccountId: 'agent-a.vault-parent.testnet',
    vaultContractId: 'contract.vault-parent.testnet',
    expectedPublicKey: EXPECTED_RESTRICTED_PUBLIC_KEY,
  });

  const signer = new AgentSigner(config);
  const intent: PaymentIntent = {
    intentId: 'intent_sec_test',
    destination: 'merchant.vault-parent.testnet',
    amountNear: '0.1',
    amountYocto: '100000000000000000000000',
    reason: 'Leakage test',
    createdAt: Date.now(),
  };

  const preview = signer.previewPayload(intent);
  const jsonStr = JSON.stringify(preview);
  assert.strictEqual(jsonStr.includes('private'), false);
  assert.strictEqual(jsonStr.includes('secret'), false);
});

test('Security: Signer strictly strips raw private key if initialization fails', () => {
  const secretKey = 'ed25519:bad_key_format_1234567890';
  assert.throws(
    () => {
      new AgentSigner(
        loadConfig({
          privateKey: secretKey,
        })
      );
    },
    (err: any) => {
      // Must not contain the sensitive private key string
      assert.strictEqual(err.message.includes(secretKey), false);
      assert.strictEqual(err.message.includes('Signer initialization failed'), true);
      return true;
    }
  );
});

test('Security: KeyPair with unauthorized public key is strictly rejected', () => {
  const unauthorizedKey = KeyPair.fromRandom('ed25519');
  assert.throws(
    () => {
      new AgentSigner(
        loadConfig({
          privateKey: unauthorizedKey.toString(),
          expectedPublicKey: EXPECTED_RESTRICTED_PUBLIC_KEY,
        })
      );
    },
    /Access key security validation failure/
  );
});
