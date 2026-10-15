/**
 * The wallet sheet's Balances tab: a wallet's own USDC is shown beside what is deposited in Circle Gateway, instead of the Gateway figure alone
 * (which showed $0.00 for Base on a wallet that held USDC there).
 *
 *     node scripts/tests/balance-merge.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const app = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(app, p), "utf8");
const load = makeLoader({});

const { mergeWalletBalances, walletUsdcOn } = load("src/lib/balance-merge.ts");
const row = (chain, confirmed = "0.00", pending) => ({ chain, label: chain, icon: "", color: "", confirmedBalance: confirmed, pendingBalance: pending });
const gateway = [row("Base"), row("Ethereum"), row("Arc"), row("Solana")];

const onlyWallet = mergeWalletBalances(gateway, { byChain: { Base: { usdc: 12.34 }, Ethereum: { usdc: 0 } }, solUsdc: 0, arcUsdc: 0 });
const base = onlyWallet.rows.find((r) => r.chain === "Base");
check("USDC in the wallet on Base shows as the Base balance even when nothing is in Gateway (it showed $0.00)", base.total === 12.34 && base.wallet === 12.34 && base.gateway === 0 && base.hasFunds && onlyWallet.totalUsdc === "12.34");

const both = mergeWalletBalances([row("Base", "5.00", "1.00")], { byChain: { Base: { usdc: 12.34 } } });
check("wallet USDC and Gateway USDC add up per network, and both are kept so the row can say where it is", both.rows[0].total === 17.34 && both.rows[0].wallet === 12.34 && both.rows[0].gateway === 5 && both.rows[0].pendingBalance === "1.00" && both.totalUsdc === "17.34");

const inGateway = mergeWalletBalances([row("Base", "3.50")], { byChain: { Base: { usdc: 0 } } });
check("a deposit in Gateway alone still counts", inGateway.rows[0].total === 3.5 && inGateway.rows[0].hasFunds && inGateway.totalUsdc === "3.50");

check("Solana and Arc use their own reads (Solana's token accounts, the Arc ERC-20), not the EVM table", walletUsdcOn("Solana", { solUsdc: 7 }) === 7 && walletUsdcOn("Arc", { arcUsdc: 2.5 }) === 2.5 && walletUsdcOn("Arc", { arcUsdc: null }) === 0 && walletUsdcOn("Base", { solUsdc: 7, arcUsdc: 2.5 }) === 0);

const sorted = mergeWalletBalances(gateway, { byChain: { Base: { usdc: 1 }, Ethereum: { usdc: 20 } }, solUsdc: 0, arcUsdc: 5 });
check("funded networks come first, the largest first, and the counts are right", sorted.rows.map((r) => r.chain).slice(0, 3).join() === "Ethereum,Arc,Base" && sorted.fundedCount === 3 && sorted.emptyCount === 1 && sorted.totalUsdc === "26.00");

check("an empty wallet and empty Gateway is $0.00 with every network empty", mergeWalletBalances(gateway, {}).totalUsdc === "0.00" && mergeWalletBalances(gateway, {}).emptyCount === 4);

const tabs = read("src/components/dashboard/WalletTabs.tsx");
check("the Balances tab reads the wallet's on-chain USDC (useBalances, plus the Arc read) and merges it with Gateway", tabs.includes("useBalances(evmAddress") && tabs.includes("mergeWalletBalances(state.chains") && tabs.includes("useArcUsdcBalance(30_000)") && tabs.includes("in Gateway"));

finish();
