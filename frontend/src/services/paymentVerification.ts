/**
 * Vault Shield - Payment Receipt Tracking & On-Chain Verification Service
 *
 * Provides authoritative read-only verification of downstream payment receipts
 * and live recipient balances via NEAR Testnet JSON-RPC (FastNear).
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * - Read-only RPC enhancements only.
 * - Zero transaction submission or key signing logic.
 * - Parent transaction hash and downstream transfer receipt ID are strictly distinguished.
 * - Total account balance is never conflated with spendable / available balance.
 * - Missing receipt IDs display "Receipt not yet verified" without speculative URLs.
 */

/**
 * Converts yoctoNEAR string to human-readable NEAR with fixed precision.
 * 1 NEAR = 10^24 yoctoNEAR.
 */
export function formatNear(yoctoStr: string | number | bigint, decimals: number = 4): string {
  try {
    const yocto = BigInt(yoctoStr || '0');
    if (yocto === 0n) return '0.0000';

    const ONE_NEAR = 10n ** 24n;
    const whole = yocto / ONE_NEAR;
    const remainder = yocto % ONE_NEAR;

    const paddedRemainder = remainder.toString().padStart(24, '0');
    const frac = paddedRemainder.slice(0, decimals);

    return `${whole.toLocaleString()}.${frac}`;
  } catch {
    return '0.0000';
  }
}

export const FASTNEAR_RPC_ENDPOINT = 'https://test.rpc.fastnear.com';
export const FALLBACK_RPC_ENDPOINT = 'https://rpc.testnet.near.org';
export const NEARBLOCKS_EXPLORER_BASE = 'https://testnet.nearblocks.io';
export const NEAR_EXPLORER_BASE = 'https://explorer.testnet.near.org';

/**
 * Protocol constant: 1 byte of on-chain storage requires 10^19 yoctoNEAR (0.00001 NEAR).
 */
export const YOCTO_PER_BYTE = 10_000_000_000_000_000_000n;

/**
 * Explanatory guidance required by Requirement 4:
 * Clarifies why contract payments appear as transfer receipts rather than standard wallet-originated txs.
 */
export const RECEIPT_EXPLANATION_NOTE =
  "Vault Shield payments are executed by the vault contract. The recipient receives funds through a NEAR transfer receipt, which may not appear as a normal wallet-originated transaction in the recipient's standard activity history. Verify the transfer through its receipt details and the recipient's on-chain balance.";

/**
 * Verification Status Triad for a Payment
 */
export type VerificationStatusState = 'confirmed' | 'pending' | 'unavailable' | 'unverified';

export interface PaymentVerificationState {
  parentTxConfirmed: VerificationStatusState;
  transferReceiptConfirmed: VerificationStatusState;
  recipientBalanceVerified: 'verified' | 'outdated' | 'error' | 'pending' | 'idle';
}

/**
 * Comprehensive Vault Payment Record with separate parent tx and receipt tracking.
 */
export interface VaultPaymentRecord {
  id: string;
  requestId: number;
  senderVault: string;
  recipient: string;
  amountNear: string;
  amountYocto: string;
  currency: 'NEAR';
  status: 'PAYMENT_EXECUTED' | 'PAYMENT_DISPATCHED' | 'PENDING_APPROVAL' | 'REJECTED' | 'FAILED';
  parentTxHash: string;
  receiptId: string | null; // null represents "Receipt not yet verified"
  blockHeight?: number;
  timestamp?: number; // milliseconds
  reason?: string;
  executionRoute?: string;
  parentTxConfirmed: boolean;
  receiptConfirmed: boolean;
  signerId?: string;
}

/**
 * Detailed Recipient Account Balance Breakdown
 * Authoritative on-chain numbers separating total account balance from spendable balance.
 */
export interface RecipientBalanceReport {
  accountId: string;
  totalNear: string;
  totalYocto: string;
  availableNear: string;
  availableYocto: string;
  storageReservedNear: string;
  storageReservedYocto: string;
  storageUsageBytes: number;
  lastVerifiedAt: number | null;
  isStale: boolean;
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string | null;
  blockHeight?: number;
}

/**
 * Requirement 6: Verified Historical Successful Payments
 * Verified on-chain on NEAR Public Testnet without initiating any new transactions.
 */
export const HISTORICAL_VERIFIED_PAYMENTS: VaultPaymentRecord[] = [
  {
    id: 'historical-payment-1',
    requestId: 1,
    senderVault: 'vault-cleartoad8704.testnet',
    recipient: 'whiteice2105.testnet',
    amountNear: '0.01',
    amountYocto: '10000000000000000000000',
    currency: 'NEAR',
    status: 'PAYMENT_EXECUTED',
    parentTxHash: '5sCCVLasZVH2jSdAp5gGUgnvae3cBeUmZk6xUJnMQzWb',
    receiptId: '8xinGvkY97YegPtuLGZjChXwafUucYwpUgKgZi2dzjAo',
    blockHeight: 277374799,
    timestamp: 1794493454521,
    reason: 'Autonomous test disbursement of 0.01 NEAR',
    executionRoute: 'Scenario A: Autonomous Auto-Dispatch',
    parentTxConfirmed: true,
    receiptConfirmed: true,
    signerId: 'agent.cleartoad8704.testnet',
  },
  {
    id: 'historical-payment-2',
    requestId: 4,
    senderVault: 'vault-cleartoad8704.testnet',
    recipient: 'smoothgif8182.testnet',
    amountNear: '0.01',
    amountYocto: '10000000000000000000000',
    currency: 'NEAR',
    status: 'PAYMENT_EXECUTED',
    parentTxHash: '6a4RreMyYmBT63HThen48jQYsG5pWmSFFL8wHiVSzNsE',
    receiptId: 'DwuvNUw61RmEoVxPMZrySA5a7PiwSjf1D3tkpfK2Wy9u',
    blockHeight: 277382947,
    timestamp: 1794498174682,
    reason: 'Autonomous test disbursement of 0.01 NEAR (Approved by Owner)',
    executionRoute: 'Scenario B: Owner Approved Dispatch',
    parentTxConfirmed: true,
    receiptConfirmed: true,
    signerId: 'cleartoad8704.testnet',
  },
  {
    id: 'historical-payment-3',
    requestId: 2,
    senderVault: 'vault-cleartoad8704.testnet',
    recipient: 'whiteice2105.testnet',
    amountNear: '0.01',
    amountYocto: '10000000000000000000000',
    currency: 'NEAR',
    status: 'PAYMENT_EXECUTED',
    parentTxHash: '2Vjt5UvG8JtQ273TpxPcnq5JZwJz6fYYtnHXNuf8GX1G',
    receiptId: 'EhTVvZjzhGh5BckXSndXryfZGhyZPN28sRmiGfG4vaAx',
    blockHeight: 277380962,
    timestamp: 1794497418000,
    reason: 'Autonomous test disbursement of 0.01 NEAR',
    executionRoute: 'Scenario A: Autonomous Auto-Dispatch',
    parentTxConfirmed: true,
    receiptConfirmed: true,
    signerId: 'agent.cleartoad8704.testnet',
  },
  {
    id: 'historical-payment-4',
    requestId: 3,
    senderVault: 'vault-cleartoad8704.testnet',
    recipient: 'whiteice2105.testnet',
    amountNear: '0.15',
    amountYocto: '150000000000000000000000',
    currency: 'NEAR',
    status: 'PAYMENT_EXECUTED',
    parentTxHash: 'Ge3fuzydjRkYNsmboEVRCpVz3viD58dRxxifbRgfkCE5',
    receiptId: 'J2BEPHwcMCyMQnbn9FdvxEjQuraV6uUt8gBKhT1Eitob',
    blockHeight: 277381504,
    timestamp: 1794497655000,
    reason: 'Autonomous test disbursement of 0.15 NEAR',
    executionRoute: 'Scenario A: Autonomous Auto-Dispatch',
    parentTxConfirmed: true,
    receiptConfirmed: true,
    signerId: 'agent.cleartoad8704.testnet',
  },
];

/**
 * Builds an explorer link for the parent transaction.
 * Never generates broken or speculative URLs.
 */
export function getParentTxExplorerUrl(parentTxHash?: string | null): string | null {
  if (!parentTxHash || !parentTxHash.trim()) {
    return null;
  }
  return `${NEARBLOCKS_EXPLORER_BASE}/txns/${parentTxHash.trim()}`;
}

/**
 * Builds a valid explorer link for the downstream transfer receipt.
 * Returns null if receiptId is missing or unverified, ensuring no broken or speculative links.
 */
export function getReceiptExplorerUrl(receiptId?: string | null): string | null {
  if (!receiptId || !receiptId.trim() || receiptId.toLowerCase().includes('not yet verified')) {
    return null;
  }
  return `${NEAR_EXPLORER_BASE}/transactions/${receiptId.trim()}`;
}

/**
 * Builds an explorer link to the parent transaction anchored to the receipt on NearBlocks.
 * Returns null if either parentTxHash or receiptId is missing.
 */
export function getReceiptNearBlocksAnchorUrl(
  parentTxHash?: string | null,
  receiptId?: string | null
): string | null {
  if (
    !parentTxHash ||
    !parentTxHash.trim() ||
    !receiptId ||
    !receiptId.trim() ||
    receiptId.toLowerCase().includes('not yet verified')
  ) {
    return null;
  }
  return `${NEARBLOCKS_EXPLORER_BASE}/txns/${parentTxHash.trim()}#${receiptId.trim()}`;
}

/**
 * Calculates accurate on-chain balance breakdown for an account.
 * Crucially distinguishes Total Account Balance from Spendable/Available Balance.
 */
export function calculateBalanceBreakdown(
  amountYoctoStr: string,
  storageUsageBytes: number,
  lockedYoctoStr: string = '0'
): {
  totalNear: string;
  totalYocto: string;
  availableNear: string;
  availableYocto: string;
  storageReservedNear: string;
  storageReservedYocto: string;
  storageUsageBytes: number;
} {
  const amountYocto = BigInt(amountYoctoStr || '0');
  const lockedYocto = BigInt(lockedYoctoStr || '0');
  const totalYocto = amountYocto + lockedYocto;

  const storageReservedYocto = BigInt(storageUsageBytes || 0) * YOCTO_PER_BYTE;
  const availableYocto = amountYocto > storageReservedYocto ? amountYocto - storageReservedYocto : 0n;

  return {
    totalNear: formatNear(totalYocto.toString(), 5),
    totalYocto: totalYocto.toString(),
    availableNear: formatNear(availableYocto.toString(), 5),
    availableYocto: availableYocto.toString(),
    storageReservedNear: formatNear(storageReservedYocto.toString(), 5),
    storageReservedYocto: storageReservedYocto.toString(),
    storageUsageBytes,
  };
}

// In-memory cache for recipient balances to support stale fallback on RPC error
const recipientBalanceCache = new Map<string, RecipientBalanceReport>();

/**
 * Live Recipient Balance Verification Service
 * Authoritative on-chain query using FastNear RPC with graceful stale fallback.
 */
export async function queryRecipientBalance(
  accountId: string,
  options?: {
    forceRefresh?: boolean;
    rpcUrl?: string;
  }
): Promise<RecipientBalanceReport> {
  const cleanAccountId = accountId.trim();
  if (!cleanAccountId) {
    return {
      accountId: '',
      totalNear: '0',
      totalYocto: '0',
      availableNear: '0',
      availableYocto: '0',
      storageReservedNear: '0',
      storageReservedYocto: '0',
      storageUsageBytes: 0,
      lastVerifiedAt: null,
      isStale: false,
      status: 'error',
      errorMessage: 'Account ID is empty or invalid',
    };
  }

  const cached = recipientBalanceCache.get(cleanAccountId);
  const now = Date.now();

  // Return non-stale cached value if within 10s and not force-refreshed
  if (!options?.forceRefresh && cached && cached.status === 'success' && cached.lastVerifiedAt && now - cached.lastVerifiedAt < 10000) {
    return cached;
  }

  const endpoints = options?.rpcUrl
    ? [options.rpcUrl]
    : [
        FASTNEAR_RPC_ENDPOINT,
        ...(typeof window !== 'undefined' ? ['/api/rpc'] : []),
        FALLBACK_RPC_ENDPOINT,
      ];


  let lastErrorMsg = 'Failed to connect to NEAR Testnet RPC';

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `verify-balance-${Date.now()}`,
          method: 'query',
          params: {
            request_type: 'view_account',
            finality: 'final',
            account_id: cleanAccountId,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data.result && data.result.amount !== undefined) {
          const breakdown = calculateBalanceBreakdown(
            data.result.amount,
            data.result.storage_usage || 0,
            data.result.locked || '0'
          );

          const report: RecipientBalanceReport = {
            accountId: cleanAccountId,
            ...breakdown,
            lastVerifiedAt: Date.now(),
            isStale: false,
            status: 'success',
            errorMessage: null,
            blockHeight: data.result.block_height,
          };

          recipientBalanceCache.set(cleanAccountId, report);
          return report;
        }

        if (data.error) {
          const errData = data.error.data || data.error.message || JSON.stringify(data.error);
          if (String(errData).includes('does not exist') || String(errData).includes('UNKNOWN_ACCOUNT')) {
            const notFoundReport: RecipientBalanceReport = {
              accountId: cleanAccountId,
              totalNear: '0',
              totalYocto: '0',
              availableNear: '0',
              availableYocto: '0',
              storageReservedNear: '0',
              storageReservedYocto: '0',
              storageUsageBytes: 0,
              lastVerifiedAt: Date.now(),
              isStale: false,
              status: 'error',
              errorMessage: `Account '${cleanAccountId}' does not exist on NEAR Testnet`,
            };
            return notFoundReport;
          }
          lastErrorMsg = errData;
        }
      }
    } catch (err: any) {
      lastErrorMsg = err?.message || String(err);
    }
  }

  // RPC failed: If we have a cached prior result, preserve it and mark as potentially outdated
  if (cached && cached.totalNear) {
    const staleReport: RecipientBalanceReport = {
      ...cached,
      isStale: true,
      status: 'error',
      errorMessage: `RPC query failed (${lastErrorMsg}). Displaying previously verified balance (potentially outdated).`,
    };
    return staleReport;
  }

  // Zero cached data and RPC failed
  return {
    accountId: cleanAccountId,
    totalNear: '0',
    totalYocto: '0',
    availableNear: '0',
    availableYocto: '0',
    storageReservedNear: '0',
    storageReservedYocto: '0',
    storageUsageBytes: 0,
    lastVerifiedAt: null,
    isStale: false,
    status: 'error',
    errorMessage: `Balance verification failed: ${lastErrorMsg}`,
  };
}

/**
 * Queries transaction status and extracts the downstream transfer receipt for a recipient.
 * If the receipt ID cannot be obtained, returns receiptId = null ("Receipt not yet verified").
 */
export async function verifyPaymentReceiptOnChain(
  parentTxHash: string,
  recipient: string,
  signerHint?: string
): Promise<{
  receiptId: string | null;
  parentTxConfirmed: boolean;
  receiptConfirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  timestamp?: number;
  error?: string;
}> {
  if (!parentTxHash || !parentTxHash.trim()) {
    return {
      receiptId: null,
      parentTxConfirmed: false,
      receiptConfirmed: false,
      error: 'Missing parent transaction hash',
    };
  }

  const signersToTry = [
    signerHint,
    'agent.cleartoad8704.testnet',
    'cleartoad8704.testnet',
    'vault-cleartoad8704.testnet',
  ].filter((s): s is string => Boolean(s));

  const endpoints = [
    FASTNEAR_RPC_ENDPOINT,
    ...(typeof window !== 'undefined' ? ['/api/rpc'] : []),
    FALLBACK_RPC_ENDPOINT,
  ];

  for (const endpoint of endpoints) {
    for (const signer of signersToTry) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `verify-tx-${Date.now()}`,
            method: 'tx',
            params: [parentTxHash.trim(), signer],
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          if (data.result && data.result.receipts_outcome) {
            const parentTxConfirmed = Boolean(
              data.result.status?.SuccessValue !== undefined ||
              data.result.final_execution_status === 'FINAL'
            );

            // Scan receipts_outcome for the downstream receipt transferring funds to recipient
            const downstreamOutcome = data.result.receipts_outcome.find(
              (ro: any) => ro.outcome?.executor_id === recipient
            );

            if (downstreamOutcome) {
              const receiptConfirmed = Boolean(
                downstreamOutcome.outcome?.status?.SuccessValue !== undefined
              );

              return {
                receiptId: downstreamOutcome.id || null,
                parentTxConfirmed,
                receiptConfirmed,
                blockHash: downstreamOutcome.block_hash,
              };
            }

            // Parent transaction succeeded but receipt for this specific recipient not yet resolved
            return {
              receiptId: null,
              parentTxConfirmed,
              receiptConfirmed: false,
            };
          }
        }
      } catch {
        // Try next signer or endpoint
      }
    }
  }

  return {
    receiptId: null,
    parentTxConfirmed: false,
    receiptConfirmed: false,
    error: 'Could not query transaction receipts from NEAR RPC',
  };
}

/**
 * Formats a receipt ID safely for UI display.
 * If null, undefined, or empty, returns "Receipt not yet verified".
 */
export function formatReceiptId(receiptId?: string | null): string {
  if (!receiptId || !receiptId.trim()) {
    return 'Receipt not yet verified';
  }
  return receiptId.trim();
}
