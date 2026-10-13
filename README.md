# Bluvfi: AI finance assistant and rewards, built for Solana Mobile

Bluvfi is an Android app (Expo / React Native) that lets people pay bills, buy gift cards and top-ups, invest, track crypto and talk to an AI
assistant that does it for them, all from one wallet. This repository is the **native Android app**, our entry in the
**Clock In: a Solana Mobile Hackathon** (Mobile category). Its package id is `com.bluvfi.xyz`.

It is built around the Solana Mobile stack: sign in and pay with **Mobile Wallet Adapter** (Seed Vault on a Seeker, Phantom, Solflare, Backpack...),
recognise **Seeker** owners and their **.skr** names, and an **SKR** reward loop called **Shar**.

## Submission

| | |
|---|---|
| Android APK | [Bluvfi 6.0.5 (release APK, Android 7.0+, 64-bit ARM)](https://github.com/HIVEPOD-SOLUTIONS/Bluvfi-app/releases/latest) · SHA-256 `b904a0efd7494153ad9f860bd010a7b30519c6bc253807785072b36317eb0525` |
| Demo video (about 3 min, recorded on a device) | [Watch on YouTube](https://youtu.be/TWpAETEkfTU) |
| Pitch deck | [Bluvfi pitch deck (PDF)](https://drive.google.com/file/d/1m4fNW_BBBo1iRTgWuTErJVLkCCR6YlCg/view?usp=sharing) |

## What's new for the hackathon

Bluvfi already existed as a web product (a Next.js site and API, in a separate private repository). **Everything in this repository is new
mobile development**: a ground-up native Expo app (first commit 2 Oct 2026), not a wrapper around the website. Backend additions that the app
needs were made in the same period and are listed under "Backend".

- **Mobile Wallet Adapter**: connect any MWA wallet; sign in with a wallet; pay Solana purchases from the connected wallet; deposit to the Bluvfi
  wallet from it (`src/lib/mwa.ts`, `src/lib/wallet-connection.tsx`, `src/components/wallet/`).
- **Seeker features**: Seeker Genesis Token check, `.skr` name lookup, Seed Vault sign-in (`src/lib/seeker.ts`, `src/lib/skr.ts`).
- **SKR and Shar rewards**: users earn **Shar** (1 per $1 spent on purchases of $10 or more, plus referrals and provider use), climb ranks
  (Spark, Wisp, Guide, Seeker) and a weekly leaderboard, and **claim Shar as SKR** (1 Shar = 0.9 SKR). SKR can be **converted to USDC in the user's own
  wallet** (Jupiter), used automatically when a payment is short on USDC, or sent on to the Bluvfi wallet
  (`src/components/shar/`, `src/lib/skr-*.ts`).
- **Open provider network**: anyone can sign up as a creator, add a service or protocol with its own input form, setup steps, credentials and terms,
  and earn 80% of what people pay per call, withdrawn as SKR. When the creator is a Seeker, an approved provider can be promoted into Bluvfi’s official Bills, Invest or Banking provider list for its use case. Outside AI agents can pay over x402 (`src/app/(tabs)/network.tsx`, `src/app/creator.tsx`,
  `src/app/provider/`).
- **AI assistant in the app**: a chat that finds products, buys them, answers questions about Shar and the network, and links into screens. It only gets
  the tools the app has screens for.
- **Mobile-first details**: voice input, bottom sheets, Help & FAQ, an Activity feed, rewarded ads that unlock more chat messages, Premium via RevenueCat.

## What the app does

- **Home**: Bills (gift cards, mobile top-ups and eSIMs from Bitrefill and Cryptorefills), Invest (US stocks and ETFs on Backpack, private markets on
  GetEquity, GPU compute on Nosana, domains on Doma), History, and a live price strip. Banking shows "Coming soon" in the app.
- **Crypto**: searchable live prices with charts.
- **AI Chat**: ask for anything above in plain language; payments always show a confirmation card.
- **Wallets**: a Bluvfi wallet (EVM and Solana, created at sign-up through Privy) and any external Solana wallet through MWA, with a "Pay from" choice.
- **Shar and Network**: rewards, referrals, leaderboard, claims, credits, provider listings, commission.

## Tech

Expo SDK 57, React Native 0.86, React 19, TypeScript, Expo Router, TanStack Query, `@gorhom/bottom-sheet`, Privy (`@privy-io/expo`) for sign-in and embedded wallets,
`@solana-mobile/mobile-wallet-adapter-protocol(-web3js)`, `@solana/web3.js`, the Vercel AI SDK for chat, RevenueCat and AdMob.

## Backend

The app is a thin client. Prices, payments, the AI, Shar, the provider network and payouts run on the Bluvfi backend (a Next.js API on AWS Amplify with a
Postgres database), which is a **separate repository**. By default the app talks to production (`https://www.bluvfi.xyz`). To point it somewhere else,
set `EXPO_PUBLIC_API_BASE_URL` (see below); from an Android emulator, your machine is `http://10.0.2.2:<port>`.

## Run it

Requirements: Node 22 (what we build with), JDK 17, Android Studio with an SDK platform and an emulator or a phone with USB debugging. Windows works; see the note on
memory below.

```bash
git clone <this repository> && cd Bluvfi-app
npm install
cp .env.example .env          # public client configuration, see "Configuration"
npx expo run:android          # generates android/, builds a development client, installs it and starts Metro
```

Later runs only need `npx expo start --dev-client` with the development client already installed. A development build is required (Expo Go does not
include the native wallet and ads modules).

On a machine with limited memory the native build can run out of RAM; `plugins/with-limited-cpp-parallelism.js` already caps concurrent C++ compiles for that.

**Use JDK 17 for Gradle.** With JDK 24 or newer (Android Studio's bundled JDK 25, for example) the Android Gradle Plugin fails the `react-native-worklets`
CMake step ("A restricted method in java.lang.System has been called"). In Android Studio set Settings, Build Tools, Gradle, **Gradle JDK** to a JDK 17. If sync
still fails, check that `android/gradle/gradle-daemon-jvm.properties` says `toolchainVersion=17` (Studio can regenerate it with 25) and sync again.

### Build a release APK

The release build is signed with your own keystore. A guard in the build refuses to produce a release APK signed with the debug key, so one can never be shipped by
accident: it lets a build through when the keystore settings below are present, when Android Studio's Generate Signed APK wizard supplies a keystore, or when you
pass `-PALLOW_DEBUG_SIGNED_RELEASE=true` for a throwaway test build. Debug builds (`npx expo run:android`) are unaffected.
On Windows, `powershell -ExecutionPolicy Bypass -File scripts\setup-release-signing.ps1` does this for you: it copies the keystore outside the repo, asks for the
alias and passwords (masked), checks them with `keytool`, and writes them to your user-level `~/.gradle/gradle.properties`. Or put these there yourself
(never in the repo):

```properties
BLUVFI_STORE_FILE=C:/path/to/your-release.keystore
BLUVFI_STORE_PASSWORD=...
BLUVFI_KEY_ALIAS=...
BLUVFI_KEY_PASSWORD=...
```

Then:

```bash
npx expo prebuild --platform android      # applies plugins/with-release-signing.js
cd android && ./gradlew assembleRelease   # APK: android/app/build/outputs/apk/release/app-release.apk
```

Create a keystore once with `keytool -genkeypair -v -storetype PKCS12 -keystore your-release.keystore -alias bluvfi -keyalg RSA -keysize 2048 -validity 10000` and keep
it safe: the Solana dApp Store needs the same key for every update.

## Configuration

Copy `.env.example` to `.env`. Every value is a public, client-side identifier that ships inside the APK (Privy app and client ids, the RevenueCat Android
SDK key, an Alchemy key for EVM balances, the API base URL). Server-side secrets live only in the backend. Without `EXPO_PUBLIC_ALCHEMY_API_KEY`, EVM
balances stay empty and the rest of the app still runs.

## Tests

```bash
npm test      # every suite, one line each
npx tsc --noEmit
```

Plain Node tests run the real TypeScript in `src/` with the native modules stubbed, so the logic (rewards, referrals, SKR swap and send, provider setup,
Seeker and wallet handling, agent wording against the screens) is checked without a device. See `scripts/tests/README.md`. Screens are checked on an
emulator. `scripts/live/` has read-only checks against Solana mainnet (Seeker token, `.skr` names).

## Where things are

```
src/app/          screens (Expo Router): (tabs)/ home, crypto, chat, profile, shar, network; provider/, creator, faq, activity, login
src/components/   shar/ (rewards, claims, SKR convert, provider form), chat/, dashboard/, invest/, wallet/, ui/
src/lib/          mwa.ts and wallet-connection.tsx (MWA), seeker.ts and skr*.ts (Seeker, SKR), payments/, auth-context.tsx (Privy), api.ts
src/hooks/        data hooks (use-shar.ts, balances, history, prices)
plugins/          Expo config plugins (release signing, native build limits)
scripts/tests/    logic tests;  scripts/live/ mainnet read-only checks
```

## Tested on

Automated: the test suites above. Emulator: Android API 37 (Pixel), including Mobile Wallet Adapter connect and sign with Solana Mobile's reference fake wallet.
Real-device testing: _to be filled in before submission._

## Status and honest limits

- SKR claims and commission withdrawals are **requests the Bluvfi team reviews and sends**; they are not instant, and the app says so.
- In the app, Banking is "Coming soon"; stocks are traded through Backpack, and buying xStocks or gold is not in the app.
- The provider terms in the app are a plain-language summary, and have not had a legal review.

## License

Source available, all rights reserved. Anyone may view, build and run this code to evaluate it (judges and reviewers included); nothing else is granted without written
permission. See `LICENSE`. Third-party packages keep their own licences.
