import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSigningServer, RUNTIME_SECRET, DEFAULT_RUNTIME_PORT } from '../dist/server.js';
import { NEW_AGENT_RESTRICTED_PUBLIC_KEY, DEFAULT_CONTRACT_ID, DEFAULT_AGENT_ACCOUNT_ID } from '../dist/config.js';
import { timingSafeEqualString, isOriginAllowed, RateLimiter } from '../dist/auth.js';

test('Persistent Signing Runtime Server — Security & Confinement', async (t) => {
  const testPort = 3999;
  const testSecret = 'test_rotated_secret_safe_hash_token';
  const runtime = createSigningServer({
    port: testPort,
    secret: testSecret,
    rateLimitMaxRequests: 50,
    config: {
      allowPlaintextEnv: true,
      phase1StrictBoundary: true, // Safety: strictly dry-run in test
    },
  });

  await runtime.start();

  t.after(async () => {
    await runtime.stop();
  });

  await t.test('GET /health unauthenticated returns generic liveness without leaking internal credentials', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.service, 'vault-shield-persistent-signing-runtime');
    assert.equal(data.authenticated, false);

    // Unauthenticated caller gets NO keys or internal config
    assert.equal(data.restrictedPublicKey, undefined);
    assert.equal(data.signerPublicKey, undefined);
    assert.equal(data.agentAccountId, undefined);
  });

  await t.test('GET /health authenticated returns full restricted key telemetry without private material', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`, {
      headers: {
        Authorization: `Bearer ${testSecret}`,
      },
    });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.service, 'vault-shield-persistent-signing-runtime');
    assert.equal(data.authenticated, true);
    assert.equal(data.agentAccountId, DEFAULT_AGENT_ACCOUNT_ID);
    assert.equal(data.vaultContractId, DEFAULT_CONTRACT_ID);
    assert.equal(data.restrictedPublicKey, NEW_AGENT_RESTRICTED_PUBLIC_KEY);
    assert.equal(data.keyValidation, 'VALID_RESTRICTED_KEY');
    assert.equal(data.hasSigningCapability, true);
    assert.equal(data.fullAccessKeys, 0);
    assert.equal(data.enforcedPermissions.receiverId, DEFAULT_CONTRACT_ID);
    assert.equal(data.enforcedPermissions.methodName, 'request_payment');
    assert.equal(data.enforcedPermissions.deposit, '0 yoctoNEAR');

    // Strict security assertion: zero private key leakage in response
    const jsonString = JSON.stringify(data);
    assert.equal(jsonString.includes('private'), false);
    assert.equal(jsonString.includes('secret_key'), false);
  });

  await t.test('Cross-origin request from unauthorized external domain is blocked with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`, {
      headers: {
        Origin: 'https://malicious-attacker-phishing.com',
      },
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /Origin not authorized/);
  });

  await t.test('Cross-origin request from production dashboard origin is allowed', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`, {
      headers: {
        Origin: 'https://vault-shield-two.vercel.app',
      },
    });
    assert.equal(res.status, 200);
  });

  await t.test('POST /preflight simulates policy checks without requiring signing authentication', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: 'whiteice2105.testnet',
        amountNear: '0.01',
        reason: 'Preflight server test',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.preflight);
    assert.ok(data.preflight.checks.length >= 10);
  });

  await t.test('POST /execute strictly rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: 'whiteice2105.testnet',
        amountNear: '0.01',
        dryRun: true,
      }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /Unauthorized/);
  });

  await t.test('POST /execute strictly rejects wrong secret token with 401', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong_token_xyz',
      },
      body: JSON.stringify({
        destination: 'whiteice2105.testnet',
        amountNear: '0.01',
        dryRun: true,
      }),
    });

    assert.equal(res.status, 401);
  });

  await t.test('POST /execute strictly rejects revoked previously-exposed secret with 401', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer vs_runtime_sec_7f9b8c2d1e4a6035',
      },
      body: JSON.stringify({
        destination: 'whiteice2105.testnet',
        amountNear: '0.01',
        dryRun: true,
      }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  await t.test('POST /execute with valid rotated Bearer secret succeeds in dryRun mode', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testSecret}`,
      },
      body: JSON.stringify({
        destination: 'whiteice2105.testnet',
        amountNear: '0.01',
        reason: 'Dry-run server integration test',
        dryRun: true,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, 'DRY_RUN_SUCCESS');
    assert.ok(data.preview);
    assert.equal(data.preview.receiverId, DEFAULT_CONTRACT_ID);
    assert.equal(data.preview.methodName, 'request_payment');
    assert.equal(data.preview.deposit, '0');
  });

  await t.test('POST /execute with valid x-runtime-secret header succeeds in dryRun mode', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runtime-secret': testSecret,
      },
      body: JSON.stringify({
        destination: 'whiteice2105.testnet',
        amountNear: '0.01',
        reason: 'Dry-run custom header integration test',
        dryRun: true,
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, 'DRY_RUN_SUCCESS');
  });
});
