import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORICAL_VERIFIED_PAYMENTS,
  RECEIPT_EXPLANATION_NOTE,
  getParentTxExplorerUrl,
  getReceiptExplorerUrl,
  getReceiptNearBlocksAnchorUrl,
  calculateBalanceBreakdown,
  queryRecipientBalance,
  formatReceiptId,
  YOCTO_PER_BYTE,
} from '../src/services/paymentVerification.ts';

describe('Payment Receipt Visibility & Verification Suite', () => {
  describe('1. Parent Transaction vs. Transfer Receipt Separation', () => {
    test('strictly distinguishes parent tx hash from transfer receipt ID', () => {
      for (const payment of HISTORICAL_VERIFIED_PAYMENTS) {
        assert.ok(payment.parentTxHash, `Payment ${payment.id} must have a parentTxHash`);
        assert.ok(payment.receiptId, `Payment ${payment.id} must have a receiptId`);
        assert.notEqual(
          payment.parentTxHash,
          payment.receiptId,
          `Parent transaction hash and receipt ID must never be identical or interchangeable for payment ${payment.id}`
        );
      }
    });

    test('Payment 1 has verified historical parent tx and downstream receipt', () => {
      const p1 = HISTORICAL_VERIFIED_PAYMENTS.find(p => p.id === 'historical-payment-1');
      assert.ok(p1, 'Payment 1 must exist in historical records');
      assert.equal(p1.parentTxHash, '5sCCVLasZVH2jSdAp5gGUgnvae3cBeUmZk6xUJnMQzWb');
      assert.equal(p1.receiptId, '8xinGvkY97YegPtuLGZjChXwafUucYwpUgKgZi2dzjAo');
      assert.equal(p1.recipient, 'whiteice2105.testnet');
      assert.equal(p1.amountNear, '0.01');
      assert.equal(p1.status, 'PAYMENT_EXECUTED');
      assert.equal(p1.parentTxConfirmed, true);
      assert.equal(p1.receiptConfirmed, true);
    });

    test('Payment 2 has verified historical parent tx and downstream receipt', () => {
      const p2 = HISTORICAL_VERIFIED_PAYMENTS.find(p => p.id === 'historical-payment-2');
      assert.ok(p2, 'Payment 2 must exist in historical records');
      assert.equal(p2.parentTxHash, '6a4RreMyYmBT63HThen48jQYsG5pWmSFFL8wHiVSzNsE');
      assert.equal(p2.receiptId, 'DwuvNUw61RmEoVxPMZrySA5a7PiwSjf1D3tkpfK2Wy9u');
      assert.equal(p2.recipient, 'smoothgif8182.testnet');
      assert.equal(p2.amountNear, '0.01');
      assert.equal(p2.status, 'PAYMENT_EXECUTED');
      assert.equal(p2.parentTxConfirmed, true);
      assert.equal(p2.receiptConfirmed, true);
    });
  });

  describe('2. Missing Receipt Data Handling & Safe UI Presentation', () => {
    test('formatReceiptId safely formats missing, null, or empty receipts without guessing', () => {
      assert.equal(formatReceiptId(null), 'Receipt not yet verified');
      assert.equal(formatReceiptId(undefined), 'Receipt not yet verified');
      assert.equal(formatReceiptId(''), 'Receipt not yet verified');
      assert.equal(formatReceiptId('   '), 'Receipt not yet verified');
    });

    test('formatReceiptId preserves genuine receipt IDs', () => {
      const testId = '8xinGvkY97YegPtuLGZjChXwafUucYwpUgKgZi2dzjAo';
      assert.equal(formatReceiptId(testId), testId);
    });

    test('getReceiptExplorerUrl returns null for missing or unverified receipts to prevent broken links', () => {
      assert.equal(getReceiptExplorerUrl(null), null);
      assert.equal(getReceiptExplorerUrl(undefined), null);
      assert.equal(getReceiptExplorerUrl(''), null);
      assert.equal(getReceiptExplorerUrl('Receipt not yet verified'), null);
      assert.equal(getReceiptExplorerUrl('receipt not yet verified'), null);
    });

    test('getReceiptNearBlocksAnchorUrl returns null if receipt or parent tx is missing', () => {
      assert.equal(getReceiptNearBlocksAnchorUrl(null, '8xinGvkY...'), null);
      assert.equal(getReceiptNearBlocksAnchorUrl('5sCCV...', null), null);
      assert.equal(getReceiptNearBlocksAnchorUrl('5sCCV...', 'Receipt not yet verified'), null);
    });
  });

  describe('3. Explorer Links Generation', () => {
    test('generates valid parent transaction NearBlocks URL', () => {
      const txHash = '5sCCVLasZVH2jSdAp5gGUgnvae3cBeUmZk6xUJnMQzWb';
      const url = getParentTxExplorerUrl(txHash);
      assert.equal(url, `https://testnet.nearblocks.io/txns/${txHash}`);
    });

    test('returns null for empty parent tx hash without generating speculative link', () => {
      assert.equal(getParentTxExplorerUrl(''), null);
      assert.equal(getParentTxExplorerUrl(null), null);
      assert.equal(getParentTxExplorerUrl(undefined), null);
    });

    test('generates valid downstream transfer receipt explorer URL', () => {
      const receiptId = '8xinGvkY97YegPtuLGZjChXwafUucYwpUgKgZi2dzjAo';
      const url = getReceiptExplorerUrl(receiptId);
      assert.equal(url, `https://explorer.testnet.near.org/transactions/${receiptId}`);
    });

    test('generates valid NearBlocks execution plan anchor link for receipt', () => {
      const txHash = '5sCCVLasZVH2jSdAp5gGUgnvae3cBeUmZk6xUJnMQzWb';
      const receiptId = '8xinGvkY97YegPtuLGZjChXwafUucYwpUgKgZi2dzjAo';
      const url = getReceiptNearBlocksAnchorUrl(txHash, receiptId);
      assert.equal(url, `https://testnet.nearblocks.io/txns/${txHash}#${receiptId}`);
    });
  });

  describe('4. Authoritative Balance Calculations (Distinguishing Spendable vs Total)', () => {
    test('accurately calculates storage reserve requirement at 10^19 yoctoNEAR per byte', () => {
      const storageBytes = 182;
      const expectedStorageYocto = BigInt(storageBytes) * YOCTO_PER_BYTE;
      assert.equal(expectedStorageYocto.toString(), '1820000000000000000000'); // 0.00182 NEAR
    });

    test('strictly distinguishes total account balance from available/spendable balance', () => {
      // 1.0699553634875 NEAR total amount with 182 bytes storage
      const totalYocto = '1069955363487500000000000';
      const storageBytes = 182;
      const breakdown = calculateBalanceBreakdown(totalYocto, storageBytes, '0');

      assert.notEqual(
        breakdown.totalNear,
        breakdown.availableNear,
        'Total balance and available balance must not be identical when storage is reserved'
      );
      assert.equal(breakdown.storageUsageBytes, 182);
      assert.equal(breakdown.totalNear, '1.06995');
      assert.equal(breakdown.availableNear, '1.06813');
      assert.equal(breakdown.storageReservedNear, '0.00182');
    });

    test('handles zero balance and zero storage safely', () => {
      const breakdown = calculateBalanceBreakdown('0', 0, '0');
      assert.equal(breakdown.totalNear, '0.0000');
      assert.equal(breakdown.availableNear, '0.0000');
      assert.equal(breakdown.storageReservedNear, '0.0000');
    });

    test('prevents negative spendable balance if storage cost exceeds amount', () => {
      // 1000 yoctoNEAR with 500 bytes storage (5 * 10^21 yocto reserve)
      const breakdown = calculateBalanceBreakdown('1000', 500, '0');
      assert.equal(breakdown.availableNear, '0.0000');
      assert.equal(breakdown.availableYocto, '0');
    });
  });

  describe('5. Live FastNear RPC Query & Stale Recovery', () => {
    test('successfully queries live on-chain balance for whiteice2105.testnet via FastNear RPC', async () => {
      const report = await queryRecipientBalance('whiteice2105.testnet', { forceRefresh: true });
      assert.equal(report.status, 'success');
      assert.equal(report.accountId, 'whiteice2105.testnet');
      assert.ok(BigInt(report.totalYocto) > 0n, 'Total yocto must be greater than zero');
      assert.ok(BigInt(report.availableYocto) > 0n, 'Available yocto must be greater than zero');
      assert.ok(report.lastVerifiedAt !== null, 'lastVerifiedAt must be populated');
      assert.equal(report.isStale, false);
      assert.equal(report.errorMessage, null);
    });

    test('successfully queries live on-chain balance for smoothgif8182.testnet via FastNear RPC', async () => {
      const report = await queryRecipientBalance('smoothgif8182.testnet', { forceRefresh: true });
      assert.equal(report.status, 'success');
      assert.equal(report.accountId, 'smoothgif8182.testnet');
      assert.ok(BigInt(report.totalYocto) > 0n, 'Total yocto must be greater than zero');
      assert.equal(report.isStale, false);
    });

    test('handles unknown / non-existent account with clear error', async () => {
      const fakeAccount = `nonexistent-vault-test-${Date.now()}.testnet`;
      const report = await queryRecipientBalance(fakeAccount, { forceRefresh: true });
      assert.equal(report.status, 'error');
      assert.ok(
        report.errorMessage?.includes('does not exist') ||
        report.errorMessage?.includes('UNKNOWN_ACCOUNT') ||
        report.errorMessage?.includes('failed')
      );
    });

    test('preserves cached balance and marks isStale: true on RPC failure', async () => {
      // 1. Establish initial valid cached state
      const initialReport = await queryRecipientBalance('whiteice2105.testnet', { forceRefresh: true });
      assert.equal(initialReport.status, 'success');

      // 2. Query with an invalid/unreachable RPC endpoint to simulate network outage
      const staleReport = await queryRecipientBalance('whiteice2105.testnet', {
        forceRefresh: true,
        rpcUrl: 'https://invalid-unreachable-rpc.fastnear.internal',
      });

      // Must preserve the previous valid balance numbers while flagging stale
      assert.equal(staleReport.isStale, true);
      assert.equal(staleReport.status, 'error');
      assert.equal(staleReport.totalNear, initialReport.totalNear);
      assert.equal(staleReport.availableNear, initialReport.availableNear);
      assert.ok(staleReport.errorMessage?.includes('potentially outdated'));
    });
  });

  describe('6. Explanatory Note on Wallet History vs. Incoming Receipts', () => {
    test('contains exact explanatory note required by Requirement 4', () => {
      const expected =
        "Vault Shield payments are executed by the vault contract. The recipient receives funds through a NEAR transfer receipt, which may not appear as a normal wallet-originated transaction in the recipient's standard activity history. Verify the transfer through its receipt details and the recipient's on-chain balance.";
      assert.equal(RECEIPT_EXPLANATION_NOTE, expected);
    });
  });
});
