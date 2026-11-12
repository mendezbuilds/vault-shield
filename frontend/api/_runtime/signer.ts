import { KeyPair, KeyPairSigner, Account, JsonRpcProvider, actions, baseEncode } from 'near-api-js';
import { AgentConfig, EXPECTED_RESTRICTED_PUBLIC_KEY } from './config.js';
import { PaymentIntent, RequestPaymentArgs, DEFAULT_TTL_NANOS } from './types.js';

export const STANDARD_PAYMENT_GAS = 30_000_000_000_000n; // 30 Tgas
export const ZERO_DEPOSIT = 0n; // Zero yoctoNEAR attached deposit (MANDATORY for FunctionCall key)

export interface SignedPayloadPreview {
  signerId: string;
  receiverId: string;
  methodName: string;
  args: RequestPaymentArgs;
  gas: string;
  deposit: string;
  publicKey: string;
}

/**
 * Validates that a key pair strictly corresponds to the authorized restricted Function-Call Access Key.
 * NEVER prints or formats secret keys in error messages.
 */
export function validateRestrictedKey(keyPair: KeyPair, expectedPublicKey: string = EXPECTED_RESTRICTED_PUBLIC_KEY): void {
  const pubKeyStr = keyPair.getPublicKey().toString();
  if (pubKeyStr !== expectedPublicKey) {
    throw new Error(
      `Access key security validation failure: loaded public key (${pubKeyStr}) does not match authorized restricted key (${expectedPublicKey}). FullAccess keys or unauthorized keys are strictly rejected.`
    );
  }
}

/**
 * Serializes standard request_payment arguments strictly conforming to the Rust contract interface.
 * Enforces positive amount validation as defense-in-depth.
 */
export function buildPaymentArgs(intent: PaymentIntent): RequestPaymentArgs {
  const amountBn = BigInt(intent.amountYocto);
  if (amountBn <= 0n) {
    throw new Error('Security Violation: Attached payment amount must be greater than zero yoctoNEAR.');
  }

  const ttlNanos = intent.ttlSeconds ? intent.ttlSeconds * 1_000_000_000 : DEFAULT_TTL_NANOS;
  return {
    destination: intent.destination,
    amount: intent.amountYocto,
    reason: intent.reason,
    ttl_nanos: ttlNanos,
  };
}

/**
 * Builds the FunctionCall action while strictly asserting zero attached deposit and method confinement.
 */
export function buildRestrictedFunctionCallAction(args: RequestPaymentArgs) {
  const action = actions.functionCall(
    'request_payment',
    args,
    STANDARD_PAYMENT_GAS,
    ZERO_DEPOSIT
  );

  const fnCall = action.functionCall;
  if (!fnCall) {
    throw new Error('Security Violation: Expected FunctionCall action.');
  }

  // Security invariant assertions
  if (fnCall.deposit !== 0n) {
    throw new Error('Security Violation: Attached deposit must be strictly zero yoctoNEAR when signing with a FunctionCall Access Key.');
  }

  if (fnCall.methodName !== 'request_payment') {
    throw new Error('Security Violation: Function-Call Access Key is restricted solely to the "request_payment" method.');
  }

  return action;
}

/**
 * Dedicated restricted signer for agent-a.vault-parent.testnet.
 * Implements two-stage signing so transaction hashes are derived and persisted BEFORE broadcast.
 */
export class AgentSigner {
  private keyPair: KeyPair | null = null;
  private signer: KeyPairSigner | null = null;
  private account: Account | null = null;
  private fallbackAccount: Account | null = null;
  private provider: JsonRpcProvider;
  private fallbackProvider: JsonRpcProvider | null = null;

  constructor(private config: AgentConfig) {
    this.provider = new JsonRpcProvider({ url: config.rpcUrl });
    if (config.fallbackRpcUrl && config.fallbackRpcUrl !== config.rpcUrl) {
      this.fallbackProvider = new JsonRpcProvider({ url: config.fallbackRpcUrl });
    }
    this.initializeKey();
  }

  private initializeKey(): void {
    if (!this.config.privateKey) {
      // Key can be omitted for read-only status and pre-flight operations
      return;
    }

    try {
      this.keyPair = KeyPair.fromString(this.config.privateKey as any);
      validateRestrictedKey(this.keyPair, this.config.expectedPublicKey);
      this.signer = new KeyPairSigner(this.keyPair);
      this.account = new Account(this.config.agentAccountId, this.provider, this.signer);
      if (this.fallbackProvider) {
        this.fallbackAccount = new Account(this.config.agentAccountId, this.fallbackProvider, this.signer);
      }
    } catch (err: any) {
      // Strictly guarantee that any private key material is stripped from error output
      let safeMsg = err?.message || 'Failed to initialize agent signer';
      if (this.config.privateKey) {
        safeMsg = safeMsg.replaceAll(this.config.privateKey, '[REDACTED_KEY]');
      }
      safeMsg = safeMsg.replace(/ed25519:[A-Za-z0-9_]+/g, '[REDACTED_KEY]');
      throw new Error(`Signer initialization failed: ${safeMsg}`);
    }
  }

  public hasSigningCapability(): boolean {
    return this.keyPair !== null && this.signer !== null && this.account !== null;
  }

  public getPublicKey(): string | null {
    return this.keyPair ? this.keyPair.getPublicKey().toString() : null;
  }

  /**
   * Constructs and previews a transaction payload without broadcasting.
   */
  public previewPayload(intent: PaymentIntent): SignedPayloadPreview {
    const args = buildPaymentArgs(intent);
    const action = buildRestrictedFunctionCallAction(args);
    const fnCall = action.functionCall!;

    return {
      signerId: this.config.agentAccountId,
      receiverId: this.config.vaultContractId,
      methodName: fnCall.methodName,
      args,
      gas: fnCall.gas.toString(),
      deposit: fnCall.deposit.toString(),
      publicKey: this.getPublicKey() || this.config.expectedPublicKey,
    };
  }

  /**
   * Constructs and signs the exact transaction locally.
   * Derives the Base58 transaction hash BEFORE any network broadcast is initiated.
   */
  public async createSignedPaymentTransaction(intent: PaymentIntent): Promise<{
    txHash: string;
    signedTransaction: any;
    preview: SignedPayloadPreview;
  }> {
    if (!this.hasSigningCapability() || !this.account || !this.signer) {
      throw new Error('Signer missing valid restricted key credentials. Injected AGENT_PRIVATE_KEY is required.');
    }

    const args = buildPaymentArgs(intent);
    const action = buildRestrictedFunctionCallAction(args);

    let tx: any;
    try {
      tx = await this.account.createTransaction({
        receiverId: this.config.vaultContractId,
        actions: [action],
        publicKey: await this.signer.getPublicKey(),
      });
    } catch (primaryErr: any) {
      if (this.fallbackAccount) {
        tx = await this.fallbackAccount.createTransaction({
          receiverId: this.config.vaultContractId,
          actions: [action],
          publicKey: await this.signer.getPublicKey(),
        });
      } else {
        throw primaryErr;
      }
    }

    const { txHash, signedTransaction } = await this.signer.signTransaction(tx);
    const txHashBase58 = baseEncode(txHash);
    const preview = this.previewPayload(intent);

    return {
      txHash: txHashBase58,
      signedTransaction,
      preview,
    };
  }

  /**
   * Broadcasts a previously signed transaction to NEAR RPC.
   * Throws if phase1StrictBoundary is active.
   */
  public async broadcastSignedTransaction(signedTransaction: any): Promise<any> {
    if (this.config.phase1StrictBoundary) {
      throw new Error(
        'Strict Phase 1 Execution Boundary Active: Live on-chain transaction broadcasting is prohibited in this milestone. Use --dry-run or inspect the payload preview.'
      );
    }

    try {
      return await this.provider.sendTransactionUntil(signedTransaction, 'FINAL');
    } catch (broadcastErr: any) {
      if (this.fallbackProvider) {
        return await this.fallbackProvider.sendTransactionUntil(signedTransaction, 'FINAL');
      }
      throw broadcastErr;
    }
  }

  /**
   * Broadcasts a transaction using two-stage signing.
   * Throws if phase1StrictBoundary is active or key is missing.
   */
  public async signAndSendPayment(intent: PaymentIntent): Promise<{ txHash: string; rawOutcome: any }> {
    if (this.config.phase1StrictBoundary) {
      throw new Error(
        'Strict Phase 1 Execution Boundary Active: Live on-chain transaction broadcasting is prohibited in this milestone. Use --dry-run or inspect the payload preview.'
      );
    }

    const { txHash, signedTransaction } = await this.createSignedPaymentTransaction(intent);
    const outcome = await this.broadcastSignedTransaction(signedTransaction);

    return {
      txHash,
      rawOutcome: outcome,
    };
  }
}
