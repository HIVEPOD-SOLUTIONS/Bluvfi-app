/**
 * Converting SKR to USDC (src/lib/skr-swap.ts): reading Jupiter's quote, refusing a transaction that isn't a plain swap, simulating
 * it before signing, and the whole conversion (manual and "pay with SKR"). The fixtures are REAL Jupiter responses (a quote and an
 * unsigned swap transaction, exact-in and exact-out, for a throwaway address); nothing here signs or sends anything.
 *
 *     node scripts/tests/skr-swap.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter, ROOT } = require("./_harness.cjs");
const { check, finish } = reporter();
const web3 = require(path.join(ROOT, "node_modules", "@solana/web3.js"));
const spl = require(path.join(ROOT, "node_modules", "@solana/spl-token"));
const swap = makeLoader({})("src/lib/skr-swap.ts");

const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const QIN = fx("jupiter-quote-exact-in.json");
const QOUT = fx("jupiter-quote-exact-out.json");
const SIN = fx("jupiter-swap-exact-in.json");
const SOUT = fx("jupiter-swap-exact-out.json");
const USER = "5FHwkrdxntdK24hgQU8qgBjn35Y1zwhz1GZwCkP2UJnM"; // the address the fixtures were built for (a throwaway)
const OTHER = "DKL92bJrYVWKLsmmw8NDGjSsEc5Xc8LzJbP1JEnDVSoF".slice(0, 44);
const raises = async (fn, code) => { try { await fn(); return false; } catch (e) { return e.name === "SwapError" && (!code || e.code === code); } };
const raisesSync = (fn, code) => { try { fn(); return false; } catch (e) { return e.name === "SwapError" && (!code || e.code === code); } };

// ── reading a quote ───────────────────────────────────────────────────────────
const qin = swap.parseQuote(QIN, "ExactIn", 100_000_000);
check("quote (exact in): 100 SKR gives about 1.65 USDC, with a guaranteed minimum a little lower", qin.inMicro === 100_000_000 && qin.outMicro === 1_652_250 && qin.minOutMicro === 1_635_728 && qin.maxInMicro === 100_000_000 && qin.priceImpactPct < 0.01);
const qout = swap.parseQuote(QOUT, "ExactOut", 1_000_000);
check("quote (exact out): exactly 1 USDC costs about 60.6 SKR, with a maximum a little higher", qout.outMicro === 1_000_000 && qout.inMicro === 60_602_771 && qout.maxInMicro === 61_208_799 && qout.minOutMicro === 1_000_000);
check("quote: it is for the amount that was asked, not another", raisesSync(() => swap.parseQuote(QIN, "ExactIn", 50_000_000), "quote") && raisesSync(() => swap.parseQuote(QOUT, "ExactOut", 2_000_000), "quote"));
check("quote: the wrong mode is refused", raisesSync(() => swap.parseQuote(QIN, "ExactOut", 100_000_000), "quote"));
check("quote: other tokens are refused (SKR in, USDC out only)", raisesSync(() => swap.parseQuote({ ...QIN, outputMint: OTHER }, "ExactIn", 100_000_000), "quote") && raisesSync(() => swap.parseQuote({ ...QIN, inputMint: OTHER }, "ExactIn", 100_000_000), "quote"));
check("quote: a price that moves the market too much is refused", raisesSync(() => swap.parseQuote({ ...QIN, priceImpactPct: "2.5" }, "ExactIn", 100_000_000), "price_impact") && swap.parseQuote({ ...QIN, priceImpactPct: "1.9" }, "ExactIn", 100_000_000).priceImpactPct === 1.9);
check("quote: a minimum far below the quote (a quote hiding huge slippage) is refused", raisesSync(() => swap.parseQuote({ ...QIN, otherAmountThreshold: "800000" }, "ExactIn", 100_000_000), "quote") && raisesSync(() => swap.parseQuote({ ...QOUT, otherAmountThreshold: "90000000" }, "ExactOut", 1_000_000), "quote"));
check("quote: nonsense numbers are refused", ["abc", "-5", "1.5", "", 5, null].every((v) => raisesSync(() => swap.parseQuote({ ...QIN, outAmount: v }, "ExactIn", 100_000_000), "quote")) && raisesSync(() => swap.parseQuote(null, "ExactIn", 1), "quote") && raisesSync(() => swap.parseQuote({ ...QIN, inAmount: "0" }, "ExactIn", 0), "quote"));
check("quote: 'no route' is explained as not enough liquidity", raisesSync(() => swap.parseQuote({ errorCode: "COULD_NOT_FIND_ANY_ROUTE", error: "Could not find any route" }, "ExactIn", 1), "no_liquidity") && raisesSync(() => swap.parseQuote({ error: "boom" }, "ExactIn", 1), "quote"));
check("quote url: SKR to USDC, the amount, 1% slippage and the mode", swap.quoteUrl("ExactOut", 123) === "https://lite-api.jup.ag/swap/v1/quote?inputMint=SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=123&slippageBps=100&swapMode=ExactOut");

// ── fetching (with a fake network) ────────────────────────────────────────────
const jsonRes = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
const quoteFor = (url) => {
  const u = new URL(url);
  const amount = Number(u.searchParams.get("amount"));
  const mode = u.searchParams.get("swapMode");
  if (mode === "ExactOut") { const inA = Math.round(amount * 60.6); return { ...QOUT, outAmount: String(amount), inAmount: String(inA), otherAmountThreshold: String(Math.round(inA * 1.01)) }; }
  const outA = Math.round(amount * 0.01652); return { ...QIN, inAmount: String(amount), outAmount: String(outA), otherAmountThreshold: String(Math.round(outA * 0.99)) };
};
const makeFetch = (opts = {}) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/quote")) return opts.quote ? opts.quote(String(url)) : jsonRes(quoteFor(String(url)));
    if (String(url).includes("/swap/v1/swap")) return opts.swap ? opts.swap(init) : jsonRes(opts.mode === "ExactOut" ? SOUT : SIN);
    throw new Error("unexpected url " + url);
  };
  f.calls = calls;
  return f;
};
(async () => {
  const f1 = makeFetch();
  const q = await swap.fetchQuote("ExactIn", 5_000_000, f1);
  check("fetchQuote: asks Jupiter and returns the checked quote", f1.calls.length === 1 && f1.calls[0].url.includes("amount=5000000") && q.inMicro === 5_000_000);
  check("fetchQuote: the network failing is explained", await raises(() => swap.fetchQuote("ExactIn", 1_000_000, async () => { throw new Error("offline"); }), "quote"));
  check("fetchQuote: no amount, or a silly one, never reaches the network", await raises(() => swap.fetchQuote("ExactIn", 0, f1), "quote") && await raises(() => swap.fetchQuote("ExactIn", 1.5, f1), "quote") && f1.calls.length === 1);
  check("fetchQuote: a server error with no answer is explained", await raises(() => swap.fetchQuote("ExactIn", 1_000_000, makeFetch({ quote: () => ({ ok: false, status: 502, json: async () => { throw new Error("x"); } }) })), "quote"));

  const fs1 = makeFetch();
  const built = await swap.fetchSwapTransaction(q, USER, fs1);
  const body = JSON.parse(fs1.calls[0].init.body);
  check("fetchSwapTransaction: sends the quote back unchanged with the wallet, and returns the transaction", built.transaction === SIN.swapTransaction && body.userPublicKey === USER && body.quoteResponse.outAmount === q.raw.outAmount && body.wrapAndUnwrapSol === false);
  check("fetchSwapTransaction: a bad answer is refused", await raises(() => swap.fetchSwapTransaction(q, USER, makeFetch({ swap: () => jsonRes({ swapTransaction: "not base64!!", lastValidBlockHeight: 1 }) })), "build") && await raises(() => swap.fetchSwapTransaction(q, USER, makeFetch({ swap: () => jsonRes({ error: "x" }, false) })), "build") && await raises(() => swap.fetchSwapTransaction(q, USER, makeFetch({ swap: () => jsonRes({ swapTransaction: SIN.swapTransaction }) })), "build"));

  // ── the transaction check ───────────────────────────────────────────────────
  const accepted = (b64, user = USER) => { try { swap.checkSwapTransaction(b64, user); return true; } catch { return false; } };
  check("tx check: the REAL exact-in and exact-out transactions are accepted for their wallet", accepted(SIN.swapTransaction) && accepted(SOUT.swapTransaction));
  check("tx check: ...and refused for any other wallet (it must be paid for by the person signing)", !accepted(SIN.swapTransaction, OTHER) && raisesSync(() => swap.checkSwapTransaction(SIN.swapTransaction, OTHER), "tx_rejected"));
  check("tx check: garbage is refused", raisesSync(() => swap.checkSwapTransaction("AAAA", USER), "tx_rejected") && raisesSync(() => swap.checkSwapTransaction("", USER), "tx_rejected"));

  const user = new web3.PublicKey(USER);
  const blockhash = "11111111111111111111111111111111";
  const compile = (ixs, signers = []) => Buffer.from(new web3.VersionedTransaction(new web3.TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message()).serialize()).toString("base64");
  const jupIx = (keys = []) => new web3.TransactionInstruction({ programId: new web3.PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"), keys, data: Buffer.from([229, 1, 2, 3]) });
  const budgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
  check("tx check: a minimal budget + Jupiter transaction passes", accepted(compile([budgetIx, jupIx([{ pubkey: user, isSigner: true, isWritable: true }])])));
  check("tx check: an added SOL transfer (draining the wallet) is refused", !accepted(compile([budgetIx, web3.SystemProgram.transfer({ fromPubkey: user, toPubkey: new web3.PublicKey(OTHER), lamports: 1 }), jupIx()])));
  check("tx check: an added token transfer to someone else is refused", !accepted(compile([budgetIx, spl.createTransferInstruction(spl.getAssociatedTokenAddressSync(new web3.PublicKey(swap.SKR_MINT), user), spl.getAssociatedTokenAddressSync(new web3.PublicKey(swap.SKR_MINT), new web3.PublicKey(OTHER)), user, 1), jupIx()])));
  check("tx check: a transaction with no swap in it is refused", !accepted(compile([budgetIx])));
  const stranger = web3.Keypair.generate().publicKey;
  check("tx check: one that needs a second signature is refused", !accepted(compile([budgetIx, jupIx([{ pubkey: stranger, isSigner: true, isWritable: false }])])));
  const usdcMint = new web3.PublicKey(swap.USDC_MINT);
  const ataFor = (owner) => spl.createAssociatedTokenAccountIdempotentInstruction(user, spl.getAssociatedTokenAddressSync(usdcMint, owner), owner, usdcMint);
  check("tx check: creating the person's OWN USDC account is fine", accepted(compile([budgetIx, ataFor(user), jupIx()])));
  check("tx check: creating an account owned by someone else is refused", !accepted(compile([budgetIx, ataFor(new web3.PublicKey(OTHER)), jupIx()])));

  // ── simulating it ───────────────────────────────────────────────────────────
  const tokenData = (amount) => { const b = Buffer.alloc(165); b.writeBigUInt64LE(BigInt(amount), 64); return [b.toString("base64"), "base64"]; };
  const acct = (amount) => ({ data: Buffer.from(tokenData(amount)[0], "base64"), lamports: 2_039_280, owner: spl.TOKEN_PROGRAM_ID, executable: false });
  const before = { skrMicro: 500_000_000, usdcMicro: 0, lamports: 10_000_000 };
  const sim = (post, extra = {}) => ({
    calls: [],
    async simulateTransaction(tx, config) { this.calls.push(config); if (extra.throws) throw new Error("rpc down"); return { value: { err: extra.err ?? null, accounts: post } }; },
  });
  const goodPost = [{ data: tokenData(400_000_000), lamports: 2_039_280 }, { data: tokenData(1_652_250), lamports: 2_039_280 }, { data: ["", "base64"], lamports: 9_995_000 }];
  const txIn = swap.checkSwapTransaction(SIN.swapTransaction, USER);
  const c1 = sim(goodPost);
  const eff = await swap.verifyBySimulation(c1, txIn, USER, before, qin);
  check("simulation: a good swap reports what it will do (SKR out, USDC in)", eff.skrOutMicro === 100_000_000 && eff.usdcInMicro === 1_652_250);
  const ata = (mint) => spl.getAssociatedTokenAddressSync(new web3.PublicKey(mint), user).toBase58();
  check("simulation: it is run unsigned, on a fresh blockhash, asking for the SKR, USDC and SOL accounts in that order", c1.calls[0].sigVerify === false && c1.calls[0].replaceRecentBlockhash === true && JSON.stringify(c1.calls[0].accounts.addresses) === JSON.stringify([ata(swap.SKR_MINT), ata(swap.USDC_MINT), USER]));
  check("simulation: a swap the network says would fail is refused", await raises(() => swap.verifyBySimulation(sim(goodPost, { err: { InstructionError: [1, "Custom"] } }), txIn, USER, before, qin), "simulation"));
  check("simulation: the network being unreachable is explained", await raises(() => swap.verifyBySimulation(sim(goodPost, { throws: true }), txIn, USER, before, qin), "simulation"));
  const post = (skr, usdc, lamports) => [{ data: tokenData(skr), lamports: 1 }, { data: tokenData(usdc), lamports: 1 }, { data: ["", "base64"], lamports }];
  check("simulation: taking MORE SKR than the quote allows is refused", await raises(() => swap.verifyBySimulation(sim(post(399_000_000, 1_652_250, 9_995_000)), txIn, USER, before, qin), "tx_rejected"));
  check("simulation: paying out LESS USDC than guaranteed is refused", await raises(() => swap.verifyBySimulation(sim(post(400_000_000, 1_000_000, 9_995_000)), txIn, USER, before, qin), "tx_rejected"));
  check("simulation: spending more than a few thousandths of a SOL is refused", await raises(() => swap.verifyBySimulation(sim(post(400_000_000, 1_652_250, 4_000_000)), txIn, USER, before, qin), "tx_rejected"));
  check("simulation: taking no SKR at all (nothing to pay for the USDC) is refused", await raises(() => swap.verifyBySimulation(sim(post(500_000_000, 1_652_250, 9_995_000)), txIn, USER, before, qin), "tx_rejected"));
  check("simulation: a new USDC account (rent ~0.002 SOL) is within the SOL allowance", (await swap.verifyBySimulation(sim(post(400_000_000, 1_652_250, 7_950_000)), txIn, USER, before, qin)).usdcInMicro === 1_652_250);

  // ── the whole conversion ────────────────────────────────────────────────────
  const world = (o = {}) => {
    const log = { stages: [], signed: [], confirmed: [] };
    const connection = {
      async getMultipleAccountsInfo() { return [acct(o.skr ?? 500_000_000), o.noUsdcAccount ? null : acct(0), { lamports: o.lamports ?? 10_000_000, data: Buffer.alloc(0) }]; },
      async simulateTransaction(tx, cfg) { return { value: { err: null, accounts: o.post ?? goodPost } }; },
      async confirmTransaction(args, c) { log.confirmed.push(args); if (o.confirmThrows) throw new Error("timeout"); return { value: { err: o.confirmErr ?? null } }; },
    };
    const provider = { async request(req) { if (o.declines) throw new Error("User declined"); log.signed.push(req); return { signature: o.noSignature ? undefined : "5SIGNATURE1234567890" }; } };
    return { log, connection, provider };
  };
  const run = (w, extra = {}) => swap.convertSkr({ user: USER, mode: "ExactIn", amountMicro: 100_000_000, provider: w.provider, connection: w.connection, fetchImpl: makeFetch(extra.fetch), onStage: (s) => w.log.stages.push(s), ...extra.opts });
  let w = world();
  const done = await run(w);
  check("convert: goes quote, prepare, check, sign, confirm, in that order", w.log.stages.join() === "quote,prepare,check,sign,confirm");
  check("convert: hands the wallet exactly one v0 transaction to sign and send", w.log.signed.length === 1 && w.log.signed[0].method === "signAndSendTransaction" && w.log.signed[0].params.transaction.version === 0);
  check("convert: waits for confirmation using the transaction's own blockhash and the block height Jupiter gave", w.log.confirmed.length === 1 && w.log.confirmed[0].signature === "5SIGNATURE1234567890" && w.log.confirmed[0].lastValidBlockHeight === SIN.lastValidBlockHeight && typeof w.log.confirmed[0].blockhash === "string");
  check("convert: reports the signature and what moved (as simulated)", done.signature === "5SIGNATURE1234567890" && done.skrOutMicro === 100_000_000 && done.usdcInMicro === 1_652_250);

  const fxBal = makeFetch(); w = world({ skr: 10_000_000 });
  check("convert: not enough SKR is refused BEFORE a swap is even built or anything is signed", await raises(() => swap.convertSkr({ user: USER, mode: "ExactIn", amountMicro: 100_000_000, provider: w.provider, connection: w.connection, fetchImpl: fxBal }), "balance") && w.log.signed.length === 0 && !fxBal.calls.some((c) => c.url.includes("/swap/v1/swap")));
  w = world({ lamports: 1_000_000 });
  check("convert: too little SOL for the fee is explained, nothing signed", await raises(() => run(w), "fees") && w.log.signed.length === 0);
  w = world();
  check("convert: a conversion above the limit is refused, nothing signed", await raises(() => run(w, { fetch: { quote: (u) => jsonRes({ ...quoteFor(u), outAmount: "2000000000", otherAmountThreshold: "1980000000" }) } }), "limit") && w.log.signed.length === 0);
  w = world();
  check("convert: a transaction that sends SOL to someone is refused, nothing signed", await raises(() => run(w, { fetch: { swap: () => jsonRes({ swapTransaction: compile([budgetIx, web3.SystemProgram.transfer({ fromPubkey: user, toPubkey: new web3.PublicKey(OTHER), lamports: 5 }), jupIx()]), lastValidBlockHeight: 1 }) } }), "tx_rejected") && w.log.signed.length === 0);
  w = world({ post: post(400_000_000, 100, 9_995_000) });
  check("convert: a transaction that would pay out far less than quoted is refused, nothing signed", await raises(() => run(w), "tx_rejected") && w.log.signed.length === 0);
  w = world({ declines: true });
  check("convert: declining in the wallet stops it with the wallet's own message, nothing confirmed", await (async () => { try { await run(w); return false; } catch (e) { return /declined/.test(e.message); } })() && w.log.confirmed.length === 0);
  w = world({ noSignature: true });
  check("convert: a wallet that returns no signature is an error", await raises(() => run(w), "send"));
  w = world({ confirmErr: { InstructionError: [0, "x"] } });
  check("convert: a transaction that fails on the network is reported as not done", await raises(() => run(w), "confirm"));
  w = world({ confirmThrows: true });
  check("convert: not being able to confirm yet tells them to check the wallet before retrying, with the signature", await (async () => { try { await run(w); return false; } catch (e) { return e.code === "confirm" && /5SIGNATU/.test(e.message) && /Check your wallet/.test(e.message); } })());
  w = world();
  check("convert: the swap service failing stops it before signing", await raises(() => run(w, { fetch: { swap: () => jsonRes({}, false) } }), "build") && w.log.signed.length === 0);

  // ── paying with SKR: convert only what the payment is short by ──────────────
  check("shortfall: how much USDC a payment is short by", swap.usdcShortfall(5_000_000n, 12_000_000n) === 7_000_000 && swap.usdcShortfall(12_000_000, 12_000_000) === 0 && swap.usdcShortfall(20_000_000, 12_000_000) === 0 && swap.usdcShortfall(0n, 3_500_000n) === 3_500_000);
  // what the simulation shows for this exact-out swap: 2.51 USDC in for about 152.1 SKR out
  w = world({ post: post(347_894_000, 2_510_000, 9_995_000) }); const ffetch = makeFetch({ mode: "ExactOut" });
  const top = await swap.topUpUsdcFromSkr({ user: USER, shortfallMicro: 2_500_000, provider: w.provider, connection: w.connection, fetchImpl: ffetch });
  const qurl = new URL(ffetch.calls[0].url);
  check("pay with SKR: asks for exactly the shortfall plus a cent of cushion, as an exact USDC amount", qurl.searchParams.get("swapMode") === "ExactOut" && qurl.searchParams.get("amount") === "2510000" && top.signature === "5SIGNATURE1234567890");
  w = world({ skr: 1_000_000 });
  check("pay with SKR: when SKR can't cover the gap, it says so in terms of the payment, and signs nothing", await (async () => { try { await swap.topUpUsdcFromSkr({ user: USER, shortfallMicro: 2_500_000, provider: w.provider, connection: w.connection, fetchImpl: makeFetch({ mode: "ExactOut" }) }); return false; } catch (e) { return e.code === "balance" && /enough USDC, and not enough SKR/.test(e.message) && w.log.signed.length === 0; } })());
  check("pay with SKR: nothing to convert is an error, not a swap", await raises(() => swap.topUpUsdcFromSkr({ user: USER, shortfallMicro: 0, provider: w.provider, connection: w.connection }), "quote"));

  // ── asking the wallet to keep more SOL when another transaction follows ─────
  w = world({ lamports: 4_000_000 });
  check("convert: a wallet with 0.004 SOL passes the normal check", await (async () => { try { await run(w); return true; } catch { return false; } })());
  w = world({ lamports: 4_000_000 });
  check("convert: ...but is refused when a second transaction (the send to Bluvfi) needs more, before anything is signed", await raises(() => run(w, { opts: { minSolLamports: 6_000_000 } }), "fees") && w.log.signed.length === 0);
  w = world({ lamports: 4_000_000 });
  check("convert: the SOL needed is explained in the message", await (async () => { try { await run(w, { opts: { minSolLamports: 6_000_000 } }); return false; } catch (e) { return /0\.006/.test(e.message) && /fees/.test(e.message); } })());

  // ── the shared "cover a USDC payment with SKR" step the senders call ────────
  w = world({ post: post(347_894_000, 2_510_000, 9_995_000) }); const nf = makeFetch({ mode: "ExactOut" });
  const off = await swap.coverUsdcWithSkr({ enabled: false, user: USER, balanceMicro: 0n, requiredMicro: 5_000_000n, provider: w.provider, connection: w.connection, fetchImpl: nf });
  check("cover: with the setting OFF it does nothing at all (no network, nothing signed), even when short", off === null && nf.calls.length === 0 && w.log.signed.length === 0);
  const enough = await swap.coverUsdcWithSkr({ enabled: true, user: USER, balanceMicro: 5_000_000n, requiredMicro: 5_000_000n, provider: w.provider, connection: w.connection, fetchImpl: nf });
  check("cover: with enough USDC it does nothing, even with the setting on (no needless conversion)", enough === null && nf.calls.length === 0 && w.log.signed.length === 0);
  const covered = await swap.coverUsdcWithSkr({ enabled: true, user: USER, balanceMicro: 10_000_000n - 2_500_000n, requiredMicro: 10_000_000n, provider: w.provider, connection: w.connection, fetchImpl: nf });
  check("cover: short by $2.50 with the setting on converts exactly that (plus a cent), once", covered && covered.signature && nf.calls.filter((c) => c.url.includes("/quote")).length === 1 && new URL(nf.calls[0].url).searchParams.get("amount") === "2510000" && w.log.signed.length === 1);

  // ── typing and reading amounts ──────────────────────────────────────────────
  check("amount: '12.5' is 12.5 SKR; whole numbers and six decimals work", swap.parseSkrAmount("12.5") === 12_500_000 && swap.parseSkrAmount("3") === 3_000_000 && swap.parseSkrAmount("0.000001") === 1 && swap.parseSkrAmount("100.") === 100_000_000 && swap.parseSkrAmount(" 7 ") === 7_000_000);
  check("amount: nothing, zero, negatives, seven decimals, letters or two dots are refused", ["", "0", "0.0", "-1", "1.1234567", "abc", "1..2", "1.2.3", ".5", "1e5"].every((t) => swap.parseSkrAmount(t) === null));
  check("amount: absurdly large numbers are refused rather than losing precision", swap.parseSkrAmount("99999999999999999999") === null);
  check("amount: putting a balance back in the box drops trailing zeros", swap.skrText(12_500_000) === "12.5" && swap.skrText(3_000_000) === "3" && swap.skrText(1) === "0.000001" && swap.skrText(0) === "0");
  check("amount: SKR and USDC read nicely, and USDC is never rounded UP", swap.formatSkr(1_234_560_000) === "1,234.56" && swap.formatUsdc(1_652_250) === "$1.65" && swap.formatUsdc(1_659_999) === "$1.65" && swap.formatUsdc(0) === "$0.00" && swap.formatUsdc(1_234_560_000) === "$1,234.56");
  check("amount: the quoted price per SKR", Math.abs(swap.quotedPrice(qin) - 0.0165225) < 1e-9);

  finish();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
