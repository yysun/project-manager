/* Studio dashboard panel preferences. Guarded browser-storage access restores
   only complete boolean payloads and keeps unavailable storage non-fatal. */
export const PANEL_PREFERENCES_KEY = 'project-manager-studio:panel-preferences';

function expandedDefaults() {
  return { summaryCollapsed: false, filtersCollapsed: false };
}

export function readPanelPreferences(host) {
  try {
    const raw = host.localStorage.getItem(PANEL_PREFERENCES_KEY);
    if (raw === null) return expandedDefaults();
    const value = JSON.parse(raw);
    if (typeof value?.summaryCollapsed !== 'boolean' || typeof value?.filtersCollapsed !== 'boolean') return expandedDefaults();
    return { summaryCollapsed: value.summaryCollapsed, filtersCollapsed: value.filtersCollapsed };
  } catch {
    return expandedDefaults();
  }
}

export function writePanelPreferences(host, preferences) {
  try {
    host.localStorage.setItem(PANEL_PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
