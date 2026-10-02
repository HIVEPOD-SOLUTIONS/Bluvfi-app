export interface OnrampPair {
  pair_id: string;
  input_currency: string;
  output_currency: string;
  blockchain: string;
  min_output_amount: number;
  max_output_amount: number;
  fee_bps: number;
  network_fees: number;
  processing_time_min: number;
  processing_time_max: number;
}

export interface OnrampOrder {
  order_id: string;
  upi_qr: string;
  upi_intent: string;
  input_amount: number;
  fee_input: number;
  network_fee_input: number;
  rate: number;
  expires_at: number;
}

export interface OfframpPair {
  pair_id: string;
  input_currency: string;
  output_currency: string;
  blockchain: string;
  min_input_amount: number;
  max_input_amount: number;
  fee_bps: number;
  network_fees: number;
  processing_time_min: number;
  processing_time_max: number;
}

export interface OfframpBankAccount {
  bank_account_id: string;
  account_number: string;
  ifsc: string;
  account_holder_name: string;
  bank_name: string;
  is_default: boolean;
}

export interface OfframpOrder {
  order_id: string;
  deposit_address: string;
  blockchain: string;
  input_amount: number;
  input_currency: string;
  output_amount: number;
  expires_at: number;
}
