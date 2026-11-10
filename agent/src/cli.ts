#!/usr/bin/env node
import { VaultAgent, parseNearToYocto, formatYoctoToNear } from './agent.js';
import { generateIntentId } from './ledger.js';

function parseArgs(args: string[]): { command: string; options: Record<string, string | boolean> } {
  const command = args[0] || 'help';
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (i === 1) {
      options['_positionalPrompt'] = arg;
    }
  }

  return { command, options };
}

function printBanner(): void {
  console.log('================================================================');
  console.log(' 🛡️  VAULT SHIELD — ALPHA AUTONOMOUS AGENT RUNTIME (CLI)');
  console.log('================================================================');
}

function printHelp(): void {
  printBanner();
  console.log('Usage: agent <command> [options]\n');
  console.log('Commands:');
  console.log('  task --prompt <text> [--dry-run] [--live] [--provider <mock|gemini>]');
  console.log('      Execute natural-language AI task through Vault Shield security layer.\n');
  console.log('  status');
  console.log('      Display live contract policy, solvency, and restricted key state.\n');
  console.log('  preflight --dest <id> --amount <near> [--reason <text>] [--ttl <seconds>]');
  console.log('      Run advisory read-only policy simulation against contract invariants.\n');
  console.log('  request --dest <id> --amount <near> --reason <text> [--dry-run] [--intent-id <id>]');
  console.log('      Formulate, validate, and preview/dispatch a payment request.\n');
  console.log('  reconcile [--intent-id <id>]');
  console.log('      Reconcile unresolved or in-flight transaction records against NEAR RPC.\n');
  console.log('Options:');
  console.log('  --prompt <text>         Natural-language instruction for AI agent task');
  console.log('  --dest <account_id>     Target recipient NEAR account ID');
  console.log('  --amount <near>         Payment amount in NEAR (e.g. 0.15)');
  console.log('  --reason <text>         Audit reason description');
  console.log('  --provider <name>       AI provider (mock [default] or gemini)');
  console.log('  --dry-run               Run simulation and payload construction without broadcast');
  console.log('  --live                  Authorize live on-chain broadcast (requires AGENT_PHASE1_STRICT_BOUNDARY=false)');
  console.log('  --ttl <seconds>         Optional request TTL in seconds (300 to 86400)');
  console.log('  --intent-id <id>        Custom unique intent ID for idempotency tracking\n');
  console.log('Strict Execution Boundary:');
  console.log('  In Phase 1, all mutations are confined to dry-run simulation mode.');
  console.log('================================================================');
}

async function handleStatus(agent: VaultAgent): Promise<void> {
  printBanner();
  console.log('Retrieving on-chain status from NEAR Public Testnet...\n');

  try {
    const status = await agent.getStatus();

    console.log('IDENTITY & ACCESS KEYS:');
    console.log(`  Agent Account:          ${status.agentAccountId}`);
    console.log(`  Vault Contract:         ${status.vaultContractId}`);
    console.log(`  Network:                ${status.networkId}`);
    console.log(`  Expected Restricted Key:${status.expectedPublicKey}`);
    console.log(`  Loaded Signer Key:      ${status.signerPublicKey || '(None loaded - read-only mode)'}`);
    console.log(`  Signing Capability:     ${status.hasSigningKey ? '✅ ACTIVE (Restricted Key)' : '⚠️ READ-ONLY (No Key Injected)'}`);
    console.log(`  Agent Authorization:    ${status.isAgentAuthorized ? '✅ AUTHORIZED ON-CHAIN' : '❌ NOT AUTHORIZED'}`);

    console.log('\nPOLICY & CIRCUIT BREAKER:');
    console.log(`  Vault Circuit Breaker:  ${status.isVaultPaused ? '🚨 PAUSED' : '🟢 ACTIVE (Unpaused)'}`);
    console.log(`  Max Per Transaction:   ${status.maxPerTxNear} NEAR`);
    console.log(`  Daily Spending Cap:     ${status.dailyCapNear} NEAR`);
    console.log(`  Auto-Approval Cap:      ${status.autoApprovalThresholdNear} NEAR`);
    console.log(`  Allowlisted Merchants:  [ ${status.destinationAllowlist.join(', ')} ]`);

    console.log('\nSOLVENCY & QUEUES:');
    console.log(`  Available Liquid:       ${status.availableLiquidNear} NEAR`);
    console.log(`  Today's Spent:          ${status.dailySpentNear} NEAR`);
    console.log(`  Today's Reserved:       ${status.dailyReservedNear} NEAR`);
    console.log(`  Agent Pending Queue:    ${status.agentPendingCount} / 2 Slots`);
    console.log(`  Global Pending Queue:   ${status.globalPendingCount} / 32 Slots`);
    console.log('================================================================');
  } catch (err: any) {
    console.error(`\n❌ Error fetching agent status: ${err.message}`);
    process.exit(1);
  }
}

async function handlePreflight(agent: VaultAgent, options: Record<string, string | boolean>): Promise<void> {
  printBanner();
  const dest = options.dest as string;
  const amount = options.amount as string;
  const reason = (options.reason as string) || 'Advisory Pre-flight Simulation';
  const ttl = options.ttl ? Number(options.ttl) : undefined;

  if (!dest || !amount) {
    console.error('❌ Missing required flags: --dest <account_id> and --amount <near> are required.\n');
    printHelp();
    process.exit(1);
  }

  let amountYocto: string;
  try {
    amountYocto = parseNearToYocto(amount);
  } catch (err: any) {
    console.error(`❌ Amount error: ${err.message}`);
    process.exit(1);
  }

  const intent = {
    intentId: generateIntentId('preflight'),
    destination: dest,
    amountNear: amount,
    amountYocto,
    reason,
    ttlSeconds: ttl,
    createdAt: Date.now(),
  };

  console.log('RUNNING ADVISORY PRE-FLIGHT INVARIANT SIMULATION:');
  console.log(`  Destination: ${dest}`);
  console.log(`  Amount:      ${amount} NEAR (${amountYocto} yoctoNEAR)`);
  console.log(`  Reason:      ${reason}\n`);

  const result = await agent.preflight(intent);

  console.log('POLICY CHECKS:');
  for (const check of result.checks) {
    const symbol = check.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`  ${symbol} ${check.check.padEnd(35)} : ${check.detail}`);
  }

  console.log('\nSIMULATION SUMMARY:');
  console.log(`  Pre-Flight Status:   ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Predicted Routing:   ${result.predictedRouting || 'DENIED'}`);
  if (result.predictedReason && result.predictedReason !== 'None') {
    console.log(`  Predicted Reason:    ${result.predictedReason}`);
  }
  if (result.error) {
    console.log(`  Denial Cause:        ${result.error}`);
  }
  console.log('================================================================');

  if (!result.success) {
    process.exitCode = 1;
  }
}

async function handleRequest(agent: VaultAgent, options: Record<string, string | boolean>): Promise<void> {
  printBanner();
  const dest = options.dest as string;
  const amount = options.amount as string;
  const reason = options.reason as string;
  let isDryRun: boolean | undefined = undefined;
  if (options['dry-run'] === false || options['dry-run'] === 'false') {
    isDryRun = false;
  } else if (options['dry-run'] === true || options['dry-run'] === 'true') {
    isDryRun = true;
  } else if (options['live'] === true || options['live'] === 'true') {
    isDryRun = false;
  }

  const effectiveDryRun = isDryRun !== undefined ? isDryRun : agent.getConfig().phase1StrictBoundary;
  const intentId = (options['intent-id'] as string) || generateIntentId();
  const ttl = options.ttl ? Number(options.ttl) : undefined;

  if (!dest || !amount || !reason) {
    console.error('❌ Missing required flags: --dest, --amount, and --reason are all required.\n');
    printHelp();
    process.exit(1);
  }

  console.log('INITIATING PAYMENT REQUEST INTENT:');
  console.log(`  Intent ID:   ${intentId}`);
  console.log(`  Destination: ${dest}`);
  console.log(`  Amount:      ${amount} NEAR`);
  console.log(`  Reason:      ${reason}`);
  console.log(`  Execution:   ${effectiveDryRun ? 'DRY-RUN (Simulation & Payload Verification)' : 'LIVE ON-CHAIN BROADCAST'}\n`);

  const result = await agent.requestPayment(
    {
      destination: dest,
      amountNear: amount,
      reason,
      ttlSeconds: ttl,
      intentId,
    },
    isDryRun !== undefined ? { dryRun: isDryRun } : {}
  );

  console.log('LIFECYCLE OUTCOME:');
  console.log(`  Status:      ${result.status}`);
  console.log(`  Message:     ${result.message}`);

  if (result.preview) {
    console.log('\nVERIFIED SIGNED TRANSACTION PAYLOAD:');
    console.log(`  Signer Account:    ${result.preview.signerId}`);
    console.log(`  Receiver Account:  ${result.preview.receiverId}`);
    console.log(`  Target Method:     ${result.preview.methodName}`);
    console.log(`  Attached Gas:      ${result.preview.gas} (30 Tgas)`);
    console.log(`  Attached Deposit:  ${result.preview.deposit} (0 yoctoNEAR - RESTRICTED KEY VERIFIED)`);
    console.log(`  Arguments JSON:    ${JSON.stringify(result.preview.args, null, 2)}`);
  }

  if (result.txHash) {
    console.log(`  Tx Hash:     ${result.txHash}`);
  }
  if (result.requestId !== undefined) {
    console.log(`  Request ID:  #${result.requestId}`);
  }
  if (result.error) {
    console.log(`  Error:       ${result.error}`);
  }
  console.log('================================================================');

  if (result.status === 'LOCAL_PREFLIGHT_REJECTED' || result.status === 'CONTRACT_DENIED') {
    process.exit(1);
  }
}

async function handleTask(agent: VaultAgent, options: Record<string, string | boolean>): Promise<void> {
  printBanner();
  const prompt = (options.prompt as string) || (typeof options._positionalPrompt === 'string' ? options._positionalPrompt : '');

  if (!prompt || !prompt.trim()) {
    console.error('❌ Missing required instruction: --prompt "<task description>" is required.\n');
    console.log('Example:');
    console.log('  npm run agent task -- --prompt "Pay 0.1 NEAR to merchant.vault-parent.testnet for API compute credits"\n');
    process.exit(1);
  }

  let isDryRun: boolean | undefined = undefined;
  if (options['dry-run'] === false || options['dry-run'] === 'false') {
    isDryRun = false;
  } else if (options['dry-run'] === true || options['dry-run'] === 'true') {
    isDryRun = true;
  } else if (options['live'] === true || options['live'] === 'true') {
    isDryRun = false;
  }

  const effectiveDryRun = isDryRun !== undefined ? isDryRun : agent.getConfig().phase1StrictBoundary;
  const providerName = options.provider as string | undefined;

  console.log('🤖 AI AGENT TASK INGESTION:');
  console.log(`  Task Prompt: "${prompt.trim()}"`);
  console.log(`  Provider:    ${providerName || agent.getConfig().llmProvider || 'mock'}`);
  console.log(`  Execution:   ${effectiveDryRun ? 'DRY-RUN (Safe Simulation)' : 'LIVE ON-CHAIN BROADCAST'}\n`);

  const result = await agent.runTask(prompt.trim(), {
    dryRun: effectiveDryRun,
    providerName,
  });

  console.log('AI REASONING & DECISION:');
  console.log(`  Decision:    ${result.decisionType}`);

  if (result.explanation) {
    console.log(`  Explanation: ${result.explanation}`);
  }

  if (result.proposedIntent) {
    console.log('\nPROPOSED PAYMENT INTENT (TOOL CALL):');
    console.log(`  Destination: ${result.proposedIntent.destination}`);
    console.log(`  Amount:      ${result.proposedIntent.amountNear} NEAR`);
    console.log(`  Reason:      ${result.proposedIntent.reason}`);
    console.log('  Validation:  ✅ STRICT ARGUMENT SCHEMA VERIFIED');
  }

  if (result.validationError) {
    console.log('\n❌ ARGUMENT VALIDATION FAILED:');
    console.log(`  Error:       ${result.validationError}`);
  }

  if (result.paymentResult) {
    const pr = result.paymentResult;
    console.log('\nVAULT SHIELD RUNTIME OUTCOME:');
    console.log(`  Intent ID:   ${pr.intentId}`);
    console.log(`  Pre-Flight:  ${pr.preflight.success ? '✅ PASSED' : '❌ DENIED'}`);
    if (pr.preflight.predictedRouting) {
      console.log(`  Routing:     ${pr.preflight.predictedRouting}`);
    }
    console.log(`  Status:      ${pr.status}`);
    console.log(`  Message:     ${pr.message}`);

    if (pr.preview) {
      console.log('\nVERIFIED SIGNED TRANSACTION PAYLOAD:');
      console.log(`  Signer:      ${pr.preview.signerId}`);
      console.log(`  Receiver:    ${pr.preview.receiverId}`);
      console.log(`  Method:      ${pr.preview.methodName}`);
      console.log(`  Attached Gas: ${pr.preview.gas} (30 Tgas)`);
      console.log(`  Attached Deposit: ${pr.preview.deposit} (0 yoctoNEAR - RESTRICTED KEY VERIFIED)`);
    }

    if (pr.txHash) {
      console.log(`  Tx Hash:     ${pr.txHash}`);
    }
    if (pr.requestId !== undefined) {
      console.log(`  Request ID:  #${pr.requestId}`);
    }
  }

  if (result.error && !result.paymentResult) {
    console.log(`\n❌ Error: ${result.error}`);
  }

  console.log('================================================================');

  if (!result.success) {
    process.exitCode = 1;
  }
}

async function handleReconcile(agent: VaultAgent, options: Record<string, string | boolean>): Promise<void> {
  printBanner();
  const targetId = options['intent-id'] as string | undefined;
  console.log(`RUNNING TRANSACTION RECONCILIATION${targetId ? ` FOR INTENT: ${targetId}` : ' FOR ALL UNRESOLVED INTENTS'}...\n`);

  const results = await agent.reconcilePending(targetId);

  if (results.length === 0) {
    console.log('✅ No pending or unresolved transactions require reconciliation.');
    console.log('================================================================');
    return;
  }

  console.log(`RECONCILIATION RESULTS (${results.length} record(s) processed):\n`);
  for (const r of results) {
    const icon = r.updated ? '🔄 [UPDATED]' : '⏸️  [UNRESOLVED]';
    console.log(`${icon} Intent ID:       ${r.intentId}`);
    if (r.txHash) console.log(`   Transaction:     ${r.txHash}`);
    if (r.requestId !== undefined) console.log(`   Request ID:      #${r.requestId}`);
    console.log(`   Previous Status: ${r.previousStatus}`);
    console.log(`   Current Status:  ${r.newStatus}`);
    console.log(`   Detail:          ${r.message}\n`);
  }
  console.log('================================================================');
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  const agent = new VaultAgent();

  switch (command) {
    case 'task':
      await handleTask(agent, options);
      break;
    case 'status':
      await handleStatus(agent);
      break;
    case 'preflight':
      await handlePreflight(agent, options);
      break;
    case 'request':
      await handleRequest(agent, options);
      break;
    case 'reconcile':
      await handleReconcile(agent, options);
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

main().catch((err: any) => {
  console.error(`\n❌ Unexpected execution error: ${err.message}`);
  process.exit(1);
});
