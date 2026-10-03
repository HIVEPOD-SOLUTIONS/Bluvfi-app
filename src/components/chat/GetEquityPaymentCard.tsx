import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/**
 * Pay card for GetEquity's fund-and-invest / fund-wallet tools. GetEquity returns either a hosted payment
 * link (card, USSD, mobile money) or a virtual bank account to transfer to. The response shape isn't fixed,
 * so pull the link and bank details out of it wherever they sit (same extraction as the web card).
 */

type Output = {
  getEquityPayment: true;
  purpose: 'invest' | 'fund_wallet';
  amount: number;
  currency: string;
  paymentMethod: string;
  result: unknown;
};

const LINK_KEY = /link|url|checkout|authori[sz]ation/i;
const BANK_FIELDS: [RegExp, string][] = [
  [/^bank_?name$|^bank$/i, 'Bank'],
  [/^account_?name$/i, 'Account name'],
  [/^account_?number$|^nuban$|^iban$/i, 'Account number'],
  [/^(sort|routing)_?code$/i, 'Sort / routing code'],
  [/^reference$|^narration$|^payment_?reference$/i, 'Reference'],
  [/^ussd(_?code|_?string)?$|^dial_?code$/i, 'Dial (USSD)'],
  [/^(expires?_?at|expiry|expiration)$/i, 'Expires'],
];

function walk(v: unknown, visit: (key: string, value: unknown) => void, key = '') {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit, key));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      visit(k, x);
      walk(x, visit, k);
    }
  }
}

function extract(result: unknown) {
  let link: string | null = null;
  const bank: { label: string; value: string }[] = [];
  walk(result, (k, v) => {
    if (typeof v !== 'string' && typeof v !== 'number') return;
    const s = String(v);
    if (!link && typeof v === 'string' && /^https:\/\//.test(s) && LINK_KEY.test(k)) link = s;
    const field = BANK_FIELDS.find(([re]) => re.test(k));
    if (field && !bank.some((b) => b.label === field[1])) bank.push({ label: field[1], value: s });
  });
  return { link: link as string | null, bank };
}

export function GetEquityPaymentCard({ output }: { output: Output }) {
  const { link, bank } = useMemo(() => extract(output.result), [output.result]);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (v: string) => {
    await Clipboard.setStringAsync(v);
    setCopied(v);
    setTimeout(() => setCopied(null), 1500);
  };
  const amount = `${output.currency} ${Number(output.amount).toLocaleString()}`;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>GE</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{output.purpose === 'invest' ? 'Fund & invest' : 'Fund GetEquity wallet'}</Text>
          <Text style={styles.sub}>GetEquity · {output.paymentMethod.replace('_', ' ')}</Text>
        </View>
        <Text style={styles.amount}>{amount}</Text>
      </View>

      {link ? (
        <Button variant="secondary" fullWidth onPress={() => Linking.openURL(link!)}>
          {`Pay ${amount} on GetEquity ↗`}
        </Button>
      ) : null}

      {bank.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={styles.sub}>
            Transfer exactly <Text style={styles.strong}>{amount}</Text> to:
          </Text>
          {bank.map((b) => (
            <Pressable key={b.label} onPress={() => copy(b.value)} style={styles.bankRow}>
              <Text style={styles.tiny}>{b.label}</Text>
              <Text style={styles.mono}>{copied === b.value ? 'Copied' : b.value}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!link && bank.length === 0 && (
        <Text style={styles.warn}>
          GetEquity created the payment but didn't return a link or account here. Check your email or the GetEquity screen.
        </Text>
      )}

      <Text style={styles.tiny}>
        {output.purpose === 'invest'
          ? 'Once your payment clears, GetEquity funds your wallet and places the investment.'
          : 'Once your payment clears, it shows in your GetEquity wallet.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginVertical: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  badge: { width: 40, height: 40, borderRadius: Radii.lg, backgroundColor: 'rgba(129,140,248,0.12)', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: Fonts.sansBold, fontSize: 12, color: '#818CF8' },
  title: { ...Type.h3, color: Colors.tx0 },
  sub: { ...Type.small, color: Colors.tx1 },
  tiny: { ...Type.small, fontSize: 11, color: Colors.tx1 },
  amount: { ...Type.h3, fontFamily: Type.amount.fontFamily, color: Colors.tx0 },
  strong: { color: Colors.tx0 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.bg0, borderRadius: Radii.md, padding: Spacing.md },
  mono: { ...Type.small, fontFamily: Fonts.mono, color: Colors.tx0 },
  warn: { ...Type.small, color: Colors.amber },
});
