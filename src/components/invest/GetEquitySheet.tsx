import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { Card, Chips, FieldInput, Muted, OptionPicker, Pill, ResultBox } from './provider-ui';

/**
 * Native port of the web's GetEquity section: every operation the web exposes (market data, my account, trading,
 * funding), run through the same /api/getequity route. Operations that move money need an explicit confirmation.
 */

type Group = 'Market' | 'My Account' | 'Trading' | 'Funding';

interface FieldDef {
  name: string;
  label: string;
  placeholder?: string;
  options?: string[];
  numeric?: boolean;
  required?: boolean;
}

interface Operation {
  id: string;
  group: Group;
  label: string;
  description: string;
  sensitive?: boolean;
  fields: FieldDef[];
  submitLabel?: string;
  buildPayload: (f: Record<string, string>) => Record<string, unknown>;
}

const text = (name: string, label: string, placeholder?: string): FieldDef => ({ name, label, placeholder, required: true });
const opt = (name: string, label: string, placeholder?: string): FieldDef => ({ name, label, placeholder });
const num = (name: string, label: string, placeholder?: string): FieldDef => ({ name, label, placeholder, required: true, numeric: true });
const pick = (name: string, label: string, options: string[], required = true): FieldDef => ({ name, label, options, required });

const compact = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ''));

const OPERATIONS: Operation[] = [
  {
    id: 'listTokens',
    group: 'Market',
    label: 'List active tokens',
    description: 'All open tokens: equity, debt, SAFE and fixed-interest raises.',
    fields: [opt('page', 'Page'), opt('limit', 'Limit')],
    submitLabel: 'Load tokens',
    buildPayload: (f) => compact({ page: f.page, limit: f.limit }),
  },
  {
    id: 'listRaisingTokens',
    group: 'Market',
    label: 'List raising tokens',
    description: 'Tokens currently in an open fundraising round.',
    fields: [opt('page', 'Page'), opt('limit', 'Limit')],
    submitLabel: 'Load raises',
    buildPayload: (f) => compact({ page: f.page, limit: f.limit }),
  },
  {
    id: 'searchTokens',
    group: 'Market',
    label: 'Search tokens',
    description: 'Search by name or symbol.',
    fields: [opt('name', 'Name', 'e.g. Desperado'), opt('symbol', 'Symbol', 'e.g. DAMO'), opt('page', 'Page'), opt('limit', 'Limit')],
    submitLabel: 'Search',
    buildPayload: (f) => compact({ name: f.name, symbol: f.symbol, page: f.page, limit: f.limit }),
  },
  {
    id: 'getToken',
    group: 'Market',
    label: 'Get token',
    description: 'Full details for one token by its id.',
    fields: [text('tokenId', 'Token ID')],
    buildPayload: (f) => ({ tokenId: f.tokenId }),
  },
  {
    id: 'getAsset',
    group: 'Market',
    label: 'Get asset',
    description: 'Details of the underlying asset behind a token.',
    fields: [text('assetId', 'Asset ID')],
    buildPayload: (f) => ({ assetId: f.assetId }),
  },
  {
    id: 'getTokenHistoricals',
    group: 'Market',
    label: 'Price history (OHLCV)',
    description: 'Historical daily price and volume for a token.',
    fields: [text('tokenId', 'Token ID'), opt('from', 'From (ISO date)'), opt('to', 'To (ISO date)')],
    buildPayload: (f) => compact({ tokenId: f.tokenId, from: f.from, to: f.to }),
  },
  {
    id: 'getOfferingBook',
    group: 'Market',
    label: 'Order book',
    description: 'Aggregate demand, cover ratio and the demand ladder for a live raise.',
    fields: [text('tokenId', 'Token ID'), opt('tranche', 'Tranche key (combined offerings only)')],
    buildPayload: (f) => compact({ tokenId: f.tokenId, tranche: f.tranche }),
  },
  {
    id: 'getTransaction',
    group: 'Market',
    label: 'Verify a transaction',
    description: 'Look up a transaction or payment by its reference to see if it has settled.',
    fields: [text('reference', 'Reference (tx_ref)'), opt('transactionId', 'Transaction ID')],
    buildPayload: (f) => compact({ reference: f.reference, transactionId: f.transactionId }),
  },

  {
    id: 'createMember',
    group: 'My Account',
    label: 'Open / confirm my account',
    description:
      'Opens a real, KYC-approved GetEquity account for you if you do not have one yet, or confirms your existing one. Never creates a duplicate. Use your own real details.',
    sensitive: true,
    fields: [
      text('fname', 'First name'),
      text('lname', 'Last name'),
      text('email', 'Email'),
      text('phone', 'Phone'),
      text('dob', 'Date of birth', 'YYYY-MM-DD'),
      pick('sex', 'Sex', ['male', 'female']),
      text('homeAddress', 'Home address'),
      text('city', 'City'),
      text('state', 'State'),
      text('country', 'Country'),
    ],
    submitLabel: 'Open / confirm my GetEquity account',
    buildPayload: (f) => ({
      fname: f.fname, lname: f.lname, email: f.email, phone: f.phone, dob: f.dob, sex: f.sex,
      homeAddress: f.homeAddress, city: f.city, state: f.state, country: f.country,
    }),
  },
  { id: 'getMemberBalance', group: 'My Account', label: 'My wallet balance', description: 'Your cash balance across every currency you hold.', fields: [], buildPayload: () => ({}) },
  { id: 'getMemberTokenBalance', group: 'My Account', label: 'My holdings', description: 'Every security you hold, with current value.', fields: [], buildPayload: () => ({}) },
  {
    id: 'getMemberOrders',
    group: 'My Account',
    label: 'My orders',
    description: 'Your buy and sell order history.',
    fields: [opt('page', 'Page'), opt('limit', 'Limit')],
    buildPayload: (f) => compact({ page: f.page, limit: f.limit }),
  },
  {
    id: 'getMemberTransactions',
    group: 'My Account',
    label: 'My transactions',
    description: 'Your full transaction history: funding, trades, payouts.',
    fields: [opt('page', 'Page'), opt('limit', 'Limit')],
    buildPayload: (f) => compact({ page: f.page, limit: f.limit }),
  },

  {
    id: 'buyTokenAsMember',
    group: 'Trading',
    label: 'Buy token',
    description: 'Places a secondary-market buy order, escrowed against your wallet balance.',
    sensitive: true,
    fields: [text('tokenId', 'Token ID'), num('amount', 'Amount of tokens'), text('currency', 'Currency', 'e.g. NGN')],
    submitLabel: 'Place buy order',
    buildPayload: (f) => ({ tokenId: f.tokenId, amount: Number(f.amount), currency: f.currency }),
  },
  {
    id: 'sellTokenAsMember',
    group: 'Trading',
    label: 'Sell token',
    description: 'Places a secondary-market sell order for tokens you already hold.',
    sensitive: true,
    fields: [text('tokenId', 'Token ID'), num('amount', 'Amount of tokens'), text('currency', 'Currency', 'e.g. NGN')],
    submitLabel: 'Place sell order',
    buildPayload: (f) => ({ tokenId: f.tokenId, amount: Number(f.amount), currency: f.currency }),
  },
  {
    id: 'getFundInvestQuote',
    group: 'Trading',
    label: 'Fund + invest quote',
    description: 'Preview the fees and total charge before initiating any payment.',
    fields: [text('tokenId', 'Token ID'), num('investmentAmount', 'Investment amount'), text('currency', 'Currency', 'e.g. NGN')],
    submitLabel: 'Get quote',
    buildPayload: (f) => ({ tokenId: f.tokenId, investmentAmount: Number(f.investmentAmount), currency: f.currency }),
  },
  {
    id: 'fundInvest',
    group: 'Trading',
    label: 'Fund + invest',
    description: 'Creates a card payment link or bank-transfer account that funds your wallet and invests in one flow. This call charges nothing by itself.',
    sensitive: true,
    fields: [
      text('tokenId', 'Token ID'),
      num('investmentAmount', 'Investment amount'),
      text('currency', 'Currency', 'e.g. NGN'),
      pick('paymentMethod', 'Payment method', ['card', 'bank_transfer']),
      opt('redirectUrl', 'Redirect URL (required for card)'),
    ],
    submitLabel: 'Create payment',
    buildPayload: (f) => compact({ tokenId: f.tokenId, investmentAmount: Number(f.investmentAmount), currency: f.currency, paymentMethod: f.paymentMethod, redirectUrl: f.redirectUrl }),
  },
  {
    id: 'commitToOfferingAsMember',
    group: 'Trading',
    label: 'Bid into an offering',
    description: 'Places a bid on your behalf. Cash is held on your own wallet until allotment.',
    sensitive: true,
    fields: [
      text('tokenId', 'Offering/token ID'),
      num('amount', 'Amount to commit'),
      opt('bid_price', 'Bid price (price-based offerings)'),
      opt('bid_rate', 'Bid rate (debt/fixed-interest offerings)'),
      opt('tranche', 'Tranche key (combined offerings only)'),
    ],
    submitLabel: 'Place bid',
    buildPayload: (f) =>
      compact({
        tokenId: f.tokenId,
        amount: Number(f.amount),
        bid_price: f.bid_price ? Number(f.bid_price) : undefined,
        bid_rate: f.bid_rate ? Number(f.bid_rate) : undefined,
        tranche: f.tranche,
      }),
  },
  {
    id: 'cancelMemberOrder',
    group: 'Trading',
    label: 'Cancel order',
    description: 'Cancels an open order and reverses any escrowed funds.',
    sensitive: true,
    fields: [text('orderId', 'Order ID')],
    submitLabel: 'Cancel order',
    buildPayload: (f) => ({ orderId: f.orderId }),
  },

  {
    id: 'fundMemberWallet',
    group: 'Funding',
    label: 'Fund my wallet',
    description: 'Funds your cash wallet only, with no token purchase.',
    sensitive: true,
    fields: [
      num('amount', 'Amount'),
      pick('currency', 'Currency', ['NGN', 'USD', 'KES', 'GHS', 'ZAR', 'GBP', 'EUR']),
      pick('paymentMethod', 'Payment method', ['card', 'bank_transfer', 'ussd', 'mobilemoney'], false),
      opt('redirectUrl', 'Redirect URL (required unless bank_transfer)'),
    ],
    submitLabel: 'Create payment',
    buildPayload: (f) => compact({ amount: Number(f.amount), currency: f.currency, paymentMethod: f.paymentMethod || undefined, redirectUrl: f.redirectUrl }),
  },
  {
    id: 'withdrawMemberWallet',
    group: 'Funding',
    label: 'Withdraw to bank',
    description: 'Debits your wallet to a bank account. Created as Pending and still needs approval before disbursement.',
    sensitive: true,
    fields: [
      num('amount', 'Amount'),
      text('bank_name', 'Bank name', 'e.g. Guaranty Trust Bank'),
      text('account_name', 'Account name'),
      text('account_number', 'Account number'),
      pick('currency', 'Currency', ['NGN', 'KES', 'GHS', 'ZAR', 'UGX', 'TZS']),
    ],
    submitLabel: 'Request withdrawal',
    buildPayload: (f) => ({ amount: Number(f.amount), bank_name: f.bank_name, account_name: f.account_name, account_number: f.account_number, currency: f.currency }),
  },
];

const GROUPS: { key: Group; label: string }[] = [
  { key: 'Market', label: 'Market' },
  { key: 'My Account', label: 'My Account' },
  { key: 'Trading', label: 'Trading' },
  { key: 'Funding', label: 'Funding' },
];

const GROUP_COLORS: Record<Group, { color: string; bg: string }> = {
  Market: { color: Colors.sage, bg: 'rgba(143,174,130,0.15)' },
  'My Account': { color: '#7DD3FC', bg: 'rgba(125,211,252,0.12)' },
  Trading: { color: Colors.amber, bg: 'rgba(232,168,56,0.12)' },
  Funding: { color: Colors.redAlert, bg: 'rgba(224,82,82,0.12)' },
};

export function GetEquitySheet({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: (prompt: string) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="GetEquity" snapPoints={['92%']} scrollable>
      {open && (
        <GetEquityContent
          onAsk={(p) => {
            onClose();
            setTimeout(() => onAsk(p), 300);
          }}
        />
      )}
    </BottomSheet>
  );
}

function GetEquityContent({ onAsk }: { onAsk: (prompt: string) => void }) {
  const call = useApiClient();
  const [config, setConfig] = useState<{ hasApiKey: boolean; env: string } | null>(null);
  const [group, setGroup] = useState<Group>('Market');
  const [selected, setSelected] = useState<Operation | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ hasApiKey: boolean; env: string }>('/api/getequity', { method: 'POST', body: { op: 'getConfig' } })
      .then(setConfig)
      .catch(() => setConfig({ hasApiKey: false, env: 'sandbox' }));
  }, [call]);

  const choose = (op: Operation | null) => {
    setSelected(op);
    setForm({});
    setConfirmed(false);
    setResult(null);
    setError(null);
  };

  const missing = selected?.fields.some((f) => f.required && !form[f.name]?.trim()) ?? false;

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await call<unknown>('/api/getequity', { method: 'POST', body: { op: selected.id, ...selected.buildPayload(form) } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <View style={styles.logo}>
            <Image source={require('../../../assets/images/logos/getequity.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>GetEquity</Text>
            <Text style={styles.small}>Private markets: equity, SAFE, debt and fixed-interest raises</Text>
          </View>
        </View>
        <Text style={styles.small}>
          Each Bluvfi user who opts in gets a real, KYC-approved GetEquity account. GetEquity holds the cash and securities; Bluvfi never custodies them.
        </Text>
        {config ? (
          <Pill
            label={config.hasApiKey ? `Configured · ${config.env}` : 'Not configured'}
            color={config.hasApiKey ? Colors.sage : Colors.amber}
            bg={config.hasApiKey ? 'rgba(143,174,130,0.15)' : 'rgba(232,168,56,0.12)'}
          />
        ) : null}
      </Card>

      {!selected && (
        <>
          <Chips
            items={GROUPS}
            value={group}
            onChange={(g) => {
              setGroup(g);
              choose(null);
            }}
          />
          {OPERATIONS.filter((o) => o.group === group).map((op) => (
            <Pressable key={op.id} onPress={() => choose(op)} style={styles.opRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>
                  {op.label}
                  {op.sensitive ? <Text style={styles.moves}>{'  MOVES MONEY'}</Text> : null}
                </Text>
                <Text style={styles.small} numberOfLines={2}>
                  {op.description}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Button variant="outline" fullWidth onPress={() => onAsk('I want to invest in private markets with GetEquity. Show me what is available.')}>
            Ask Bluvfi to invest for me
          </Button>
        </>
      )}

      {selected && (
        <View style={styles.stack}>
          <Text onPress={() => choose(null)} style={[styles.small, { color: Colors.sage }]}>
            ← Back
          </Text>
          <Card>
            <Pill label={selected.group} color={GROUP_COLORS[selected.group].color} bg={GROUP_COLORS[selected.group].bg} />
            <Text style={styles.title}>{selected.label}</Text>
            <Text style={styles.small}>{selected.description}</Text>
          </Card>

          {selected.fields.map((f) =>
            f.options ? (
              <OptionPicker key={f.name} label={f.label + (f.required ? '' : ' (optional)')} options={f.options} value={form[f.name] ?? ''} onChange={(v) => setForm((p) => ({ ...p, [f.name]: v }))} />
            ) : (
              <FieldInput
                key={f.name}
                label={f.label}
                optional={!f.required}
                numeric={f.numeric}
                placeholder={f.placeholder}
                value={form[f.name] ?? ''}
                onChange={(v) => setForm((p) => ({ ...p, [f.name]: v }))}
              />
            ),
          )}

          {selected.sensitive && (
            <Pressable onPress={() => setConfirmed((c) => !c)} style={styles.confirm}>
              <View style={[styles.box, confirmed && styles.boxOn]}>{confirmed ? <Text style={styles.tick}>✓</Text> : null}</View>
              <Text style={[styles.small, { flex: 1, color: '#F5B5B5' }]}>
                I have confirmed these exact details with the person this affects, and I understand this moves real money or creates a real account on GetEquity.
              </Text>
            </Pressable>
          )}

          <Button fullWidth loading={loading} disabled={missing || (selected.sensitive && !confirmed)} onPress={submit}>
            {selected.submitLabel ?? 'Submit'}
          </Button>
          <ResultBox result={result} error={error} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  title: { ...Type.h3, color: Colors.tx0 },
  small: { ...Type.small, color: Colors.tx1 },
  moves: { fontFamily: Fonts.sansBold, fontSize: 10, color: Colors.redAlert },
  chevron: { ...Type.h1, color: Colors.tx1 },
  logo: { width: 44, height: 44, borderRadius: Radii.lg, backgroundColor: 'rgba(91,141,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 30, height: 30 },
  opRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  confirm: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(224,82,82,0.3)',
    backgroundColor: 'rgba(224,82,82,0.08)',
    padding: Spacing.md,
  },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.redAlert, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: Colors.redAlert },
  tick: { color: '#FFFFFF', fontSize: 13, fontFamily: Fonts.sansBold },
});
