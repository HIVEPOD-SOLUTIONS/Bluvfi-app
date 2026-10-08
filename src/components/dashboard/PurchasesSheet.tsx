import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiQuery } from '@/hooks/use-api';
import type { Payment } from '@/lib/api-types';
import { askAboutPurchase, explorerUrl, findOrder, parsePurchase, shortId, statusInfo, type BitrefillOrder, type StatusTone } from '@/lib/purchase-detail';
import { PurchaseRow } from './PurchaseRow';

const VARIANT: Record<StatusTone, BadgeVariant> = { success: 'live', danger: 'failed', pending: 'pending' };

interface PurchasesSheetProps {
  open: boolean;
  onClose: () => void;
  purchases: Payment[];
  /** The purchase whose details are showing (null: the list). */
  selected: Payment | null;
  onSelect: (payment: Payment | null) => void;
  /** Ask the assistant about a purchase. */
  onAsk: (prompt: string) => void;
}

/** Full purchase history for digital products (gift cards, top-ups, eSIMs), newest first. Tap one for its details. */
export function PurchasesSheet({ open, onClose, purchases, selected, onSelect, onAsk }: PurchasesSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={selected ? 'Purchase' : 'Purchase history'} snapPoints={['85%']} scrollable>
      {selected ? (
        <PurchaseDetail payment={selected} onBack={() => onSelect(null)} onAsk={(p) => { onClose(); onAsk(p); }} />
      ) : (
        <>
          <Text style={styles.subtitle}>
            {purchases.length} purchase{purchases.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.list}>
            {purchases.map((p) => (
              <PurchaseRow key={p.id} payment={p} onPress={() => onSelect(p)} />
            ))}
          </View>
        </>
      )}
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{typeof children === 'string' ? <Text style={styles.fieldValue}>{children}</Text> : children}</View>
    </View>
  );
}

/** One purchase: its status, amount, how it was paid, and (for a Bitrefill order) the code or eSIM link it delivered. */
function PurchaseDetail({ payment, onBack, onAsk }: { payment: Payment; onBack: () => void; onAsk: (prompt: string) => void }) {
  const toast = useToast();
  const { title, method } = parsePurchase(payment.description);
  const status = statusInfo(payment.status);
  const amount = Number(payment.amountUsdc);
  const when = new Date(payment.createdAt);

  // The delivery details (code, eSIM link) are on the order record, which a Bitrefill purchase links to by its invoice id.
  const orders = useApiQuery<{ orders: BitrefillOrder[] }>(['bitrefill-orders'], '/api/bitrefill/orders', { limit: 200 }, { enabled: !!payment.referenceId, staleTime: 30_000, retry: 1 });
  const order = findOrder(orders.data?.orders, payment);
  const explorer = explorerUrl(payment);

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast({ variant: 'success', title: `${what} copied` });
  };

  return (
    <View style={{ gap: Spacing.lg }}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to purchase history">
        <Text style={styles.back}>‹ All purchases</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{title}</Text>
        {amount > 0 ? <Text style={styles.heroAmount}>${amount.toFixed(2)}</Text> : null}
        <Badge variant={VARIANT[status.tone]}>{status.label}</Badge>
      </View>

      {order?.redemptionCode ? (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your code</Text>
          <Text selectable style={styles.code}>
            {order.redemptionCode}
          </Text>
          <Button variant="outline" onPress={() => copy(order.redemptionCode as string, 'Code')}>
            Copy code
          </Button>
        </View>
      ) : null}
      {order?.esimInstallLink ? (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>eSIM install link</Text>
          <Button variant="outline" onPress={() => Linking.openURL(order.esimInstallLink as string).catch(() => {})}>
            Open install link
          </Button>
        </View>
      ) : null}
      {!order && payment.referenceId && orders.isLoading ? <Text style={styles.note}>Loading delivery details…</Text> : null}
      {status.tone === 'success' && payment.referenceId && !orders.isLoading && !order?.redemptionCode && !order?.esimInstallLink ? (
        <Text style={styles.note}>No code is shown here. A phone top-up is credited straight to the number. For a gift card, check the email you used, or ask the assistant.</Text>
      ) : null}
      {status.tone === 'danger' ? <Text style={styles.note}>This purchase didn’t go through. If money left your wallet, the provider refunds it. Ask the assistant to check what happened.</Text> : null}
      {status.tone === 'pending' ? <Text style={styles.note}>This purchase is still being processed. It updates by itself.</Text> : null}

      <View style={styles.card}>
        <Field label="Date">{`${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}</Field>
        {method ? <Field label="Paid with">{method}</Field> : null}
        {order?.recipientEmail ? <Field label="Sent to">{order.recipientEmail}</Field> : null}
        {order?.packageValue ? <Field label="Package">{order.packageValue}</Field> : null}
        {payment.referenceId ? (
          <Field label="Reference">
            <Pressable onPress={() => copy(payment.referenceId as string, 'Reference')} accessibilityRole="button" accessibilityLabel="Copy reference">
              <Text style={[styles.fieldValue, styles.link]}>{shortId(payment.referenceId)}</Text>
            </Pressable>
          </Field>
        ) : null}
        {explorer ? (
          <Field label="Transaction">
            <Pressable onPress={() => Linking.openURL(explorer).catch(() => {})} accessibilityRole="link">
              <Text style={[styles.fieldValue, styles.link]}>{shortId(payment.txHash)} ↗</Text>
            </Pressable>
          </Field>
        ) : null}
      </View>

      <Button variant="outline" onPress={() => onAsk(askAboutPurchase(payment))}>
        Ask AI about this purchase
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { ...Type.body, color: Colors.tx1, marginBottom: Spacing.lg },
  list: { gap: Spacing.sm },
  back: { ...Type.body, fontFamily: Fonts.sansSemiBold, color: Colors.sage },
  hero: { alignItems: 'flex-start', gap: Spacing.sm },
  heroTitle: { ...Type.h1, color: Colors.tx0 },
  heroAmount: { ...Type.display, color: Colors.tx0 },
  codeCard: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.borderSage, padding: Spacing.lg, gap: Spacing.md },
  codeLabel: { ...Type.label, color: Colors.tx2 },
  code: { fontFamily: Fonts.monoBold, fontSize: 18, color: Colors.tx0, letterSpacing: 1 },
  note: { ...Type.small, color: Colors.tx1 },
  card: { backgroundColor: Colors.bg0, borderRadius: Radii.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.lg },
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  fieldLabel: { ...Type.small, color: Colors.tx2 },
  fieldValue: { ...Type.small, color: Colors.tx0, textAlign: 'right' },
  link: { color: Colors.sage, textDecorationLine: 'underline' },
});
