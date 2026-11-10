# Vault Shield — Alpha Autonomous Agent Runtime

**Target Agent Account**: `agent-a.vault-parent.testnet`  
**Target Vault Contract**: `contract.vault-parent.testnet`  
**Network**: NEAR Public Testnet  
**Access Key In-Scope**: Restricted Function-Call Access Key (`ed25519:2H8EupC9ApTAPYPMu3a5DWxDdcX6X3wX22tcqsocV9Kq`)  
**Frozen Contract Commit**: `cc7760b`  

---

## 1. Overview

The **Alpha Autonomous Agent Runtime** is a standalone, headless TypeScript module that enables `agent-a.vault-parent.testnet` to autonomously formulate, pre-flight simulate, sign, and dispatch payment requests directly to `contract.vault-parent.testnet` on NEAR Public Testnet.

### Architectural Principles:
1. **Total Isolation from Web Frontend**: Completely isolated from `frontend/` and Vercel serverless environments.
2. **Restricted Function-Call Key Confinement**: Signed exclusively using the agent's restricted key. Method is restricted to `request_payment`, attached deposit is strictly zero (`deposit = 0n`), and receiver is strictly `contract.vault-parent.testnet`.
3. **Pre-Flight Invariant Simulation**: Read-only dry-run checks verify authorization, vault pause state, spending caps, daily buckets, queue limits, and solvency before signing to conserve gas and avoid avoidable on-chain denials.
4. **Local Idempotency & Concurrency Guard**: A persistent local execution ledger prevents duplicate task initiation, and an atomic process lock prevents concurrent nonce collisions.
5. **Strict Execution Boundary**: In Phase 1, live broadcasts are prohibited; all commands operate in simulation and dry-run verification mode.

---

## 2. Installation & Build

```bash
cd agent
npm install
npm run build
```

---

## 3. Configuration

Environment variables can be injected via OS environment variables or a local `.env.agent` file:

```bash
cp .env.agent.example .env.agent
```

### Supported Variables:
| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEAR_NETWORK_ID` | Target NEAR network (`testnet` / `mainnet`) | `testnet` |
| `NEAR_RPC_URL` | Primary JSON-RPC endpoint | `https://rpc.testnet.near.org` |
| `NEAR_FALLBACK_RPC_URL` | Secondary failover RPC endpoint | `https://test.rpc.fastnear.com` |
| `VAULT_CONTRACT_ID` | Vault Shield contract account | `contract.vault-parent.testnet` |
| `AGENT_ACCOUNT_ID` | Authorized agent account | `agent-a.vault-parent.testnet` |
| `AGENT_EXPECTED_PUBLIC_KEY` | Expected restricted Function-Call key | `ed25519:2H8EupC9ApTAPYPMu3a5DWxDdcX6X3wX22tcqsocV9Kq` |
| `AGENT_PRIVATE_KEY` | Restricted private key (ed25519:...) | `null` (Read-only mode) |
| `AGENT_LEDGER_PATH` | Path to persistent JSON execution ledger | `./data/ledger.json` |
| `AGENT_LOCKFILE_PATH` | Path to concurrency lockfile | `./.agent.lock` |
| `AGENT_PHASE1_STRICT_BOUNDARY` | Enforces Phase 1 simulation boundary | `true` |

---

## 4. CLI Commands

### 4.1 Run Policy Demonstration Suite (Day 2)
Executes reproducible, dry-run demonstration scenarios proving that AI agent tasks strictly respect Vault Shield's security and policy boundaries across all 3 canonical routes (Autonomous spend, Human approval queue, Prompt injection defense):
```bash
# Run all 3 demonstration scenarios:
npm run agent demo

# Run individual scenarios:
npm run agent demo -- --scenario auto
npm run agent demo -- --scenario approval
npm run agent demo -- --scenario injection
```

### 4.2 Execute Natural-Language AI Agent Task (Task 1.1)
Accepts a natural-language task prompt, generates structured tool calls via the configured provider (`mock` or `gemini`), validates arguments with defense-in-depth, and routes execution through the Vault Shield policy and restricted signer pipeline:
```bash
npm run agent task -- --prompt "Pay 0.1 NEAR to merchant.vault-parent.testnet for API compute credits"
# or directly:
node dist/cli.js task --prompt "Pay 0.1 NEAR to merchant.vault-parent.testnet for API compute credits"
```

### 4.2 Display On-Chain Status
Queries live contract policy, solvency, queue limits, and access key permissions:
```bash
npm run agent status
# or
node dist/cli.js status
```

### 4.3 Run Advisory Pre-Flight Check
Simulates all 10 on-chain policy invariants for a prospective payment:
```bash
node dist/cli.js preflight --dest merchant.vault-parent.testnet --amount 0.15 --reason "Batch LLM Embeddings"
```

### 4.4 Formulate & Preview Payment Request (Dry-Run)
Formulates the exact transaction payload, validates zero deposit, and records dry-run outcome in the local execution ledger without broadcasting:
```bash
node dist/cli.js request --dest merchant.vault-parent.testnet --amount 0.15 --reason "LLM Inference Payment" --dry-run
```

---

## 5. Verification Suite

Run all automated unit, pre-flight, reconciliation, signer, and security tests:
```bash
npm test
# or
node --test tests/**/*.test.ts
```

---

## 6. Process Lock & Operational TTL Constraints

The agent runtime uses an atomic process lock (`.agent.lock`) to prevent concurrent nonce collisions and ledger write races between `request` and `reconcile` operations.

### Lock Safety & 15-Minute TTL:
- **Lock Acquisition**: Uses POSIX `openSync('wx')` atomic flag for kernel-level mutual exclusion across threads and processes.
- **Lock Scope**: Enforced across both `agent request` and `agent reconcile` operations, accompanied by atomic in-memory cache reloads (`ledger.reload()`).
- **Static 15-Minute TTL**: Stale locks older than 15 minutes (`900,000ms`) or belonging to terminated PIDs are safely reclaimed.
- **Phase 2 Operational Constraint**: The initial Phase 2 live testnet test is **strictly constrained to short-lived CLI operations** (individual payment executions completing within 2–5 seconds).
- **Daemon Requirement**: Active heartbeat-based TTL renewal must be implemented before unattended background daemon execution or long-running batch-worker processes are authorized.

