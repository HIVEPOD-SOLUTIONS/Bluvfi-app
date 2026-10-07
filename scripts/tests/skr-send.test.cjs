/**
 * "Convert and send to my Bluvfi wallet" (src/lib/skr-send.ts): after the connected (Seeker) wallet has converted SKR to USDC, the
 * USDC is sent on to the Bluvfi wallet. How much is sent, what happens when the second step fails, and that the screens use it.
 *
 *     node scripts/tests/skr-send.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");
const send = makeLoader({})("src/lib/skr-send.ts");

// ── how much to send ──────────────────────────────────────────────────────────
check("amount: sends what the conversion produced when the wallet holds at least that", send.amountToSend(1_652_250, 5_000_000) === 1_652_250 && send.amountToSend(1_652_250, 1_652_250) === 1_652_250);
check("amount: never sends USDC that was already in the wallet (only what was converted)", send.amountToSend(1_000_000, 50_000_000) === 1_000_000);
check("amount: if the wallet holds a hair less than expected (price moved), sends what is there", send.amountToSend(1_652_250, 1_650_000) === 1_650_000);
check("amount: if the balance couldn't be read, trusts the conversion's own figure", send.amountToSend(1_652_250, null) === 1_652_250);
check("amount: nothing, dust (under a cent), or nonsense is not sent", send.amountToSend(0, 5_000_000) === 0 && send.amountToSend(9_999, null) === 0 && send.amountToSend(10_000, null) === 10_000 && send.amountToSend(1_000_000, 0) === 0 && send.amountToSend(NaN, null) === 0 && send.amountToSend(1.5, null) === 0);
check("decimal: exact USDC text for the wallet sender, never rounded up", send.usdcDecimal(1_652_250) === "1.652250" && send.usdcDecimal(10_000) === "0.010000" && send.usdcDecimal(1_000_000) === "1.000000" && send.usdcDecimal(123_456_789) === "123.456789" && send.usdcDecimal(1) === "0.000001");

// ── sending it on ─────────────────────────────────────────────────────────────
(async () => {
  const sentLog = [];
  const ok = async (amount) => { sentLog.push(amount); return "SIG123"; };
  let r = await send.sendConvertedUsdc({ convertedMicro: 1_652_250, readBalance: async () => 1_652_250, send: ok });
  check("sent: success returns the signature and the amount that went", r.status === "sent" && r.signature === "SIG123" && r.amountMicro === 1_652_250 && sentLog.join() === "1.652250");
  sentLog.length = 0;
  r = await send.sendConvertedUsdc({ convertedMicro: 1_652_250, readBalance: async () => 40_000_000, send: ok });
  check("sent: only the converted amount goes, even when the wallet holds much more", r.status === "sent" && sentLog.join() === "1.652250");
  sentLog.length = 0;
  r = await send.sendConvertedUsdc({ convertedMicro: 1_652_250, readBalance: async () => 1_600_000, send: ok });
  check("sent: a slightly lower balance sends what is actually there", r.status === "sent" && r.amountMicro === 1_600_000 && sentLog.join() === "1.600000");
  sentLog.length = 0;
  r = await send.sendConvertedUsdc({ convertedMicro: 1_652_250, readBalance: async () => { throw new Error("rpc down"); }, send: ok });
  check("sent: an unreadable balance doesn't stop it (the conversion's figure is used)", r.status === "sent" && sentLog.join() === "1.652250");
  sentLog.length = 0;
  r = await send.sendConvertedUsdc({ convertedMicro: 5_000, readBalance: async () => 5_000, send: ok });
  check("too small: dust is not sent, and nothing is signed", r.status === "too_small" && sentLog.length === 0);

  r = await send.sendConvertedUsdc({ convertedMicro: 1_652_250, readBalance: async () => 1_652_250, send: async () => { throw new Error("User declined the request"); } });
  check("declined: reported, not thrown (the conversion already happened), with the amount for a retry", r.status === "failed" && /declined/.test(r.error) && r.amountMicro === 1_652_250);
  r = await send.sendConvertedUsdc({ convertedMicro: 1_652_250, readBalance: async () => 1_652_250, send: async () => { throw "weird"; } });
  check("failed: even a non-Error rejection is reported calmly", r.status === "failed" && r.error.length > 5);
  sentLog.length = 0;
  const retry = await send.sendConvertedUsdc({ convertedMicro: r.amountMicro, readBalance: async () => 1_652_250, send: ok });
  check("retry: sending again after a failure works and sends the same amount", retry.status === "sent" && sentLog.join() === "1.652250");

  check("reserve: the converting wallet keeps SOL for the second transaction too", send.SEND_SOL_RESERVE_LAMPORTS >= 2_000_000 && send.MIN_SEND_MICRO === 10_000);

  // ── the screens and senders use it ────────────────────────────────────────
  const sheet = read("src/components/shar/ConvertSkrSheet.tsx");
  check("the Convert sheet offers it only when the connected wallet is the one converting and a Bluvfi wallet exists", sheet.includes("const canSendOn = src.usingWallet && !!solanaAddress") && sheet.includes("Then send the USDC to my Bluvfi wallet"));
  check("it is on by default, and the button says what it will do", sheet.includes("useState(true)") && sheet.includes("Convert and send to Bluvfi wallet"));
  check("the transfer goes to the Bluvfi wallet's own address, from the converting wallet, as USDC on Solana, with automatic SKR conversion switched OFF", sheet.includes("to: solanaAddress") && sheet.includes("walletRailFor('USDC', 'Solana')") && sheet.includes("autoSkr: false") && sheet.includes("address: src.address!"));
  check("the converting wallet must keep extra SOL when a transfer follows", sheet.includes("minSolLamports: sendAfter ? SWAP.minSolLamports + SEND_SOL_RESERVE_LAMPORTS : undefined"));
  check("a failed second step says the USDC is safe and offers a retry; the Done button waits while sending", sheet.includes("The USDC is safe in") && sheet.includes("Try sending it again") && sheet.includes("disabled={sending}"));
  check("the amount sent is read from the wallet after converting, not assumed", sheet.includes("readSnapshot(connection, src.address!)"));
  const wallet = read("src/lib/payments/wallet-send.ts");
  check("the wallet sender can have its automatic SKR top-up switched off (a transfer of just-converted USDC must never start another conversion)", wallet.includes("autoSkr?: boolean") && wallet.includes("opts.autoSkr !== false && skrPayEnabled()"));

  finish();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
