/* Type declarations for guarded Studio dashboard panel preferences. */
export interface PanelPreferences { summaryCollapsed: boolean; filtersCollapsed: boolean }
export interface PanelPreferencesHost { readonly localStorage: Pick<Storage, 'getItem' | 'setItem'> }
export const PANEL_PREFERENCES_KEY: string;
export function readPanelPreferences(host: PanelPreferencesHost): PanelPreferences;
export function writePanelPreferences(host: PanelPreferencesHost, preferences: PanelPreferences): boolean;
