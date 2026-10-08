/**
 * Product logos for the Bills catalogs, resolved the same way as the website's Bills screen (bluvfi/src/components/dashboard/bills-screen.tsx):
 *   1. a Bitrefill-branded product gets the official Bitrefill logo;
 *   2. the logo the catalog API sent (logo_url);
 *   3. a Google favicon for brands we know the website of;
 *   4. nothing, and the caller shows an emoji instead.
 */
export const BITREFILL_OFFICIAL_LOGO =
  'https://files.readme.io/4d0d667c7bc96cf97cd030670700d5a4163c361f3ed8a83dec0b6b1ce5cc5076-iOS_app_icon_1024.png';

/** Served by the Bluvfi website (public/cryptorefills-logo.png). */
export const CRYPTOREFILLS_LOGO = 'https://www.bluvfi.xyz/cryptorefills-logo.png';

/** Brand name fragments (lower case) mapped to their website, for the favicon lookup. Order matters: the first fragment found wins. */
export const BRAND_DOMAIN: Readonly<Record<string, string>> = {
  // streaming and entertainment
  netflix: 'netflix.com', spotify: 'spotify.com', apple: 'apple.com', disney: 'disneyplus.com', hulu: 'hulu.com',
  youtube: 'youtube.com', 'yt premium': 'youtube.com', hbo: 'hbomax.com', ' max ': 'max.com', paramount: 'paramountplus.com',
  peacock: 'peacocktv.com', dazn: 'dazn.com', showtime: 'showtime.com', starz: 'starz.com', crunchyroll: 'crunchyroll.com',
  funimation: 'funimation.com', tidal: 'tidal.com', deezer: 'deezer.com', soundcloud: 'soundcloud.com', audible: 'audible.com',
  kindle: 'amazon.com', canva: 'canva.com', adobe: 'adobe.com',
  // shopping
  amazon: 'amazon.com', ebay: 'ebay.com', walmart: 'walmart.com', target: 'target.com', 'best buy': 'bestbuy.com', ikea: 'ikea.com',
  aliexpress: 'aliexpress.com', shein: 'shein.com', zalando: 'zalando.com', asos: 'asos.com',
  // food delivery
  instacart: 'instacart.com', doordash: 'doordash.com', 'uber eats': 'ubereats.com', grubhub: 'grubhub.com', deliveroo: 'deliveroo.com',
  'just eat': 'just-eat.com', glovo: 'glovoapp.com',
  // rides and travel
  uber: 'uber.com', lyft: 'lyft.com', bolt: 'bolt.eu', grab: 'grab.com', airbnb: 'airbnb.com', booking: 'booking.com',
  expedia: 'expedia.com', skyscanner: 'skyscanner.com',
  // gaming
  steam: 'steampowered.com', xbox: 'xbox.com', 'game pass': 'xbox.com', playstation: 'playstation.com', psn: 'playstation.com',
  nintendo: 'nintendo.com', roblox: 'roblox.com', fortnite: 'epicgames.com', minecraft: 'minecraft.net', valorant: 'playvalorant.com',
  'league of legends': 'leagueoflegends.com', riot: 'riotgames.com', 'free fire': 'ff.garena.com', garena: 'garena.com',
  genshin: 'genshin.hoyoverse.com', 'mobile legends': 'mobilelegends.net', clash: 'supercell.com', supercell: 'supercell.com',
  'brawl stars': 'supercell.com', 'call of duty': 'callofduty.com', 'ea ': 'ea.com', fifa: 'ea.com', origin: 'ea.com',
  ubisoft: 'ubisoft.com', razer: 'razer.com', 'battle.net': 'battle.net', blizzard: 'blizzard.com', 'google play': 'play.google.com',
  pubg: 'pubg.com',
  // utilities and tech
  google: 'google.com', microsoft: 'microsoft.com', 'office 365': 'microsoft.com', nordvpn: 'nordvpn.com', surfshark: 'surfshark.com',
  expressvpn: 'expressvpn.com', discord: 'discord.com', tinder: 'tinder.com', bumble: 'bumble.com', telegram: 'telegram.org',
  dropbox: 'dropbox.com', zoom: 'zoom.us', skype: 'skype.com', duolingo: 'duolingo.com', masterclass: 'masterclass.com',
  udemy: 'udemy.com', coursera: 'coursera.org',
  // Nigerian retail
  justrite: 'justritesuperstore.com', 'spar nigeria': 'sparng.com', suregifts: 'suregifts.com',
  // African telecoms
  airtel: 'airtel.com', glo: 'gloworld.com', '9mobile': '9mobile.com.ng', mtn: 'mtn.com', safaricom: 'safaricom.co.ke',
  vodacom: 'vodacom.co.za', orange: 'orange.com', vodafone: 'vodafone.com', moov: 'moov.africa',
  // other
  hotelgift: 'hotelgift.com',
};

/** A Google favicon for a brand we know the website of, or undefined. */
export function brandFaviconUrl(name: string | null | undefined): string | undefined {
  const n = (name ?? '').toLowerCase();
  for (const [fragment, domain] of Object.entries(BRAND_DOMAIN)) {
    if (n.includes(fragment)) return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }
  return undefined;
}

/** The logo to show for a Bitrefill catalog product, or undefined when the caller should show an emoji. */
export function bitrefillLogoUrl(product: { name?: string | null; logo_url?: string | null }): string | undefined {
  if ((product.name ?? '').toLowerCase().startsWith('bitrefill')) return BITREFILL_OFFICIAL_LOGO;
  return product.logo_url || brandFaviconUrl(product.name);
}

/** The emoji shown when a product has no logo, or its logo fails to load. */
export function productEmoji(tab: 'cards' | 'topup' | 'esim'): string {
  return tab === 'esim' ? '📡' : tab === 'topup' ? '📱' : '🎁';
}
