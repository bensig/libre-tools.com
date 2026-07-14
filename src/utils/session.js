import { SessionKit } from "@wharfkit/session";
import { WalletPluginAnchor } from "@wharfkit/wallet-plugin-anchor";
import { WebRenderer } from "@wharfkit/web-renderer";
import { WalletPluginBitcoinLibre } from "@libre-chain/wallet-plugin-bitcoin-libre";

// Shared SessionKit factory, extracted from LibreExplorer.jsx so the login
// and logout code paths (and any other consumer, e.g. the /rekey page)
// can't drift apart. Mirrors the args LibreExplorer previously constructed
// inline: same appName, single-chain config, WebRenderer UI, and wallet
// plugin set (Bitcoin-Libre + Anchor).
export function createSessionKit({ chainId, apiUrl }) {
  return new SessionKit({
    appName: "Libre Explorer",
    chains: [{ id: chainId, url: apiUrl }],
    ui: new WebRenderer(),
    walletPlugins: [new WalletPluginBitcoinLibre(), new WalletPluginAnchor()],
  });
}
