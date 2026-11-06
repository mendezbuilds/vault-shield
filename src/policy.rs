use near_sdk::near;
use near_sdk::{AccountId, NearToken};
use std::collections::BTreeSet;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpendingPolicy {
    pub max_per_transaction: NearToken,
    pub daily_cap: NearToken,
    pub auto_approval_threshold: NearToken,
    pub destination_allowlist: BTreeSet<AccountId>,
    pub is_paused: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpendingPolicyView {
    pub max_per_transaction: NearToken,
    pub daily_cap: NearToken,
    pub auto_approval_threshold: NearToken,
    pub destination_allowlist: Vec<AccountId>,
    pub is_paused: bool,
}

impl SpendingPolicy {
    pub fn new(
        max_per_transaction: NearToken,
        daily_cap: NearToken,
        auto_approval_threshold: NearToken,
        initial_allowlist: Vec<AccountId>,
    ) -> Self {
        let mut destination_allowlist = BTreeSet::new();
        for dest in initial_allowlist {
            destination_allowlist.insert(dest);
        }
        Self {
            max_per_transaction,
            daily_cap,
            auto_approval_threshold,
            destination_allowlist,
            is_paused: false,
        }
    }

    pub fn is_destination_allowlisted(&self, destination: &AccountId) -> bool {
        self.destination_allowlist.contains(destination)
    }

    pub fn add_destination(&mut self, destination: AccountId) -> bool {
        self.destination_allowlist.insert(destination)
    }

    pub fn remove_destination(&mut self, destination: &AccountId) -> bool {
        self.destination_allowlist.remove(destination)
    }

    pub fn update_limits(
        &mut self,
        max_per_transaction: NearToken,
        daily_cap: NearToken,
        auto_approval_threshold: NearToken,
    ) {
        self.max_per_transaction = max_per_transaction;
        self.daily_cap = daily_cap;
        self.auto_approval_threshold = auto_approval_threshold;
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.is_paused = paused;
    }

    pub fn to_view(&self) -> SpendingPolicyView {
        SpendingPolicyView {
            max_per_transaction: self.max_per_transaction,
            daily_cap: self.daily_cap,
            auto_approval_threshold: self.auto_approval_threshold,
            destination_allowlist: self.destination_allowlist.iter().cloned().collect(),
            is_paused: self.is_paused,
        }
    }
}
