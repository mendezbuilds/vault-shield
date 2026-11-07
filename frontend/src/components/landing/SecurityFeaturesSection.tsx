import React from 'react';
import { motion } from 'framer-motion';

export const SecurityFeaturesSection: React.FC = () => {
  const protections = [
    {
      title: 'Per-Transaction Spending Cap',
      desc: 'Enforces a strict ceiling on individual transfers (e.g. 1.0 NEAR). Oversized requests are rejected on-chain before token allocation.',
      contractRef: 'PolicyDenialReason::ExceedsPerTransactionCap',
      num: '01',
    },
    {
      title: '24-Hour Rolling Spending Cap',
      desc: 'Maintains daily rolling buckets across 86,400-second epochs. Prevents continuous micro-draining across blocks.',
      contractRef: 'PolicyDenialReason::ExceedsDailyCap',
      num: '02',
    },
    {
      title: 'New-Destination Approval Gate',
      desc: 'Any destination address not pre-approved in destination_allowlist is intercepted and placed into Owner pending queue.',
      contractRef: 'PendingReason::NewDestinationOnly',
      num: '03',
    },
    {
      title: 'Above-Threshold Approval Gate',
      desc: 'Even for allowlisted vendors, transfers exceeding auto_approval_threshold (0.2 NEAR) mandate manual Owner signature.',
      contractRef: 'PendingReason::AboveThresholdOnly',
      num: '04',
    },
    {
      title: 'Instant Agent Key Revocation',
      desc: 'Owner can immediately deauthorize any rogue agent via revoke_agent(). Pending requests from revoked agents are invalidated upon approval.',
      contractRef: 'InvalidationReason::AgentRevoked',
      num: '05',
    },
    {
      title: 'Emergency Vault Pause Kill-Switch',
      desc: 'Owner can freeze all outbound payments in one block via pause(). Incoming agent requests and pending approvals are blocked.',
      contractRef: 'PolicyDenialReason::VaultPaused',
      num: '06',
    },
    {
      title: 'Permissionless Request Expiry',
      desc: 'Requests define a TTL (5m to 24h). If the owner takes no action, anyone (or relayer) can call expire_request() to release locked reservations.',
      contractRef: 'RequestStatus::Expired',
      num: '07',
    },
    {
      title: 'Forward-Looking Storage Buffer',
      desc: 'Enforces storage_reserve = byte_cost * (storage_usage + 10,000 B buffer). Storage rent cannot be drained by withdrawals.',
      contractRef: 'calculate_storage_reserve_requirement()',
      num: '08',
    },
    {
      title: 'Failed Transfer Promise Recovery',
      desc: 'If downstream NEAR transfer fails, on_transfer_complete() returns the reservation to daily bucket and releases inflight locks.',
      contractRef: 'PromiseResult::Failed -> RequestStatus::Failed',
      num: '09',
    },
    {
      title: 'Owner-Only Governance Guard',
      desc: 'Only env::predecessor_account_id() == owner_id can update policies, allowlist destinations, or withdraw liquid funds.',
      contractRef: 'assert_owner()',
      num: '10',
    },
    {
      title: 'Persistent 50-Slot Audit Ring',
      desc: 'Inscribes all 21 security event types into a bounded circular ring buffer with monotonic sequence IDs and block timestamps.',
      contractRef: 'CompactAuditRecord ring buffer',
      num: '11',
    },
  ];

  return (
    <section id="security" className="py-28 border-t border-border bg-ivory relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-near-dark">
            Zero-Trust Guarantees
          </span>
          <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-charcoal-900 leading-tight">
            Eleven Cryptographically Enforced Invariants
          </h2>
          <p className="mt-6 text-base sm:text-lg text-charcoal-600 leading-relaxed font-sans">
            Every security control listed below is physically implemented and verified in the frozen Rust contract at commit{' '}
            <code className="text-xs font-mono font-bold text-near-dark bg-near-light px-2.5 py-0.5 rounded-full">
              cc7760b
            </code>.
          </p>
        </motion.div>

        {/* 11 Invariant Cards with Motion Stagger & Liquid Glass Surfaces */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {protections.map((p, i) => (
            <motion.div
              key={p.num}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="p-8 rounded-3xl bg-white/75 backdrop-blur-md border border-white/90 hover:border-near-green/40 shadow-soft hover:shadow-elevation transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono font-bold text-charcoal-400">
                    INVARIANT {p.num}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-near-green/40 group-hover:bg-near-green transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-charcoal-900 tracking-tight">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm text-charcoal-600 leading-relaxed font-sans">
                  {p.desc}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-border/70">
                <code className="text-[11px] font-mono text-charcoal-500 bg-ivory-warm px-2 py-0.5 rounded border border-border/60 block truncate">
                  {p.contractRef}
                </code>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
