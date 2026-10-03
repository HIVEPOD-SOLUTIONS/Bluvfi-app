import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
import { Card, FieldInput, Muted, ResultBox, SegTabs } from './provider-ui';

/**
 * Native port of the web's Doma section, through the same /api/doma/action route: discover and inspect domains,
 * browse listings and offers, fetch orderbook data, and poll protocol events. Buying, listing and offers that need
 * a wallet signature are done through the AI assistant, which signs from the in-app wallet.
 */

type Tab = 'discover' | 'market' | 'orderbook' | 'events';
const TABS: { key: Tab; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'market', label: 'Market' },
  { key: 'orderbook', label: 'Orderbook' },
  { key: 'events', label: 'Events' },
];

export function DomaSheet({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: (prompt: string) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Doma Protocol" snapPoints={['92%']} scrollable>
      {open && (
        <DomaContent
          onAsk={(p) => {
            onClose();
            setTimeout(() => onAsk(p), 300);
          }}
        />
      )}
    </BottomSheet>
  );
}

function ActionButton({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.action, danger && styles.actionDanger, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.actionText, danger && { color: Colors.redAlert }]}>{label}</Text>
    </Pressable>
  );
}

function DomaContent({ onAsk }: { onAsk: (prompt: string) => void }) {
  const call = useApiClient();
  const { getEvmWallet } = useAuth();
  const [tab, setTab] = useState<Tab>('discover');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const [domain, setDomain] = useState('example.com');
  const [sld, setSld] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [orderbook, setOrderbook] = useState('DOMA');
  const [chainId, setChainId] = useState('eip155:97476');
  const [contractAddress, setContractAddress] = useState('');
  const [orderId, setOrderId] = useState('');
  const [buyer, setBuyer] = useState(getEvmWallet?.()?.address ?? '');
  const [cursor, setCursor] = useState('bluvfi');
  const [lastEventId, setLastEventId] = useState('');
  const [eventTypes, setEventTypes] = useState('');

  const run = async (action: string, payload: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await call<{ result: unknown; error?: string }>('/api/doma/action', { method: 'POST', body: { action, payload } });
      if (data.error) throw new Error(data.error);
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Doma request failed');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setResult(null);
    setError(null);
  };

  return (
    <View style={styles.stack}>
      <Muted>Search tokenized domains, inspect listings and offers, prepare marketplace fills and monitor protocol events.</Muted>
      <SegTabs tabs={TABS} value={tab} onChange={switchTab} />

      {tab === 'discover' && (
        <Card>
          <Text style={styles.title}>Domain discovery</Text>
          <FieldInput label="Domain" value={domain} onChange={setDomain} placeholder="example.com" />
          <FieldInput label="Token ID" optional value={tokenId} onChange={setTokenId} placeholder="For statistics and token detail" />
          <FieldInput label="Command correlation ID" optional value={correlationId} onChange={setCorrelationId} />
          <View style={styles.grid}>
            <ActionButton label="Search" disabled={loading} onPress={() => run('searchNames', { name: domain, take: 20 })} />
            <ActionButton label="Inspect" disabled={loading} onPress={() => run('getName', { name: domain })} />
            <ActionButton
              label={tokenId ? 'Stats' : 'Tokens'}
              disabled={loading}
              onPress={() => run(tokenId ? 'getNameStatistics' : 'getTokens', tokenId ? { tokenId } : { name: domain })}
            />
            <ActionButton label="Token detail" disabled={loading || !tokenId} onPress={() => run('getToken', { tokenId })} />
            <ActionButton label="Command" disabled={loading || !correlationId} onPress={() => run('getCommand', { correlationId })} />
            <ActionButton label="TLDs" disabled={loading} onPress={() => run('getSupportedTlds', { query: domain.split('.').pop() ?? '' })} />
            <ActionButton label="Network" disabled={loading} onPress={() => run('getNetworkInfo', {})} />
            <ActionButton label="Fractionalization" disabled={loading} onPress={() => run('getFractionalizationInfo', {})} />
            <ActionButton label="Workflows" disabled={loading} onPress={() => run('getLifecycleWorkflows', {})} />
            <ActionButton label="Name activity" disabled={loading} onPress={() => run('getNameActivities', { name: domain, take: 20 })} />
            <ActionButton label="Token activity" disabled={loading || !tokenId} onPress={() => run('getTokenActivities', { tokenId, take: 20 })} />
          </View>
        </Card>
      )}

      {tab === 'market' && (
        <Card>
          <Text style={styles.title}>Marketplace</Text>
          <Text style={styles.small}>Browse buy-now listings and active offers.</Text>
          <FieldInput label="Second-level domain" value={sld} onChange={setSld} placeholder="example" />
          <FieldInput label="Token ID for offers" optional value={tokenId} onChange={setTokenId} />
          <View style={styles.grid}>
            <ActionButton label="Listings" disabled={loading} onPress={() => run('getListings', { sld: sld || undefined, take: 20 })} />
            <ActionButton label="Offers" disabled={loading} onPress={() => run('getOffers', { tokenId: tokenId || undefined, take: 20, status: 'ACTIVE' })} />
          </View>
        </Card>
      )}

      {tab === 'orderbook' && (
        <Card>
          <Text style={styles.title}>Orderbook</Text>
          <Text style={styles.small}>Fees, supported currencies and fulfillment data for a listing or offer.</Text>
          <FieldInput label="Orderbook" value={orderbook} onChange={setOrderbook} placeholder="DOMA" />
          <FieldInput label="Chain ID" value={chainId} onChange={setChainId} placeholder="eip155:97476" />
          <FieldInput label="Token contract" value={contractAddress} onChange={setContractAddress} placeholder="0x..." />
          <FieldInput label="Order ID" value={orderId} onChange={setOrderId} placeholder="Listing or offer order ID" />
          <FieldInput label="Buyer / fulfiller" value={buyer} onChange={setBuyer} placeholder="0x..." />
          <View style={styles.grid}>
            <ActionButton label="Fees" disabled={loading || !contractAddress} onPress={() => run('getOrderbookFees', { orderbook, chainId, contractAddress })} />
            <ActionButton label="Currencies" disabled={loading || !contractAddress} onPress={() => run('getSupportedCurrencies', { orderbook, chainId, contractAddress })} />
            <ActionButton label="Buy data" disabled={loading || !orderId || !buyer} onPress={() => run('getListingFulfillment', { orderId, buyer })} />
            <ActionButton label="Accept offer data" disabled={loading || !orderId || !buyer} onPress={() => run('getOfferFulfillment', { orderId, fulfiller: buyer })} />
          </View>
        </Card>
      )}

      {tab === 'events' && (
        <Card>
          <Text style={styles.title}>Protocol events</Text>
          <Text style={styles.small}>Poll Doma events for tokenization, marketplace and domain lifecycle changes.</Text>
          <FieldInput label="Cursor" value={cursor} onChange={setCursor} placeholder="bluvfi" />
          <FieldInput label="Last event ID" optional numeric value={lastEventId} onChange={setLastEventId} placeholder="0" />
          <FieldInput label="Event types" optional value={eventTypes} onChange={setEventTypes} placeholder="Comma-separated filters" />
          <View style={styles.grid}>
            <ActionButton
              label="Poll"
              disabled={loading}
              onPress={() =>
                run('pollEvents', {
                  cursor,
                  limit: 10,
                  finalizedOnly: true,
                  includeSynthetics: true,
                  eventTypes: eventTypes.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
            />
            <ActionButton label="Ack" disabled={loading || !lastEventId} onPress={() => run('acknowledgeEvents', { cursor, lastEventId: Number(lastEventId) })} />
            <ActionButton label="Reset" danger disabled={loading || !lastEventId} onPress={() => run('resetEventCursor', { cursor, eventId: Number(lastEventId) })} />
          </View>
        </Card>
      )}

      {loading ? <Muted>Loading…</Muted> : <ResultBox result={result} error={error} />}

      <Button variant="outline" fullWidth onPress={() => onAsk('I want to buy or list a domain on Doma. Help me search and check the price.')}>
        Ask Bluvfi to buy or list a domain
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  title: { ...Type.h3, color: Colors.tx0 },
  small: { ...Type.small, color: Colors.tx1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  action: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    backgroundColor: 'rgba(143,174,130,0.08)',
  },
  actionDanger: { borderColor: 'rgba(224,82,82,0.3)', backgroundColor: 'rgba(224,82,82,0.08)' },
  actionText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.sage },
});
