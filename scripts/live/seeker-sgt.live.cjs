/**
 * Live check of the Seeker Genesis Token logic (src/lib/seeker.ts) against Solana mainnet: the real SGT group mint must NOT count
 * as an SGT (it isn't a member of itself), and a lookup on a real wallet with no SGT returns null without errors.
 * Read-only. Needs internet.
 *
 *     node scripts/live/seeker-sgt.live.cjs
 */
const { makeLoader, reporter } = require("../tests/_harness.cjs");
const { check, finish } = reporter();

const SGT_GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
process.env.EXPO_PUBLIC_SOLANA_RPC_URL = RPC;

const seeker = makeLoader({
  "react-native": { Platform: { OS: "android", constants: {} } },
  "@tanstack/react-query": { useQuery: () => ({}) },
  "@/lib/api": { API_BASE_URL: "http://unused.test" },
})("src/lib/seeker.ts");

(async () => {
  const group = await seeker.rpc("getAccountInfo", [SGT_GROUP, { encoding: "jsonParsed" }]);
  const extensions = group.value?.data?.parsed?.info?.extensions;
  check("the real SGT group mint is not itself counted as an SGT", Array.isArray(extensions) && seeker.isSgtMint(extensions) === false);
  const none = await seeker.findSeekerGenesisToken("GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4");
  check("a real wallet with no Seeker Genesis Token gives null (and no error)", none === null);
  finish();
})().catch((e) => {
  console.error(`LIVE CHECK FAILED: ${e.message}`);
  process.exit(1);
});
