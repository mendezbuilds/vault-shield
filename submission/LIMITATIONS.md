# Vault Shield — Honest Implementation Boundaries & Limitations
**Transparent Capabilities, Boundaries & Roadmap**

---

## 1. Matrix: Verified On-Chain vs. Simulated Capabilities

To ensure complete clarity for judges and auditors, the matrix below delineates what has been executed on live NEAR Testnet versus what operates as client-side simulation:

| Feature / Capability | Implementation Status | Execution Boundary | Verified Evidence |
|---|:---:|:---:|---|
| **Non-Custodial Vault Contract** | Deployed on Testnet | On-Chain (`cc7760b`) | `contract.vault-parent.testnet` verified |
| **Solvency Accounting Equations** | Deployed on Testnet | On-Chain (`cc7760b`) | Storage reserve + protected balance strictly isolated |
| **Controlled Autonomous Payment** | Verified on Testnet | On-Chain (`cc7760b`) | Request `#13`, Tx `Fz6LLxnizbMyu47KnrB2xzvj2QQ7YfzXv6788qxFMDXK` |
| **Function-Call Key Confinement** | Verified on Testnet | Protocol & Contract | Agent key `ed25519:2H8EupC...` limited to `request_payment` |
| **Compact Audit Ring Buffer** | Deployed on Testnet | On-Chain (`cc7760b`) | Events `#39` and `#40` recorded on contract state |
| **AI Task Ingestion & Schema** | Implemented | Local Agent Runtime | `validatePaymentToolArgs()` validates NEP-0010 & positive decimals |
| **10 Pre-Flight Invariant Checks** | Implemented | Client-Side Advisory | Evaluates rules before signing; contract remains authoritative |
| **Dashboard Scenario Demonstrator** | Implemented | **Dry-Run Simulation** | Scenarios A, B, and C run in simulation with 0 live broadcasts |
| **Custom Prompt Evaluator** | Implemented | **Dry-Run Simulation** | Safe in-browser simulation without private key access |
| **Automated Test Suite** | 76 Passing Tests | Automated CI / Local | 76 tests pass in Node.js test runner in < 1 second |

---

## 2. Intentional Safety Boundaries in Hackathon Submission

1. **Dashboard Demonstration Operates in Safe Dry-Run Mode**:
   - The interactive scenario demonstrator in `AiAgentCockpit.tsx` operates exclusively in **DRY-RUN SIMULATION** mode.
   - When a judge clicks Scenario A, B, C or types a custom prompt, the tool parsing, schema validation, and 10 pre-flight invariant evaluations run client-side. The dashboard previews the unbroadcast Function-Call payload.
   - **Why this boundary was chosen**: Broadcasting live testnet transactions on every button click introduces RPC rate-limiting risks, faucet dependency, and latency. By decoupling simulation demonstration from historical on-chain proof (Request `#13`), judges receive instantaneous, deterministic, and safe demonstrations while being able to verify the underlying on-chain transaction on NEARBlocks.
2. **Zero Private Key Exposure in the Web Browser**:
   - The frontend application never loads, prompts for, or handles the agent's private signing key.
   - All client-side operations are purely advisory. Live transactions were executed via the CLI agent runtime (`agent/src/cli.ts`) during Phase 2.
3. **Smart Contract Code Frozen**:
   - The smart contract deployment was frozen at commit `cc7760b` during Phase 1 to guarantee immutability and prevent scope creep.

---

## 3. Known Limitations

1. **Single Token Asset Support (Native NEAR Only)**:
   - Contract `cc7760b` handles native NEAR (yoctoNEAR precision).
   - NEP-141 fungible tokens (such as USDC or USDT on NEAR) are not supported in the current contract version.
2. **Gas Allowance Dependency**:
   - The agent account (`agent-a.vault-parent.testnet`) must hold a nominal testnet gas balance to broadcast Function-Call transactions, even though attached deposit is strictly zero.
   - Sponsoring gas via a relayer or meta-transaction framework is planned for future iterations.
3. **Single Active Agent Topology on Testnet**:
   - While the smart contract supports an arbitrary number of authorized agents (and automated unit tests verify concurrent agent quotas), testnet deployment was validated using a single active worker agent (`agent-a.vault-parent.testnet`) and one revoked test identity (`agent-rev.vault-parent.testnet`).
4. **LLM Provider Scope**:
   - The intelligence layer implements native Google Gemini (`GeminiLLMProvider`) and deterministic mock (`MockLLMProvider`).
   - Additional providers (such as OpenAI or Anthropic) follow the existing `LLMProvider` interface but were not duplicated during the sprint.
5. **Network Boundary**:
   - Vault Shield is deployed and verified exclusively on NEAR Public Testnet. No mainnet contracts have been deployed.

---

## 4. Future Roadmap (Beyond Hackathon)

1. **NEP-141 Multi-Token Support**: Support multi-token vaults holding stablecoins (USDC/USDT) with per-token spending policies.
2. **Account Aggregation & Relayer Gas Sponsorship**: Integrate NEAR Chain Signatures and relayer infrastructure to sponsor agent transaction gas, eliminating the need for agent gas funding.
3. **Time-Locked Owner Approvals & Escalation**: Implement configurable timelocks for Route B pending requests exceeding defined risk thresholds.
4. **Multi-Agent Swarm Governance**: Dynamic allocation of sub-budgets to subagents spawned hierarchically by a primary coordinator agent.
