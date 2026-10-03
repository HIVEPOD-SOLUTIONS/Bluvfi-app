/** Client-side shapes for the Cryptorefills checkout (mirrors the types in bluvfi/src/lib/cryptorefills.ts). */

export type CrRail = 'base' | 'solana';

export interface CrOrderItem {
  beneficiary_account: string;
  product_id?: string;
  brand_name?: string;
  denomination?: string;
  country_code?: string;
  product_value?: number;
}

export interface CrOrderRequest {
  email: string;
  items: CrOrderItem[];
}

/** The accepts[] entry of the decoded PAYMENT-REQUIRED header for the chosen rail. */
export interface CrPaymentRequirement {
  scheme: 'exact';
  network: string;
  /** Atomic USDC (6 decimals). */
  maxAmountRequired: string;
  asset: string;
  /** Base: recipient address. Solana: recipient OWNER pubkey (derive the ATA from it). */
  payTo: string;
  description?: string;
  maxTimeoutSeconds?: number;
  /** Base: EIP-712 domain bits. Solana: feePayer — the transaction's payerKey. */
  extra?: { name?: string; version?: string; decimals?: number; feePayer?: string };
}

export interface CrPhase1 {
  rail: CrRail;
  sessionId: string;
  requirement: CrPaymentRequirement;
  /** Unix seconds — used as validBefore on the EIP-3009 authorization. */
  expiresAt: number;
}

export interface CrDelivery {
  delivery_state?: 'pending' | 'completed' | 'failed';
  brand_name?: string;
  product_name?: string;
  denomination?: string;
  voucher_code?: string;
  pin_serial?: string;
  security_code?: string;
  redeem_instructions?: string;
  url?: string;
  qr_image_url?: string;
  barcode_image_url?: string;
  delivery_type?: string;
  failure_reason?: string;
}

export interface CrOrderStatus {
  order_id: string;
  status: 'processing' | 'completed' | 'failed' | 'expired';
  estimated_delivery_seconds?: number;
  poll_url?: string;
  deliveries?: CrDelivery[];
}

export interface CrPartnerRequest {
  email: string;
  brand_name: string;
  country_code: string;
  /** Catalogue denomination (e.g. "500 NGN"), or "range" with product_value. */
  denomination: string;
  product_value?: number;
  beneficiary_account: string;
  coin: string;
  network: string;
}

export interface CrPartnerOrder {
  order_id: string;
  wallet_address?: string;
  coin_amount?: string;
  coin?: string;
  network?: string;
  /** Payment URI for wallets (e.g. "bitcoin:…?amount=…"). */
  qr_text?: string;
  memo?: string;
  order_state?: string;
  payment_state?: string;
  expires_at?: string;
}

/** Normalised, UI-facing view of a partner order's progress. */
export interface CrPartnerStatus {
  order_id: string;
  status: 'awaiting_payment' | 'paid' | 'completed' | 'failed' | 'expired' | 'review';
  order_state?: string;
  payment_state?: string;
  deliveries: CrDelivery[];
}
