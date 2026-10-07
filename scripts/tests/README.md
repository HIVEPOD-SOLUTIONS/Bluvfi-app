# Tests

Plain Node scripts that run the **real TypeScript in `src/`** with the React Native and Expo native pieces replaced by stubs, so
the app's logic is tested without an emulator, a device, the network or anything to install.

```bash
npm test                       # every suite, one summary line each; exits non-zero if anything fails
npm test -- referral shar      # only suites whose file name contains one of these words
node scripts/tests/referral.test.cjs   # one suite on its own
```

| Suite | What it proves |
| --- | --- |
| `referral` | Reading a code from typed/pasted text or a link, keeping it until there is an account, and what happens to it after the server answers |
| `device-and-api` | The phone id (Android ID preferred, random fallback, never blocks a request) and the API client (headers, errors, 204) |
| `shar-hooks` | Money formatting (`$0.10`) and the exact request every Shar / network / credits / admin hook makes |
| `provider-example` | The example-request rules, mirroring the server's |
| `seeker-and-wallet` | Seeker Genesis Token check, `.skr` name lookup and account derivation, wallet signature handling and error wording |
| `rpc-proxy-client` | The app's RPC client against the **web repo's real proxy route** (needs `../bluvfi`, or `WEB_REPO`; skips without it) |

`_harness.cjs` gives you `makeLoader(stubs)` and `reporter()`. Any import that isn't a source file, `buffer`, `@solana/web3.js`
or `node:crypto` must be stubbed, so a test can never silently run a real native module. Screens (`.tsx`) are not unit tested here:
they are checked on the emulator, with the test backend in the web repo (`scripts/e2e/`).

`scripts/live/` has read-only checks against the real Solana mainnet (Seeker token, `.skr` names). They need internet, so they
are not part of `npm test`.
