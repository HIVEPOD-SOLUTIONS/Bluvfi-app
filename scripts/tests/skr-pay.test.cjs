/**
 * "Use my SKR when I'm short on USDC" (src/lib/skr-pay.ts): off by default, remembered, never on by accident, and the announcement a
 * payment makes after converting. Plus checks that both payment senders, the root layout and the Shar screen are wired to it.
 *
 *     node scripts/tests/skr-pay.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { makeLoader, reporter } = require("./_harness.cjs");
const { check, finish } = reporter();
const read = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");

const store = new Map();
let failReads = false;
let failWrites = false;
const stubs = {
  react: { useSyncExternalStore: (subscribe, get) => get() },
  "expo-secure-store": {
    getItemAsync: async (k) => { if (failReads) throw new Error("keystore locked"); return store.has(k) ? store.get(k) : null; },
    setItemAsync: async (k, v) => { if (failWrites) throw new Error("full"); store.set(k, v); },
    deleteItemAsync: async (k) => { if (failWrites) throw new Error("full"); store.delete(k); },
  },
};
const fresh = () => makeLoader(stubs)("src/lib/skr-pay.ts");

(async () => {
  let pay = fresh();
  check("off by default (a payment never converts anything until the person turns it on)", pay.skrPayEnabled() === false);
  await pay.loadSkrPay();
  check("loading with nothing saved leaves it off", pay.skrPayEnabled() === false);

  await pay.setSkrPay(true);
  check("turning it on takes effect straight away and is saved", pay.skrPayEnabled() === true && [...store.values()].includes("1"));
  pay = fresh();
  check("...and a fresh start is off until the saved choice is read", pay.skrPayEnabled() === false);
  await pay.loadSkrPay();
  check("...then the saved choice is on", pay.skrPayEnabled() === true);

  await pay.setSkrPay(false);
  check("turning it off takes effect straight away and removes the saved choice", pay.skrPayEnabled() === false && store.size === 0);
  pay = fresh(); await pay.loadSkrPay();
  check("...and stays off after a restart", pay.skrPayEnabled() === false);

  store.set("bluvfi_pay_with_skr", "1");
  failReads = true; pay = fresh(); await pay.loadSkrPay();
  check("an unreadable setting means OFF, never on", pay.skrPayEnabled() === false);
  failReads = false;
  store.set("bluvfi_pay_with_skr", "true"); pay = fresh(); await pay.loadSkrPay();
  check("anything other than the saved '1' means off", pay.skrPayEnabled() === false);

  failWrites = true; pay = fresh();
  await pay.setSkrPay(true);
  check("if saving fails the choice still applies for now (and nothing crashes)", pay.skrPayEnabled() === true);
  failWrites = false;

  // announcements
  pay = fresh();
  const heard = [];
  const off = pay.onAutoConversion((c) => heard.push(c));
  pay.announceAutoConversion({ signature: "sig1", skrOutMicro: 152_106_000, usdcInMicro: 2_510_000 });
  off();
  pay.announceAutoConversion({ signature: "sig2", skrOutMicro: 1, usdcInMicro: 1 });
  check("a conversion is announced to whoever is listening, and not after they stop", heard.length === 1 && heard[0].signature === "sig1");
  check("announcing with nobody listening is harmless", (() => { pay.announceAutoConversion({ signature: "x", skrOutMicro: 1, usdcInMicro: 1 }); return true; })());
  const d = pay.describeConversion({ skrOutMicro: 152_106_000, usdcInMicro: 2_510_000 });
  check("the message says how much SKR became how much USDC, and where to turn it off", d.title === "Converted 152.11 SKR to $2.51" && /turn this off on the Shar screen/.test(d.subtitle));
  check("the message never rounds the USDC up", pay.describeConversion({ skrOutMicro: 1_000_000, usdcInMicro: 1_659_999 }).title === "Converted 1 SKR to $1.65");

  // wiring
  const solana = read("src/lib/payments/solana.ts");
  const wallet = read("src/lib/payments/wallet-send.ts");
  check("bills, off-ramp and gift cards: the USDC sender converts only when the setting is on AND the wallet is short", solana.includes("skrPayEnabled()") && solana.includes("coverUsdcWithSkr") && solana.includes("(senderAccount?.amount ?? 0n) < requiredMicro"));
  check("the wallet sender (credits, gift cards via wallet) does the same, only for USDC, and takes a fresh blockhash afterwards", wallet.includes("rail.mint === SOLANA_MINTS.USDC && opts.autoSkr !== false && skrPayEnabled()") && wallet.includes("coverUsdcWithSkr") && wallet.includes("The conversion took a few seconds"));
  check("a failed conversion stops the payment with a clear message (nothing is paid)", solana.includes("Couldn’t convert your SKR to cover this payment") && wallet.includes("Couldn’t convert your SKR to cover this payment"));
  const layout = read("src/app/_layout.tsx");
  check("the app reads the saved setting at start and shows a message after an automatic conversion", layout.includes("loadSkrPay()") && layout.includes("onAutoConversion") && layout.includes("describeConversion"));
  const shar = read("src/app/(tabs)/shar.tsx");
  const card = read("src/components/shar/SpendSkrCard.tsx");
  check("the Shar screen shows the SKR card, and owns the Convert sheet at screen level (a sheet inside a card is clipped)", shar.includes("<SpendSkrCard onConvert") && shar.includes("<ConvertSkrSheet open={convertOpen}") && !card.includes("ConvertSkrSheet")); check("the SKR card has the convert button and the off-by-default switch", true && card.includes("Convert to USDC") && card.includes("useSkrPay") && card.includes("Off by default"));
  const sheet = read("src/components/shar/ConvertSkrSheet.tsx");
  check("the convert sheet shows the guaranteed minimum before anything is signed, and the wallet it uses", sheet.includes("At least") && sheet.includes("src.label") && sheet.includes("convertSkr("));

  finish();
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
