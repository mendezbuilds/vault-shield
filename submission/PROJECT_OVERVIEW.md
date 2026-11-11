# Vault Shield — Project Overview
**Programmable Non-Custodial Payment Security Layer for Autonomous AI Agents on NEAR Protocol**

---

## 1. Executive Summary

As AI agents transition from read-only advisors to autonomous task runners, they inevitably require economic agency: procuring server compute, purchasing oracle data streams, paying for indexing credits, and transacting with other agents.

However, granting an AI agent direct custody of a private key or unrestricted wallet access is inherently hazardous:
1. **Adversarial Prompt Injection**: Malicious instructions embedded in user tasks or web data can hijack model intent and drain funds to attacker accounts.
2. **Model Hallucinations & Parameter Drift**: LLMs can miscalculate quantities, misformat recipient account IDs, or initiate unintended repeated transfers.
3. **Unbounded Treasury Exposure**: Traditional blockchain keys grant all-or-nothing balance custody; a compromised or runaway agent key can empty the entire wallet.

**Vault Shield solves this by introducing a programmable on-chain security boundary between the AI intelligence layer and treasury assets.**

The AI agent is never given direct custody of funds or FullAccess signing keys. Instead, the agent is restricted cryptographically to an isolated NEAR Function-Call access key limited exclusively to initiating bounded payment requests (`request_payment`) with strictly zero attached deposit. Spending caps, allowlists, escrow states, and approval requirements are enforced deterministically by the smart contract on NEAR Protocol.

---

## 2. Core Value Proposition

| Dimension | Standard Agent Wallet (Dangerous) | Vault Shield Architecture (Secure) |
|---|---|---|
| **Capital Custody** | Direct custody in agent's hot wallet | Non-custodial: funds reside exclusively in the smart contract |
| **Key Privileges** | FullAccess private key (can drain 100% of balance) | Restricted Function-Call key (`request_payment` only, 0 deposit) |
| **Spending Bounds** | Unbounded (model can sign any amount) | Strict on-chain caps: per-transaction limit, daily rolling budget |
| **Recipient Policy** | Model can send funds to any arbitrary address | Allowlist validation; unlisted vendors require human owner approval |
| **Prompt Injection Defense** | None: compromised prompt = immediate theft | Hard contract-enforced invariant: transactions exceeding caps are blocked |
| **Emergency Control** | Complex key rotation or seed phrase migration | Instant single-transaction on-chain pause or agent key revocation |
| **Auditability** | Off-chain logs or raw transfers | Immutable on-chain compact audit trail recorded in contract storage |

---

## 3. How It Works: The Five-Stage Security Flow

1. **Natural-Language Task Ingestion**: The AI agent receives an operational objective (e.g., *"Purchase 0.05 NEAR worth of indexing service credits from merchant.vault-parent.testnet"*).
2. **AI Decision & Strict Schema Validation**: The agent's LLM determines whether financial settlement is required. If so, it invokes the structured tool `vault_shield_request_payment`. Tool arguments are strictly validated against NEP-0010 syntax and numeric schemas before any network call.
3. **Pre-Flight Invariant Evaluation**: The agent runtime executes an advisory pre-flight check evaluating 10 security invariants (valid destination, positive amount, agent authorization, pause status, per-tx cap, daily cap, liquid solvency, queue capacity, allowlist membership, and auto-approval threshold).
4. **Contract Policy Routing**:
   - **Route A (Autonomous Auto-Dispatch)**: Destination is allowlisted AND amount $\le$ auto-approval threshold $\rightarrow$ Immediate autonomous on-chain dispatch (`PaymentDispatched` $\rightarrow$ `PaymentExecuted`).
   - **Route B (Human Approval Queue)**: Destination is unlisted OR amount exceeds threshold $\rightarrow$ Funds held in `pending_reserved` escrow awaiting human Vault Owner cryptographic sign-off.
   - **Route C (Policy Denial)**: Amount breaches transaction cap or daily budget $\rightarrow$ Transaction aborted before signing; zero funds moved.
5. **Execution Verification & On-Chain Audit**: Transactions are recorded in an immutable compact audit ring buffer, inspectable by auditors and dashboards in real time.

---

## 4. Verified Hackathon Milestones

- **Smart Contract Frozen**: `cc7760b` deployed to NEAR Testnet (`contract.vault-parent.testnet`).
- **Owner Governance Account**: `owner.vault-parent.testnet`.
- **Authorized Agent Identity**: `agent-a.vault-parent.testnet` using restricted Function-Call key (`ed25519:2H8EupC...socV9Kq`).
- **Phase 2 Verified Testnet Payment**:
  - Contract Request: `#13`
  - Transaction Hash: `Fz6LLxnizbMyu47KnrB2xzvj2QQ7YfzXv6788qxFMDXK`
  - Recipient: `merchant.vault-parent.testnet`
  - Amount: `0.1 NEAR`
  - Status: `Executed` (Confirmed on-chain)
- **Automated Test Coverage**: **76 automated tests passing in < 1 second** (`agent/tests/`).
- **Demonstration Suite**: Fully integrated client-side simulation harness with 3 canonical scenarios and custom prompt evaluation in the web dashboard.
