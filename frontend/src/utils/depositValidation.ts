import { formatNear } from './formatters';

export interface DepositValidationResult {
  valid: boolean;
  error?: string;
  yoctoAmount?: string;
  formattedNear?: string;
}

// Recommended network gas reserve (0.005 NEAR) kept in the user's wallet to ensure transaction execution
export const RECOMMENDED_GAS_RESERVE_YOCTO = 5000000000000000000000n; // 0.005 NEAR

/**
 * Validates a user-entered NEAR deposit amount against string formatting rules,
 * 24-decimal yoctoNEAR precision limits, and available spendable wallet balance.
 */
export function validateDepositAmount(
  amountStr: string,
  walletBalanceYocto: string | null
): DepositValidationResult {
  const clean = (amountStr || '').trim();

  if (!clean) {
    return { valid: false, error: 'Please enter a deposit amount in NEAR' };
  }

  // Reject negative numbers, scientific notation, letters, and malformed dots
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    return { valid: false, error: 'Invalid amount: must be a positive decimal number' };
  }

  const parts = clean.split('.');
  const wholeStr = parts[0] || '0';
  const fracStr = parts[1] || '';

  // Max 24 decimal places (1 yoctoNEAR = 10^-24 NEAR)
  if (fracStr.length > 24) {
    return {
      valid: false,
      error: 'Excess precision: NEAR supports at most 24 decimal places (yoctoNEAR)',
    };
  }

  const whole = BigInt(wholeStr);
  const paddedFrac = fracStr.padEnd(24, '0');
  const yocto = whole * (10n ** 24n) + BigInt(paddedFrac);

  if (yocto <= 0n) {
    return { valid: false, error: 'Deposit amount must be strictly greater than 0 NEAR' };
  }

  // Check against available spendable balance if known
  if (walletBalanceYocto) {
    try {
      const balance = BigInt(walletBalanceYocto);
      if (balance <= RECOMMENDED_GAS_RESERVE_YOCTO) {
        return {
          valid: false,
          error: `Insufficient wallet balance to cover network gas fee (${formatNear(RECOMMENDED_GAS_RESERVE_YOCTO, 4)} NEAR required)`,
        };
      }

      const maxSpendable = balance - RECOMMENDED_GAS_RESERVE_YOCTO;
      if (yocto > maxSpendable) {
        return {
          valid: false,
          error: `Amount exceeds spendable balance (Max spendable: ${formatNear(maxSpendable, 4)} NEAR after ${formatNear(RECOMMENDED_GAS_RESERVE_YOCTO, 4)} NEAR gas reserve)`,
        };
      }
    } catch {
      // Ignore BigInt parse errors on wallet balance
    }
  }

  return {
    valid: true,
    yoctoAmount: yocto.toString(),
    formattedNear: clean,
  };
}

/**
 * Computes maximum spendable NEAR amount from a wallet balance in yoctoNEAR.
 */
export function getMaxSpendableNear(walletBalanceYocto: string | null): string {
  if (!walletBalanceYocto) return '0';
  try {
    const balance = BigInt(walletBalanceYocto);
    if (balance <= RECOMMENDED_GAS_RESERVE_YOCTO) return '0';
    const spendable = balance - RECOMMENDED_GAS_RESERVE_YOCTO;
    return formatNear(spendable, 4);
  } catch {
    return '0';
  }
}

