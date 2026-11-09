import { VAULT_CONTRACT_ID, TESTNET_RPC_URL } from '../types/contract';
import { formatNear } from '../utils/formatters';

export interface ExternalDepositRecord {
  txHash: string;
  senderId: string;
  receiverId: string;
  amountNear: string;
  amountYocto: string;
  timestamp: number;
  status: 'confirmed';
  networkId: string;
  source: 'direct_transfer';
  blockHash?: string;
}

const STORAGE_KEY_PREFIX = 'vault_shield_deposits_';

function getStorageKey(contractId: string = VAULT_CONTRACT_ID, networkId: string = 'testnet'): string {
  return `${STORAGE_KEY_PREFIX}${contractId}_${networkId}`;
}

export class ExternalDepositStorageService {
  /**
   * Retrieves all confirmed external deposits for this contract from local storage.
   * Sorted descending by timestamp (newest first).
   */
  public getDeposits(contractId: string = VAULT_CONTRACT_ID, networkId: string = 'testnet'): ExternalDepositRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(getStorageKey(contractId, networkId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      console.warn('[DepositStorage] Failed to read deposits from localStorage:', err);
      return [];
    }
  }

  /**
   * Records a confirmed external deposit into local storage with deduplication.
   * Emits a 'vault_deposit_recorded' event for live reactivity across tabs / components.
   */
  public saveDeposit(deposit: ExternalDepositRecord, contractId: string = VAULT_CONTRACT_ID, networkId: string = 'testnet'): boolean {
    if (typeof window === 'undefined') return false;
    if (!deposit.txHash || !deposit.senderId || !deposit.amountNear || deposit.status !== 'confirmed') {
      console.warn('[DepositStorage] Invalid deposit record rejected:', deposit);
      return false;
    }

    try {
      const key = getStorageKey(contractId, networkId);
      const existing = this.getDeposits(contractId, networkId);

      // Duplicate prevention (case-insensitive hash comparison)
      const isDuplicate = existing.some(
        d => d.txHash.toLowerCase() === deposit.txHash.toLowerCase()
      );
      if (isDuplicate) {
        console.log('[DepositStorage] Duplicate deposit hash skipped:', deposit.txHash);
        return false;
      }

      const updated = [deposit, ...existing];
      localStorage.setItem(key, JSON.stringify(updated));

      // Dispatch event for UI reactivity
      window.dispatchEvent(new CustomEvent('vault_deposit_recorded', { detail: deposit }));
      return true;
    } catch (err) {
      console.error('[DepositStorage] Failed to save deposit to localStorage:', err);
      return false;
    }
  }

  /**
   * Removes a deposit by transaction hash (for testing or cleanup).
   */
  public removeDeposit(txHash: string, contractId: string = VAULT_CONTRACT_ID, networkId: string = 'testnet'): void {
    if (typeof window === 'undefined') return;
    try {
      const key = getStorageKey(contractId, networkId);
      const existing = this.getDeposits(contractId, networkId);
      const updated = existing.filter(d => d.txHash.toLowerCase() !== txHash.toLowerCase());
      localStorage.setItem(key, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('vault_deposit_recorded'));
    } catch (err) {
      console.warn('[DepositStorage] Failed to remove deposit:', err);
    }
  }

  /**
   * Cryptographically verifies a past transaction on NEAR Testnet RPC and imports it if valid.
   */
  public async verifyAndImportFromRpc(
    txHash: string,
    contractId: string = VAULT_CONTRACT_ID,
    networkId: string = 'testnet'
  ): Promise<{ success: boolean; deposit?: ExternalDepositRecord; error?: string }> {
    const cleanHash = txHash.trim();
    if (!cleanHash) {
      return { success: false, error: 'Transaction hash cannot be empty' };
    }

    try {
      const response = await fetch(TESTNET_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `verify-tx-${Date.now()}`,
          method: 'tx',
          params: [cleanHash, contractId],
        }),
      });

      if (!response.ok) {
        return { success: false, error: `RPC HTTP error: ${response.status}` };
      }

      const data = await response.json();
      if (data.error) {
        const msg = data.error.message || data.error.cause?.name || 'Transaction not found on NEAR testnet';
        return { success: false, error: msg };
      }

      const txOutcome = data.result;
      if (!txOutcome || !txOutcome.transaction) {
        return { success: false, error: 'Malformed transaction outcome received from RPC' };
      }

      // 1. Verify Status
      const status = txOutcome.status;
      const isSuccess = status && (status.SuccessValue !== undefined || status.SuccessReceiptId !== undefined);
      if (!isSuccess) {
        return { success: false, error: 'Transaction was not successful on-chain or is still in flight' };
      }

      // 2. Verify Recipient is the Vault Contract
      const receiverId = txOutcome.transaction.receiver_id;
      if (receiverId !== contractId) {
        return {
          success: false,
          error: `Transaction recipient (${receiverId}) does not match the vault contract (${contractId})`,
        };
      }

      // 3. Find Transfer Action
      const actions = txOutcome.transaction.actions || [];
      let transferDepositYocto: string | null = null;
      for (const act of actions) {
        if (typeof act === 'object' && act.Transfer && act.Transfer.deposit) {
          transferDepositYocto = String(act.Transfer.deposit);
          break;
        }
      }

      if (!transferDepositYocto || BigInt(transferDepositYocto) === 0n) {
        return {
          success: false,
          error: 'Transaction does not contain a native NEAR Transfer action into the vault contract',
        };
      }

      const senderId = txOutcome.transaction.signer_id;
      const amountNear = formatNear(transferDepositYocto, 4);
      const blockHash = txOutcome.transaction_outcome?.block_hash;

      const newRecord: ExternalDepositRecord = {
        txHash: cleanHash,
        senderId,
        receiverId,
        amountNear,
        amountYocto: transferDepositYocto,
        timestamp: Date.now(),
        status: 'confirmed',
        networkId,
        source: 'direct_transfer',
        blockHash,
      };

      const saved = this.saveDeposit(newRecord, contractId, networkId);
      if (!saved) {
        return { success: false, error: 'This transaction has already been recorded in your deposit ledger' };
      }

      return { success: true, deposit: newRecord };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to verify transaction with NEAR RPC' };
    }
  }
}

export const externalDepositStorage = new ExternalDepositStorageService();

