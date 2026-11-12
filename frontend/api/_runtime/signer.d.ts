import { KeyPair } from 'near-api-js';
import { AgentConfig } from './config.js';
import { PaymentIntent, RequestPaymentArgs } from './types.js';
export declare const STANDARD_PAYMENT_GAS = 30000000000000n;
export declare const ZERO_DEPOSIT = 0n;
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
export declare function validateRestrictedKey(keyPair: KeyPair, expectedPublicKey?: string): void;
/**
 * Serializes standard request_payment arguments strictly conforming to the Rust contract interface.
 * Enforces positive amount validation as defense-in-depth.
 */
export declare function buildPaymentArgs(intent: PaymentIntent): RequestPaymentArgs;
/**
 * Builds the FunctionCall action while strictly asserting zero attached deposit and method confinement.
 */
export declare function buildRestrictedFunctionCallAction(args: RequestPaymentArgs): import("near-api-js").Action;
/**
 * Dedicated restricted signer for agent-a.vault-parent.testnet.
 * Implements two-stage signing so transaction hashes are derived and persisted BEFORE broadcast.
 */
export declare class AgentSigner {
    private config;
    private keyPair;
    private signer;
    private account;
    private fallbackAccount;
    private provider;
    private fallbackProvider;
    constructor(config: AgentConfig);
    private initializeKey;
    hasSigningCapability(): boolean;
    getPublicKey(): string | null;
    /**
     * Constructs and previews a transaction payload without broadcasting.
     */
    previewPayload(intent: PaymentIntent): SignedPayloadPreview;
    /**
     * Constructs and signs the exact transaction locally.
     * Derives the Base58 transaction hash BEFORE any network broadcast is initiated.
     */
    createSignedPaymentTransaction(intent: PaymentIntent): Promise<{
        txHash: string;
        signedTransaction: any;
        preview: SignedPayloadPreview;
    }>;
    /**
     * Broadcasts a previously signed transaction to NEAR RPC.
     * Throws if phase1StrictBoundary is active.
     */
    broadcastSignedTransaction(signedTransaction: any): Promise<any>;
    /**
     * Broadcasts a transaction using two-stage signing.
     * Throws if phase1StrictBoundary is active or key is missing.
     */
    signAndSendPayment(intent: PaymentIntent): Promise<{
        txHash: string;
        rawOutcome: any;
    }>;
}
//# sourceMappingURL=signer.d.ts.map