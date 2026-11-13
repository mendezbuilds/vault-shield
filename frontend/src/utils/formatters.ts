import { AuditEventType, NEAR_EXPLORER_BASE } from '../types/contract';

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
    
    // Scale remainder to requested decimals
    const paddedRemainder = remainder.toString().padStart(24, '0');
    const frac = paddedRemainder.slice(0, decimals);
    
    return `${whole.toLocaleString()}.${frac}`;
  } catch (err) {
    console.error('formatNear error', err);
    return '0.0000';
  }
}

/**
 * Parses a user input NEAR string (e.g. "0.5") into yoctoNEAR string.
 */
export function parseNearToYocto(nearStr: string): string {
  try {
    const clean = nearStr.trim();
    if (!clean || isNaN(Number(clean))) return '0';
    
    const parts = clean.split('.');
    const whole = parts[0] ? BigInt(parts[0]) : 0n;
    let fracStr = parts[1] || '';
    
    if (fracStr.length > 24) {
      fracStr = fracStr.slice(0, 24);
    } else {
      fracStr = fracStr.padEnd(24, '0');
    }
    
    const frac = BigInt(fracStr);
    const ONE_NEAR = 10n ** 24n;
    const total = whole * ONE_NEAR + frac;
    return total.toString();
  } catch (err) {
    console.error('parseNearToYocto error', err);
    return '0';
  }
}

/**
 * Formats a nanosecond timestamp (from NEAR contract) into a localized string.
 */
export function formatTimestamp(nanos: number | string | bigint): string {
  try {
    const ms = Number(BigInt(nanos) / 1_000_000n);
    const date = new Date(ms);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Calculates human-readable relative time (e.g. "2 min ago", "just now").
 */
export function timeAgo(nanos: number | string | bigint): string {
  try {
    const ms = Number(BigInt(nanos) / 1_000_000n);
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return 'N/A';
  }
}

/**
 * Truncates an Account ID or Hash for neat display.
 */
export function truncateId(id: string, startLen = 8, endLen = 8): string {
  if (!id) return '';
  if (id.length <= startLen + endLen + 3) return id;
  return `${id.slice(0, startLen)}...${id.slice(-endLen)}`;
}

/**
 * Generates an explorer link for a NEAR Testnet Account.
 */
export function getExplorerAccountUrl(accountId: string): string {
  return `${NEAR_EXPLORER_BASE}/address/${accountId}`;
}

/**
 * Generates an explorer link for a NEAR Testnet Transaction.
 */
export function getExplorerTxUrl(txHash: string): string {
  if (!txHash) return '';
  return `${NEAR_EXPLORER_BASE}/txns/${txHash}`;
}

/**
 * Generates an explorer link for a downstream NEAR Transfer Receipt.
 * Returns null if receiptId is missing or unverified, ensuring no broken or speculative links.
 */
export function getExplorerReceiptUrl(receiptId?: string | null): string | null {
  if (!receiptId || !receiptId.trim() || receiptId.toLowerCase().includes('not yet verified')) {
    return null;
  }
  return `https://explorer.testnet.near.org/transactions/${receiptId.trim()}`;
}

/**
 * Formats a transfer receipt ID for safe UI presentation.
 * Returns "Receipt not yet verified" if the receipt ID cannot be obtained.
 */
export function formatReceiptId(receiptId?: string | null): string {
  if (!receiptId || !receiptId.trim()) {
    return 'Receipt not yet verified';
  }
  return receiptId.trim();
}


/**
 * Returns UI metadata for Audit Event Types.
 */
export function getAuditEventMeta(eventType: AuditEventType): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (eventType) {
    case 'PaymentDispatched':
      return {
        label: 'Payment Dispatched',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
        dotClass: 'bg-blue-600',
      };
    case 'PaymentExecuted':
      return {
        label: 'Payment Executed',
        badgeClass: 'bg-near-light text-near-dark border-near-green/40',
        dotClass: 'bg-near-dark',
      };
    case 'PaymentPending':
      return {
        label: 'Payment Pending',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'PaymentApproved':
      return {
        label: 'Payment Approved',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        dotClass: 'bg-emerald-600',
      };
    case 'PaymentRejected':
      return {
        label: 'Payment Rejected',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
        dotClass: 'bg-rose-600',
      };
    case 'PaymentPolicyDenied':
      return {
        label: 'Policy Denied',
        badgeClass: 'bg-rose-50 text-rose-900 border-rose-300',
        dotClass: 'bg-rose-600',
      };
    case 'PaymentPolicyInvalidated':
      return {
        label: 'Policy Invalidated',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
        dotClass: 'bg-amber-600',
      };
    case 'PaymentExpired':
      return {
        label: 'Payment Expired',
        badgeClass: 'bg-charcoal-100 text-charcoal-700 border-border',
        dotClass: 'bg-charcoal-400',
      };
    case 'PaymentFailed':
      return {
        label: 'Payment Failed',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
        dotClass: 'bg-rose-600',
      };
    case 'VaultPaused':
    case 'VaultAutoPaused':
      return {
        label: eventType === 'VaultAutoPaused' ? 'Vault Auto-Paused' : 'Vault Paused',
        badgeClass: 'bg-amber-100 text-amber-950 border-amber-400',
        dotClass: 'bg-amber-600',
      };
    case 'VaultUnpaused':
      return {
        label: 'Vault Resumed',
        badgeClass: 'bg-near-light text-near-dark border-near-green/40',
        dotClass: 'bg-near-dark',
      };
    case 'AgentRegistered':
      return {
        label: 'Agent Registered',
        badgeClass: 'bg-purple-50 text-purple-900 border-purple-200',
        dotClass: 'bg-purple-600',
      };
    case 'AgentRevoked':
      return {
        label: 'Agent Revoked',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-300',
        dotClass: 'bg-rose-600',
      };
    case 'PolicyUpdated':
      return {
        label: 'Policy Updated',
        badgeClass: 'bg-indigo-50 text-indigo-900 border-indigo-200',
        dotClass: 'bg-indigo-600',
      };
    case 'DestinationAllowlisted':
      return {
        label: 'Destination Allowed',
        badgeClass: 'bg-teal-50 text-teal-900 border-teal-200',
        dotClass: 'bg-teal-600',
      };
    case 'DestinationDelisted':
      return {
        label: 'Destination Delisted',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
        dotClass: 'bg-amber-600',
      };
    case 'OwnerWithdrawal':
      return {
        label: 'Owner Withdrawal',
        badgeClass: 'bg-blue-50 text-blue-900 border-blue-200',
        dotClass: 'bg-blue-600',
      };
    case 'CriticalDiscrepancy':
      return {
        label: 'Critical Discrepancy',
        badgeClass: 'bg-rose-100 text-rose-950 border-rose-400',
        dotClass: 'bg-rose-600 animate-ping',
      };
    default:
      return {
        label: eventType,
        badgeClass: 'bg-surface-white text-charcoal-700 border-border',
        dotClass: 'bg-charcoal-400',
      };
  }
}

