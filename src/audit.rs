use near_sdk::near;
use near_sdk::{AccountId, NearToken};

pub const AUDIT_BUFFER_CAPACITY: usize = 50;

#[near(serializers = [borsh, json])]
#[borsh(use_discriminant = true)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuditEventType {
    PaymentPending = 1,
    PaymentDispatched = 2,
    PaymentPolicyDenied = 3,
    PaymentApproved = 4,
    PaymentRejected = 5,
    PaymentPolicyInvalidated = 6,
    PaymentExpired = 7,
    PaymentExecuted = 8,
    PaymentFailed = 9,
    PaymentReconciled = 10,
    CriticalDiscrepancy = 11,
    VaultAutoPaused = 12,
    VaultPaused = 13,
    VaultUnpaused = 14,
    AgentRegistered = 15,
    AgentRevoked = 16,
    PolicyUpdated = 17,
    DestinationAllowlisted = 18,
    DestinationDelisted = 19,
    OwnerWithdrawal = 20,
    TombstonePruned = 21,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompactAuditRecord {
    pub sequence_id: u64,
    pub timestamp: u64,
    pub request_id: u64,
    pub event_type: AuditEventType,
    pub account_id: AccountId,
    pub amount: NearToken,
    pub code: u8,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct AuditBuffer {
    pub head: u64,
    pub records: Vec<Option<CompactAuditRecord>>,
}

impl Default for AuditBuffer {
    fn default() -> Self {
        let mut records = Vec::with_capacity(AUDIT_BUFFER_CAPACITY);
        for _ in 0..AUDIT_BUFFER_CAPACITY {
            records.push(None);
        }
        Self { head: 0, records }
    }
}

impl AuditBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn append(
        &mut self,
        timestamp: u64,
        request_id: u64,
        event_type: AuditEventType,
        account_id: AccountId,
        amount: NearToken,
        code: u8,
    ) -> u64 {
        self.head = self.head.checked_add(1).expect("Audit sequence overflow");
        let sequence_id = self.head;
        let index = ((sequence_id - 1) % (AUDIT_BUFFER_CAPACITY as u64)) as usize;
        let record = CompactAuditRecord {
            sequence_id,
            timestamp,
            request_id,
            event_type,
            account_id,
            amount,
            code,
        };
        self.records[index] = Some(record);
        sequence_id
    }

    pub fn get_recent_records(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<CompactAuditRecord> {
        if self.head == 0 {
            return Vec::new();
        }

        let max_limit = limit.unwrap_or(AUDIT_BUFFER_CAPACITY as u64).min(AUDIT_BUFFER_CAPACITY as u64);
        let oldest_available_seq = if self.head > AUDIT_BUFFER_CAPACITY as u64 {
            self.head - (AUDIT_BUFFER_CAPACITY as u64) + 1
        } else {
            1
        };

        let start_seq = from_index.unwrap_or(oldest_available_seq).max(oldest_available_seq);
        if start_seq > self.head {
            return Vec::new();
        }

        let end_seq = (start_seq + max_limit - 1).min(self.head);
        let mut result = Vec::with_capacity((end_seq - start_seq + 1) as usize);

        for seq in start_seq..=end_seq {
            let index = ((seq - 1) % (AUDIT_BUFFER_CAPACITY as u64)) as usize;
            if let Some(record) = &self.records[index] {
                if record.sequence_id == seq {
                    result.push(record.clone());
                }
            }
        }

        result
    }
}
