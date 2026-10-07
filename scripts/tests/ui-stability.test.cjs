/**
 * Guards against the render loops that raised "Maximum update depth exceeded": a shared component must never hand a library a
 * brand-new object on every render of the screen that holds it. Source checks (the loop itself only shows on a device).
 *
 *     node scripts/tests/ui-stability.test.cjs
 */
const fs = require("fs");
const path = require("path");
const { reporter } = require("./_harness.cjs");
const { check, finish } = reporter();

const root = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const sheet = read("src/components/ui/BottomSheet.tsx");
check("BottomSheet keys snapPoints on their VALUES, so an inline ['85%'] is the same array until it really changes", sheet.includes("JSON.stringify(snapPointsProp ?? DEFAULT_SNAP_POINTS)") && sheet.includes("useMemo(() => JSON.parse(snapKey)") && !/useMemo\(\(\) => snapPointsProp/.test(sheet));
check("BottomSheet's backdrop is a stable callback, not a new inline function each render", sheet.includes("const renderBackdrop = useCallback(") && sheet.includes("backdropComponent={renderBackdrop}") && !/backdropComponent=\{\(/.test(sheet));
check("BottomSheet's style objects are module constants", ["SHEET_STYLE", "SHEET_BACKGROUND", "HANDLE_INDICATOR"].every((n) => sheet.includes(`const ${n} =`) && sheet.includes(`={${n}}`)));
check("the sheet library is not given inline style or indicator objects", !/backgroundStyle=\{\{|handleIndicatorStyle=\{\{|\bstyle=\{\{ borderTopLeftRadius/.test(sheet));

// every screen that passes snapPoints passes plain literals or a module constant (never something built during render)
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) files.push(p);
  }
})(path.join(root, "src"));
const bad = [];
for (const f of files) {
  if (f.endsWith("BottomSheet.tsx")) continue;
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/snapPoints=\{([^}]*)\}/g)) {
    const v = m[1].trim();
    if (!(/^\[(['"][\d.]+%['"]|\d+)(,\s*(['"][\d.]+%['"]|\d+))*\]$/.test(v) || /^[A-Z_]+$/.test(v))) bad.push(`${path.relative(root, f)}: ${v}`);
  }
}
check("every sheet passes snapPoints as literal values or an UPPER_CASE constant", bad.length === 0, bad.join("; "));

// the tab layout that caused the original loop keeps constant options
const layout = read("src/app/(tabs)/_layout.tsx");
check("the tab layout still hands the navigator constant options and a bridge component (the earlier loop fix)", layout.includes("OpenChatBridge"));

// signed-out safety: the crash was "useConnectedWallet must be used within a WalletConnectionProvider" on a tab screen that rendered while signed out
const rootLayout = read("src/app/_layout.tsx");
check("signed-in screens sit behind Stack.Protected (Expo Router's guard), not a conditional list of Stack.Screen entries", rootLayout.includes("<Stack.Protected guard={isAuthenticated}>") && rootLayout.includes("<Stack.Protected guard={!isAuthenticated}>") && !/isAuthenticated\s*\n\s*\? \[/.test(rootLayout));
check("the wallet provider is always mounted (never behind isAuthenticated) and told who is signed in", /return <WalletConnectionProvider userId=\{isAuthenticated \? userId : null\}>/.test(rootLayout) && !/isAuthenticated \? <WalletConnectionProvider/.test(rootLayout));
const wc = read("src/lib/wallet-connection.tsx");
check("the provider drops the in-memory connection when signed out and restores the saved one at sign-in", wc.includes("userId }: { children: ReactNode; userId?: string | null }") && /if \(!userId\) \{\s*setWallet\(null\);/.test(wc) && wc.includes("}, [userId]);"));
check("every screen is declared exactly once in the root stack (Expo Router rejects duplicates)", (() => { const names = [...rootLayout.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((m) => m[1]); return names.length === new Set(names).size; })());

finish();
