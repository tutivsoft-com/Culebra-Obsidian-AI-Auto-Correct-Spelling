import { installWindowsDiagnostics } from './windows-diagnostics';
import { Plugin, requestUrl } from 'obsidian';
import { MatomoClient, localStorageAdapter } from './matomo-client';
const instances = new WeakMap<Plugin, MatomoClient>();
export function matomoFor(plugin: Plugin): MatomoClient | undefined { return instances.get(plugin); }
export function initializeMatomo(plugin: Plugin): void {
  try {
    if (instances.has(plugin)) return;
    const client = new MatomoClient({ product: 'obsidian_culebra_ai_spell_correct', siteId: 119, platform: 'obsidian', features: ["text_correction"] }, {
      storage: localStorageAdapter(window.localStorage),
      send: async body => { return await requestUrl({url:'https://atcdn.cyou/matomo.php',method:'POST',contentType:'application/x-www-form-urlencoded',body,throw:false}); },
    });
    instances.set(plugin,client);
    installWindowsDiagnostics(plugin);
    plugin.register(() => { client.dispose(); instances.delete(plugin); });
    void client.initialize().then(() => client.screen('home')).catch(() => {});
  } catch (_) {}
}
