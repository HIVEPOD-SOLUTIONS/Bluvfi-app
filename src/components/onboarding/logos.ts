/**
 * Real brand/token logos bundled with the app (assets/images/logos).
 * Metro needs static require() paths, so they're listed explicitly here.
 *
 * Sources: token logos from the Trust Wallet assets repo; merchant logos are
 * the brands' own marks (Wikimedia Commons renders for Netflix, Tesla,
 * Amazon, Google Play and NVIDIA; the sites' own icons for Hotels.com,
 * DoorDash, Airbnb and SpaceX). SpaceX's is only a 48px favicon — the brand
 * publishes no square mark in higher resolution.
 */
export const CRYPTO_LOGOS = {
  sol: require('../../../assets/images/logos/crypto-sol.png'),
  usdc: require('../../../assets/images/logos/crypto-usdc.png'),
  usdt: require('../../../assets/images/logos/crypto-usdt.png'),
  eth: require('../../../assets/images/logos/crypto-eth.png'),
  btc: require('../../../assets/images/logos/crypto-btc.png'),
};

export const MERCHANT_LOGOS = {
  netflix: require('../../../assets/images/logos/merchant-netflix.png'),
  spacex: require('../../../assets/images/logos/merchant-spacex.png'),
  tesla: require('../../../assets/images/logos/merchant-tesla.png'),
  nvidia: require('../../../assets/images/logos/merchant-nvidia-logo.png'),
  amazon: require('../../../assets/images/logos/merchant-amazon.png'),
  googleplay: require('../../../assets/images/logos/merchant-googleplay.png'),
  hotels: require('../../../assets/images/logos/merchant-hotels.png'),
  doordash: require('../../../assets/images/logos/merchant-doordash.png'),
  airbnb: require('../../../assets/images/logos/merchant-airbnb.png'),
};
