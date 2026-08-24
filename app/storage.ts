import {
  deserializeCampaignSave,
  getCampaignPlayerView,
  serializeCampaignSave,
  type CampaignState,
} from "../src/index.js";
import {
  ANIMATION_MODES,
  EXPEDITION_PANELS,
  type AnimationMode,
  type ExpeditionPanel,
  type SafeSavePreview,
} from "./view-model.js";

export const CAMPAIGN_SAVE_KEY = "age-of-exploration.campaign-save.v1";
export const UI_PREFERENCES_KEY = "age-of-exploration.ui-preferences.v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveInspection =
  | { readonly kind: "none"; readonly preview: SafeSavePreview }
  | { readonly kind: "valid"; readonly preview: SafeSavePreview; readonly state: CampaignState }
  | { readonly kind: "invalid"; readonly preview: SafeSavePreview };

function emptyPreview(kind: "none" | "invalid", message: string): SafeSavePreview {
  return {
    kind,
    message,
    currentRunNumber: null,
    committedDay: null,
    date: null,
    completedRuns: 0,
    reportedFactCount: 0,
    boundary: null,
  };
}

function boundaryFor(state: Readonly<CampaignState>): string {
  const view = getCampaignPlayerView(state);
  const active = view.activeRun;
  if (active === null) return "Between expeditions";
  if (active.journey.outcome !== null) return "Ready to finalize";
  if (active.journey.pendingEvent !== null) return "Pending event decision";
  if (view.depositedReport.deposited) return "Report deposited at Cape Verde";
  if (active.survival.lifecycle === "outfitting") return "Outfitting in Lisbon";
  return `Day ${active.committedDay} boundary`;
}

function previewFor(state: Readonly<CampaignState>): SafeSavePreview {
  const view = getCampaignPlayerView(state);
  return {
    kind: "valid",
    message: "A compatible local campaign is available.",
    currentRunNumber: view.currentRunNumber,
    committedDay: view.activeRun?.committedDay ?? null,
    date: view.activeRun?.date ?? view.priorRunSummaries.at(-1)?.finalDate ?? null,
    completedRuns: view.priorRunSummaries.length,
    reportedFactCount: view.inheritedReportedFacts.length,
    boundary: boundaryFor(state),
  };
}

export class CampaignSaveRepository {
  public constructor(private readonly storage: KeyValueStorage) {}

  public inspect(): SaveInspection {
    const raw = this.storage.getItem(CAMPAIGN_SAVE_KEY);
    if (raw === null) return { kind: "none", preview: emptyPreview("none", "No local campaign is saved yet.") };
    try {
      const state = deserializeCampaignSave(raw);
      return { kind: "valid", preview: previewFor(state), state };
    } catch {
      return {
        kind: "invalid",
        preview: emptyPreview(
          "invalid",
          "The local campaign is invalid or incompatible. It has not been replaced; start fresh only if you intend to overwrite it.",
        ),
      };
    }
  }

  public save(state: Readonly<CampaignState>): SafeSavePreview {
    this.storage.setItem(CAMPAIGN_SAVE_KEY, serializeCampaignSave(state));
    return previewFor(state);
  }

  public clear(): void {
    this.storage.removeItem(CAMPAIGN_SAVE_KEY);
  }
}

export interface UiPreferences {
  readonly panel: ExpeditionPanel;
  readonly animationMode: AnimationMode;
}

export class PreferenceRepository {
  public constructor(private readonly storage: KeyValueStorage) {}

  public load(prefersReducedMotion: boolean): UiPreferences {
    const fallback: UiPreferences = {
      panel: "chart",
      animationMode: prefersReducedMotion ? "reduced" : "normal",
    };
    const raw = this.storage.getItem(UI_PREFERENCES_KEY);
    if (raw === null) return fallback;
    try {
      const value = JSON.parse(raw) as { panel?: unknown; animationMode?: unknown };
      if (
        typeof value.panel !== "string"
        || !EXPEDITION_PANELS.includes(value.panel as ExpeditionPanel)
        || typeof value.animationMode !== "string"
        || !ANIMATION_MODES.includes(value.animationMode as AnimationMode)
      ) return fallback;
      return { panel: value.panel as ExpeditionPanel, animationMode: value.animationMode as AnimationMode };
    } catch {
      return fallback;
    }
  }

  public save(preferences: Readonly<UiPreferences>): void {
    this.storage.setItem(UI_PREFERENCES_KEY, JSON.stringify(preferences));
  }
}

export class MemoryKeyValueStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  public removeItem(key: string): void {
    this.values.delete(key);
  }

  public raw(key: string): string | null {
    return this.getItem(key);
  }
}
