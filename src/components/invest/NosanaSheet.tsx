import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useApiClient } from '@/hooks/use-api';
import { Card, Chips, ErrorText, FieldInput, Muted, OptionPicker, Pill, SegTabs, Spinner } from './provider-ui';

/** Native port of the web's Nosana GPU Cloud section: Deployments, Deploy, Markets and Credits. */

type DeploymentStatus = 'DRAFT' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ARCHIVED' | 'ERROR' | 'INSUFFICIENT_FUNDS';

interface Market {
  address: string;
  name: string;
  gpu: string;
  vram: number | null;
  price_nos_per_hour: number;
  type: 'PREMIUM' | 'COMMUNITY' | 'OTHER';
}

interface Deployment {
  id: string;
  name: string;
  status: DeploymentStatus;
  strategy: string;
  market: string;
  replicas: number;
  timeout: number;
  job_definition?: { ops: { args?: { image?: string } }[] };
  endpoint?: string;
  created_at: string;
  price_per_hour_usd?: number;
}

interface Credits {
  assignedCredits: number;
  reservedCredits: number;
  settledCredits: number;
}

interface SpendingTx {
  date: string;
  amount: number;
  deployment_id?: string;
  description?: string;
}

const fmtNos = (n: number | null | undefined, d = 3) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—');
const fmtVram = (v: number | null | undefined) => (typeof v === 'number' ? `${v}GB` : '—');
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
};

const STATUS_COLORS: Record<DeploymentStatus, { color: string; bg: string }> = {
  DRAFT: { color: Colors.tx1, bg: 'rgba(242,240,232,0.06)' },
  STARTING: { color: Colors.amber, bg: 'rgba(232,168,56,0.12)' },
  RUNNING: { color: Colors.sage, bg: 'rgba(143,174,130,0.15)' },
  STOPPING: { color: Colors.amber, bg: 'rgba(232,168,56,0.12)' },
  STOPPED: { color: Colors.tx1, bg: 'rgba(242,240,232,0.06)' },
  ARCHIVED: { color: Colors.tx2, bg: 'rgba(242,240,232,0.04)' },
  ERROR: { color: Colors.redAlert, bg: 'rgba(224,82,82,0.12)' },
  INSUFFICIENT_FUNDS: { color: Colors.redAlert, bg: 'rgba(224,82,82,0.12)' },
};

type Tab = 'deployments' | 'deploy' | 'markets' | 'credits';
const TABS: { key: Tab; label: string }[] = [
  { key: 'deployments', label: 'Deployments' },
  { key: 'deploy', label: 'Deploy' },
  { key: 'markets', label: 'Markets' },
  { key: 'credits', label: 'Credits' },
];

export function NosanaSheet({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: (prompt: string) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Nosana GPU Cloud" snapPoints={['92%']} scrollable>
      {open && <NosanaContent onAsk={(p) => { onClose(); setTimeout(() => onAsk(p), 300); }} />}
    </BottomSheet>
  );
}

function NosanaContent({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [tab, setTab] = useState<Tab>('deployments');
  const [preselected, setPreselected] = useState<string | null>(null);

  return (
    <View style={styles.stack}>
      <Muted>Deploy containerized AI workloads on decentralized GPUs. Billing comes from a prepaid credit balance, so nothing needs signing.</Muted>
      <SegTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'deployments' && <DeploymentsTab onDeploy={() => setTab('deploy')} />}
      {tab === 'deploy' && <DeployTab preselected={preselected} onDone={() => setTab('deployments')} />}
      {tab === 'markets' && (
        <MarketsTab
          onSelect={(a) => {
            setPreselected(a);
            setTab('deploy');
          }}
        />
      )}
      {tab === 'credits' && <CreditsTab />}
      <Button variant="outline" fullWidth onPress={() => onAsk('Help me deploy something on Nosana GPU Cloud. Show me the available GPU markets.')}>
        Ask Bluvfi to deploy for me
      </Button>
    </View>
  );
}

function StatusPill({ status }: { status: DeploymentStatus }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT;
  return <Pill label={status} color={c.color} bg={c.bg} />;
}

function DeploymentCard({ dep, onRefresh }: { dep: Deployment; onRefresh: () => void }) {
  const call = useApiClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const act = async (action: 'start' | 'stop' | 'archive') => {
    setBusy(true);
    setErr('');
    try {
      await call(`/api/nosana/deployments/${dep.id}/${action}`, { method: 'POST' });
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const image = dep.job_definition?.ops?.[0]?.args?.image;
  const canArchive = dep.status === 'STOPPED' || dep.status === 'ERROR' || dep.status === 'DRAFT';

  return (
    <Card>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {dep.name}
          </Text>
          <Text style={styles.mono} numberOfLines={1}>
            {dep.id}
          </Text>
        </View>
        <StatusPill status={dep.status} />
      </View>
      {image ? <Text style={styles.small}>Image: <Text style={styles.value}>{image}</Text></Text> : null}
      <Text style={styles.small}>
        Market: <Text style={styles.value}>{dep.market.slice(0, 8)}…</Text>
        {dep.price_per_hour_usd != null ? <Text>{'   Cost: '}<Text style={styles.value}>${dep.price_per_hour_usd.toFixed(3)}/hr</Text></Text> : null}
      </Text>
      <Text style={styles.small}>
        Replicas: <Text style={styles.value}>{dep.replicas}</Text>
        {'   Created: '}
        <Text style={styles.value}>{fmtDate(dep.created_at)}</Text>
      </Text>
      <Text style={styles.small}>Strategy: <Text style={styles.value}>{dep.strategy}</Text></Text>

      {dep.endpoint ? (
        <Pressable onPress={() => Linking.openURL(dep.endpoint!)} style={styles.endpoint}>
          <Text style={styles.small}>Endpoint</Text>
          <Text style={[styles.small, { color: Colors.sage, flex: 1, textDecorationLine: 'underline' }]} numberOfLines={1}>
            {dep.endpoint}
          </Text>
        </Pressable>
      ) : null}

      {dep.status === 'INSUFFICIENT_FUNDS' ? (
        <Text style={[styles.small, { color: Colors.redAlert }]}>Insufficient credits. Top up on the Nosana dashboard, then restart.</Text>
      ) : null}
      {err ? <Text style={[styles.small, { color: Colors.redAlert }]}>{err}</Text> : null}

      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: 4 }}>
        {(dep.status === 'DRAFT' || dep.status === 'STOPPED' || dep.status === 'INSUFFICIENT_FUNDS') && (
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="sm" fullWidth loading={busy} onPress={() => act('start')}>
              {dep.status === 'DRAFT' ? 'Start' : dep.status === 'STOPPED' ? 'Restart' : 'Retry start'}
            </Button>
          </View>
        )}
        {dep.status === 'RUNNING' && (
          <View style={{ flex: 1 }}>
            <Button variant="outline" size="sm" fullWidth loading={busy} onPress={() => act('stop')}>
              Stop
            </Button>
          </View>
        )}
        {canArchive && (
          <Button variant="ghost" size="sm" disabled={busy} onPress={() => act('archive')}>
            Archive
          </Button>
        )}
      </View>
    </Card>
  );
}

function DeploymentsTab({ onDeploy }: { onDeploy: () => void }) {
  const call = useApiClient();
  const [deps, setDeps] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await call<{ deployments: Deployment[] }>('/api/nosana/deployments');
      setDeps(data.deployments);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;
  if (err) return <ErrorText message={err} />;
  if (deps.length === 0)
    return (
      <View style={{ gap: Spacing.md, alignItems: 'center' }}>
        <Muted>No deployments yet. Launch your first GPU workload.</Muted>
        <Button onPress={onDeploy}>Deploy on GPU</Button>
      </View>
    );

  return (
    <View style={styles.stack}>
      <View style={styles.rowBetween}>
        <Text style={styles.small}>
          {deps.length} deployment{deps.length !== 1 ? 's' : ''}
        </Text>
        <Text onPress={load} style={[styles.small, { color: Colors.sage }]}>
          Refresh
        </Text>
      </View>
      {deps.map((d) => (
        <DeploymentCard key={d.id} dep={d} onRefresh={load} />
      ))}
    </View>
  );
}

const STRATEGIES = ['SIMPLE', 'SIMPLE-EXTEND', 'SCHEDULED', 'INFINITE'];

function DeployTab({ preselected, onDone }: { preselected: string | null; onDone: () => void }) {
  const call = useApiClient();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [marketsErr, setMarketsErr] = useState('');

  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [cmd, setCmd] = useState('');
  const [port, setPort] = useState('');
  const [market, setMarket] = useState('');
  const [strategy, setStrategy] = useState('SIMPLE');
  const [timeoutMin, setTimeoutMin] = useState('60');
  const [replicas, setReplicas] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await call<Market[]>('/api/nosana/markets');
        setMarkets(data);
        const chosen = preselected && data.some((m) => m.address === preselected) ? preselected : data[0]?.address;
        if (chosen) setMarket(chosen);
      } catch (e) {
        setMarketsErr(e instanceof Error ? e.message : 'Failed to load markets');
      } finally {
        setLoadingMarkets(false);
      }
    })();
  }, [call, preselected]);

  const selected = markets.find((m) => m.address === market);
  const mins = Number(timeoutMin) || 60;
  const reps = Number(replicas) || 1;
  const estimate = selected && strategy !== 'INFINITE' ? selected.price_nos_per_hour * (mins / 60) * reps : null;

  const deploy = async () => {
    if (!name.trim() || !image.trim() || !market) return;
    setBusy(true);
    setErr('');
    setSuccess('');
    try {
      const job_definition = {
        version: '0.1',
        type: 'container',
        meta: { trigger: 'api' },
        ops: [
          {
            type: 'container/run',
            id: 'main',
            args: {
              image: image.trim(),
              gpu: true,
              ...(cmd.trim() ? { cmd: cmd.trim() } : {}),
              ...(port ? { expose: Number(port) } : {}),
            },
          },
        ],
      };
      const dep = await call<Deployment>('/api/nosana/deployments', {
        method: 'POST',
        body: { name: name.trim(), market, timeout: mins, replicas: reps, strategy, job_definition },
      });
      await call(`/api/nosana/deployments/${dep.id}/start`, { method: 'POST' });
      setSuccess(`Deployment "${dep.name}" started.`);
      setName('');
      setImage('');
      setCmd('');
      setPort('');
      setTimeout(onDone, 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Deployment failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack}>
      <FieldInput label="Deployment name" value={name} onChange={setName} placeholder="my-llm-inference" />
      <FieldInput label="Docker image" value={image} onChange={setImage} placeholder="ollama/ollama:latest" />
      <FieldInput label="Entrypoint command" optional value={cmd} onChange={setCmd} placeholder="serve --model llama3" />
      <FieldInput label="Expose port" optional numeric value={port} onChange={setPort} placeholder="e.g. 8080" />
      <OptionPicker label="Strategy" options={STRATEGIES} value={strategy} onChange={setStrategy} />
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        {strategy !== 'INFINITE' && (
          <View style={{ flex: 1 }}>
            <FieldInput label="Timeout (min)" numeric value={timeoutMin} onChange={setTimeoutMin} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <FieldInput label="Replicas" numeric value={replicas} onChange={setReplicas} />
        </View>
      </View>

      <Text style={styles.label}>GPU market</Text>
      {loadingMarkets ? (
        <Spinner />
      ) : marketsErr ? (
        <ErrorText message={marketsErr} />
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {markets.map((m) => (
            <Pressable key={m.address} onPress={() => setMarket(m.address)} style={[styles.marketOption, market === m.address && styles.marketOptionActive]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {m.name}
                  {m.vram != null ? ` · ${m.vram}GB` : ''}
                </Text>
                <Text style={styles.small}>
                  {fmtNos(m.price_nos_per_hour)} NOS/hr · {m.type}
                </Text>
              </View>
              {market === m.address ? <Text style={{ color: Colors.sage, fontSize: 18 }}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      {selected ? (
        <Card>
          <Text style={styles.small}>
            GPU: <Text style={styles.value}>{selected.gpu}</Text>
            {'   VRAM: '}
            <Text style={styles.value}>{fmtVram(selected.vram)}</Text>
          </Text>
          <Text style={styles.small}>
            Estimated cost:{' '}
            <Text style={styles.value}>
              {estimate != null ? `~${estimate.toFixed(4)} NOS (${mins} min × ${reps} replica${reps !== 1 ? 's' : ''})` : 'Runs until manually stopped'}
            </Text>
          </Text>
        </Card>
      ) : null}

      {err ? <Text style={[styles.small, { color: Colors.redAlert }]}>{err}</Text> : null}
      {success ? <Text style={[styles.small, { color: Colors.sage }]}>{success}</Text> : null}
      <Button fullWidth loading={busy} disabled={!name.trim() || !image.trim() || !market} onPress={deploy}>
        Deploy on GPU
      </Button>
    </View>
  );
}

const MARKET_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PREMIUM', label: 'Premium' },
  { key: 'COMMUNITY', label: 'Community' },
  { key: 'OTHER', label: 'Other' },
] as const;

function MarketsTab({ onSelect }: { onSelect: (address: string) => void }) {
  const call = useApiClient();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<(typeof MARKET_FILTERS)[number]['key']>('ALL');

  useEffect(() => {
    (async () => {
      try {
        setMarkets(await call<Market[]>('/api/nosana/markets'));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [call]);

  if (loading) return <Spinner />;
  if (err) return <ErrorText message={err} />;
  const shown = filter === 'ALL' ? markets : markets.filter((m) => m.type === filter);

  return (
    <View style={styles.stack}>
      <Chips items={[...MARKET_FILTERS]} value={filter} onChange={setFilter} />
      {shown.length === 0 && <Muted>No markets found.</Muted>}
      {shown.map((m) => (
        <Pressable key={m.address} onPress={() => onSelect(m.address)}>
          <Card>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{m.name}</Text>
                <Text style={styles.mono} numberOfLines={1}>
                  {m.address}
                </Text>
              </View>
              <Pill
                label={m.type}
                color={m.type === 'PREMIUM' ? Colors.gold : m.type === 'COMMUNITY' ? Colors.sage : Colors.tx1}
                bg={m.type === 'PREMIUM' ? 'rgba(201,168,76,0.12)' : m.type === 'COMMUNITY' ? 'rgba(143,174,130,0.15)' : 'rgba(242,240,232,0.06)'}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Stat label="GPU" value={m.gpu} />
              <Stat label="VRAM" value={fmtVram(m.vram)} />
              <Stat label="Price" value={`${fmtNos(m.price_nos_per_hour)} NOS/hr`} />
            </View>
            <Text style={[styles.small, { color: Colors.sage, textAlign: 'right' }]}>Deploy on this GPU →</Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.small}>{label}</Text>
      <Text style={[styles.value, { marginTop: 2 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function CreditsTab() {
  const call = useApiClient();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [history, setHistory] = useState<SpendingTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [c, h] = await Promise.all([
          call<Credits>('/api/nosana/credits'),
          call<{ transactions: SpendingTx[] }>('/api/nosana/credits', { query: { history: 1 } }),
        ]);
        setCredits(c);
        setHistory(h.transactions);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load credits');
      } finally {
        setLoading(false);
      }
    })();
  }, [call]);

  if (loading) return <Spinner />;
  if (err) return <ErrorText message={err} />;
  if (!credits) return null;
  const available = credits.assignedCredits - credits.reservedCredits - credits.settledCredits;

  return (
    <View style={styles.stack}>
      <Card>
        <Text style={styles.small}>Available credits</Text>
        <Text style={styles.amount}>
          {fmtNos(available, 4)} <Text style={styles.small}>NOS</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Stat label="Assigned" value={fmtNos(credits.assignedCredits, 2)} />
          <Stat label="Reserved" value={fmtNos(credits.reservedCredits, 2)} />
          <Stat label="Settled" value={fmtNos(credits.settledCredits, 2)} />
        </View>
      </Card>

      {history.length > 0 ? (
        <>
          <Text style={styles.label}>Spending history</Text>
          {history.map((tx, i) => (
            <View key={i} style={styles.txRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.value} numberOfLines={2}>
                  {tx.description ?? tx.deployment_id ?? 'Usage'}
                </Text>
                <Text style={styles.small}>{fmtDate(tx.date)}</Text>
              </View>
              <Text style={[styles.value, { color: Colors.redAlert }]}>-${fmtNos(tx.amount, 4)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Muted>No spending history yet.</Muted>
      )}

      <Button variant="outline" fullWidth onPress={() => Linking.openURL('https://deploy.nosana.com')}>
        Top up credits on Nosana
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  title: { ...Type.h3, color: Colors.tx0 },
  small: { ...Type.small, color: Colors.tx1 },
  label: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx1 },
  value: { ...Type.small, fontFamily: Fonts.sansMedium, color: Colors.tx0 },
  mono: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.tx2 },
  amount: { ...Type.amount, color: Colors.tx0 },
  endpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.borderSage,
    backgroundColor: 'rgba(143,174,130,0.06)',
    padding: Spacing.sm,
  },
  marketOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg1,
    padding: Spacing.md,
  },
  marketOptionActive: { borderColor: Colors.sage },
  stat: { flex: 1, borderRadius: Radii.lg, backgroundColor: 'rgba(242,240,232,0.04)', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, alignItems: 'center' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg1,
    padding: Spacing.md,
  },
});
