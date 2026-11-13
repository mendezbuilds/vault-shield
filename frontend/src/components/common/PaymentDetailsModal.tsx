import React from 'react';
import { Modal } from './Modal';
import { VaultPaymentRecord } from '../../services/paymentVerification';
import { PaymentReceiptVerificationCard } from './PaymentReceiptVerificationCard';

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: VaultPaymentRecord | null;
}

export const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({
  isOpen,
  onClose,
  payment,
}) => {
  if (!payment) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Payment Verification: Request #${payment.requestId}`}
      description="Cryptographic on-chain verification of the contract execution, downstream transfer receipt, and live recipient account balance."
      maxWidth="xl"
    >
      <div className="space-y-4">
        <PaymentReceiptVerificationCard
          payment={payment}
          showBalanceWidget={true}
          defaultExpanded={true}
        />
      </div>
    </Modal>
  );
};
