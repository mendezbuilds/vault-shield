/**
 * Vault Shield - End-to-End Scenario Demonstration Harness (Day 2)
 *
 * Implements reproducible demonstration scenarios proving that the AI agent interacts
 * with Vault Shield's security layer across three canonical policy outcomes:
 *   1. Scenario A: Autonomous payment request within policy limits (AUTO_DISPATCH).
 *   2. Scenario B: Payment to unlisted recipient requiring human approval (PENDING_APPROVAL).
 *   3. Scenario C: Malicious or excessive payment request blocked by security policy (DENIED).
 *
 * CRITICAL SAFETY BOUNDARY:
 * This harness operates exclusively in read-only inspection and dry-run execution mode.
 * No live testnet transactions are signed or broadcast.
 */
import { VaultAgent } from './agent.js';
import { LLMProvider, AITaskResult } from './llm.js';
import { ContractViewProvider } from './preflight.js';
import { SpendingPolicyView, DailyBucketView, PaymentRequestView, ReconciledTombstoneView } from './types.js';
export interface ScenarioDefinition {
    id: 'auto' | 'approval' | 'injection';
    title: string;
    description: string;
    prompt: string;
    expectedRouting: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED';
    expectedReason?: string;
    policyExplanation: string;
}
export declare const DEMO_SCENARIOS: Record<'auto' | 'approval' | 'injection', ScenarioDefinition>;
export declare class StandardPolicyFixtureViewProvider implements ContractViewProvider {
    policy: SpendingPolicyView;
    bucket: DailyBucketView;
    liquidBalance: string;
    agentPendingCount: number;
    globalPendingCount: number;
    paused: boolean;
    authorized: boolean;
    owner: string;
    isPaused(): Promise<boolean>;
    isAgentAuthorized(_agentId: string): Promise<boolean>;
    getOwner(): Promise<string>;
    getPolicy(): Promise<SpendingPolicyView>;
    getDailyBucket(_dayIndex?: number): Promise<DailyBucketView>;
    getAvailableLiquidBalance(): Promise<string>;
    getAgentPendingCount(_agentId: string): Promise<number>;
    getGlobalPendingCount(): Promise<number>;
    getRequest(_requestId: number): Promise<PaymentRequestView | null>;
    getTombstone(_requestId: number): Promise<ReconciledTombstoneView | null>;
}
export interface DemoOptions {
    provider?: LLMProvider;
    providerName?: string;
    useFixture?: boolean;
    viewProvider?: ContractViewProvider;
    silent?: boolean;
}
export interface ScenarioExecutionResult {
    scenarioId: 'auto' | 'approval' | 'injection';
    title: string;
    prompt: string;
    expectedRouting: 'AUTO_DISPATCH' | 'PENDING_APPROVAL' | 'DENIED';
    actualRouting: string;
    passed: boolean;
    aiTaskResult: AITaskResult;
    policyEnforcementDetail: string;
}
export interface DemoHarnessReport {
    timestamp: number;
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    allPassed: boolean;
    results: ScenarioExecutionResult[];
}
export declare function getScenarioDefinition(scenarioKey: 'auto' | 'approval' | 'injection', destinationAllowlist?: string[]): ScenarioDefinition;
export declare class ScenarioHarness {
    private agent;
    constructor(customAgent?: VaultAgent, options?: DemoOptions);
    runScenario(scenarioKey: 'auto' | 'approval' | 'injection', options?: DemoOptions): Promise<ScenarioExecutionResult>;
    runAll(options?: DemoOptions): Promise<DemoHarnessReport>;
    private printScenarioHeader;
    private printScenarioOutput;
    private printSummaryReport;
}
//# sourceMappingURL=harness.d.ts.map