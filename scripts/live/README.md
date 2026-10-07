# Live checks

These talk to the **real Solana mainnet** (read-only: they only fetch public accounts). They need internet and can be
rate-limited, so they are **not** part of `npm test`. Run them by hand when you change the Seeker or `.skr` code, or when you
want proof it still works against the real chain.

```bash
node scripts/live/seeker-sgt.live.cjs     # the Seeker Genesis Token check against the real SGT group
node scripts/live/skr-names.live.cjs      # finds real .skr owners and round-trips their names
```

Both use the public mainnet RPC. Set `SOLANA_RPC_URL` to use your own (the `.skr` lookup uses `getProgramAccounts`, which
many free plans refuse).
