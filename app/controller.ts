import {
  createCampaign,
  executeCampaignCommand,
  getCampaignPlayerView,
  type CampaignCommand,
  type CampaignExecutionOptions,
  type CampaignState,
  type EnvironmentProvider,
  type Heading,
  type RationPolicy,
  type SailingPolicy,
  type SimulationCommand,
  type StoreKind,
  type StoresState,
} from "../src/index.js";
import type { ExpeditionSeedSource } from "./seed.js";
import {
  CampaignSaveRepository,
  PreferenceRepository,
  type SaveInspection,
  type UiPreferences,
} from "./storage.js";
import {
  buildAppViewModel,
  hasBlockingInterruption,
  validateOutfitting,
  type AnimationMode,
  type AppViewModel,
  type ExpeditionPanel,
  type SafeSavePreview,
  type ShipComponent,
} from "./view-model.js";

export interface GameControllerOptions {
  readonly contentVersion: string;
  readonly dailyEventChancePermille?: number;
  readonly environmentProvider?: EnvironmentProvider;
  readonly prefersReducedMotion?: boolean;
}

type Listener = () => void;

export interface GameActions {
  beginNewCampaign(): void;
  resumeCampaign(): void;
  prepareNextExpedition(): void;
  outfitAndDepart(allocation: Readonly<StoresState>): boolean;
  dispatchSimulation(command: Readonly<SimulationCommand>, announcement?: string): boolean;
  setHeading(heading: Heading): boolean;
  setSailingPolicy(policy: SailingPolicy): boolean;
  setRationPolicy(policy: RationPolicy): boolean;
  advanceOneDay(): boolean;
  advanceUntilInterrupted(maximumDays?: number): Promise<number>;
  chooseEvent(eventId: string, choiceId: string): boolean;
  purchaseAtCapeVerde(store: StoreKind, quantityKg: number): boolean;
  repair(component: ShipComponent, location: "at_sea" | "cape_verde"): boolean;
  depositReport(): boolean;
  finalizeExpedition(): boolean;
  dismissSoftInterrupt(): void;
  selectPanel(panel: ExpeditionPanel): void;
  setAnimationMode(animationMode: AnimationMode): void;
  stopAdvance(): void;
}

export class GameController implements GameActions {
  private state: CampaignState;
  private inspection: SaveInspection;
  private preview: SafeSavePreview;
  private preferences: UiPreferences;
  private listeners = new Set<Listener>();
  private advancing = false;
  private stopRequested = false;
  private forceExpedition = false;
  private announcement = "Ready.";
  private lastError: string | null = null;
  private readonly executionOptions: Readonly<CampaignExecutionOptions>;

  public constructor(
    private readonly saves: CampaignSaveRepository,
    private readonly preferenceStore: PreferenceRepository,
    private readonly seeds: ExpeditionSeedSource,
    private readonly options: Readonly<GameControllerOptions>,
  ) {
    this.state = createCampaign({
      contentVersion: options.contentVersion,
      ...(options.dailyEventChancePermille === undefined
        ? {}
        : { expeditionDailyEventChancePermille: options.dailyEventChancePermille }),
    });
    this.inspection = saves.inspect();
    this.preview = this.inspection.preview;
    this.preferences = preferenceStore.load(options.prefersReducedMotion ?? false);
    this.executionOptions = options.environmentProvider === undefined
      ? {}
      : { environmentProvider: options.environmentProvider };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  public view(): AppViewModel {
    return buildAppViewModel(getCampaignPlayerView(this.state), {
      savePreview: this.preview,
      selectedPanel: this.preferences.panel,
      animationMode: this.preferences.animationMode,
      isAdvancing: this.advancing,
      announcement: this.announcement,
      error: this.lastError,
      forceExpedition: this.forceExpedition,
    });
  }

  public beginNewCampaign(): void {
    this.lastError = null;
    this.forceExpedition = false;
    const fresh = createCampaign({
      contentVersion: this.options.contentVersion,
      ...(this.options.dailyEventChancePermille === undefined
        ? {}
        : { expeditionDailyEventChancePermille: this.options.dailyEventChancePermille }),
    });
    const seed = this.seeds.nextSeed();
    const started = executeCampaignCommand(fresh, { type: "start_expedition", runSeed: seed }, this.executionOptions);
    this.state = started;
    this.preview = this.saves.save(started);
    this.inspection = { kind: "valid", preview: this.preview, state: started };
    this.announcement = "A new local campaign is ready for outfitting.";
    this.emit();
  }

  public resumeCampaign(): void {
    if (this.inspection.kind !== "valid") {
      this.fail("No compatible local campaign is available to resume.");
      return;
    }
    this.state = this.inspection.state;
    this.preview = this.inspection.preview;
    this.forceExpedition = false;
    this.lastError = null;
    this.announcement = `Campaign resumed at ${this.preview.boundary ?? "a committed boundary"}.`;
    this.emit();
  }

  public prepareNextExpedition(): void {
    if (this.state.activeExpedition !== null) {
      this.fail("The current expedition must be finalized before preparing another.");
      return;
    }
    const seed = this.seeds.nextSeed();
    this.commit({ type: "start_expedition", runSeed: seed }, "The next expedition is ready for outfitting.");
  }

  private fail(message: string): void {
    this.lastError = message;
    this.announcement = message;
    this.emit();
  }

  private commit(command: Readonly<CampaignCommand>, announcement: string): boolean {
    try {
      const next = executeCampaignCommand(this.state, command, this.executionOptions);
      const nextPreview = this.saves.save(next);
      this.state = next;
      this.preview = nextPreview;
      this.inspection = { kind: "valid", preview: nextPreview, state: next };
      this.forceExpedition = false;
      this.lastError = null;
      this.announcement = announcement;
      this.emit();
      return true;
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "The command was rejected.");
      return false;
    }
  }

  public outfitAndDepart(allocation: Readonly<StoresState>): boolean {
    const validation = validateOutfitting(allocation);
    if (!validation.valid) {
      this.fail("Departure blocked: correct the allocation errors before dispatching commands.");
      return false;
    }
    if (!this.commit(
      { type: "forward_simulation_command", command: { type: "set_lisbon_outfitting", allocation: { ...allocation } } },
      "Outfitting allocation committed.",
    )) return false;
    return this.commit(
      { type: "forward_simulation_command", command: { type: "depart_lisbon" } },
      "The expedition departed Lisbon.",
    );
  }

  public dispatchSimulation(command: Readonly<SimulationCommand>, announcement?: string): boolean {
    return this.commit(
      { type: "forward_simulation_command", command },
      announcement ?? `${command.type.replaceAll("_", " ")} committed.`,
    );
  }

  public setHeading(heading: Heading): boolean {
    return this.dispatchSimulation({ type: "set_heading", heading }, `Heading set to ${heading}.`);
  }

  public setSailingPolicy(policy: SailingPolicy): boolean {
    return this.dispatchSimulation({ type: "set_sailing_policy", policy }, `Sailing policy set to ${policy.replaceAll("_", " ")}.`);
  }

  public setRationPolicy(policy: RationPolicy): boolean {
    return this.dispatchSimulation({ type: "set_ration_policy", policy }, `Ration policy set to ${policy.replaceAll("_", " ")}.`);
  }

  public advanceOneDay(): boolean {
    return this.dispatchSimulation({ type: "advance_day" }, "One complete day was committed.");
  }

  public chooseEvent(eventId: string, choiceId: string): boolean {
    return this.dispatchSimulation({ type: "choose_event", eventId, choiceId }, "The event decision was committed.");
  }

  public purchaseAtCapeVerde(store: StoreKind, quantityKg: number): boolean {
    return this.dispatchSimulation({ type: "purchase_at_cape_verde", store, quantityKg }, "Cape Verde purchase committed.");
  }

  public repair(component: ShipComponent, location: "at_sea" | "cape_verde"): boolean {
    return this.dispatchSimulation({ type: "repair_day", component, location }, `${component} repair day committed.`);
  }

  public depositReport(): boolean {
    return this.commit({ type: "deposit_report_at_cape_verde" }, "A report snapshot was deposited at Cape Verde.");
  }

  public finalizeExpedition(): boolean {
    return this.commit({ type: "finalize_expedition" }, "The expedition was finalized. The after-action report is ready.");
  }

  public dismissSoftInterrupt(): void {
    const player = getCampaignPlayerView(this.state).activeRun;
    if (player?.journey.pendingEvent !== null || player.journey.outcome !== null) return;
    this.forceExpedition = true;
    this.announcement = "The notice remains in the written log. Expedition controls are available.";
    this.emit();
  }

  public selectPanel(panel: ExpeditionPanel): void {
    this.preferences = { ...this.preferences, panel };
    this.preferenceStore.save(this.preferences);
    this.emit();
  }

  public setAnimationMode(animationMode: AnimationMode): void {
    this.preferences = { ...this.preferences, animationMode };
    this.preferenceStore.save(this.preferences);
    this.announcement = `Animation mode set to ${animationMode}.`;
    this.emit();
  }

  public stopAdvance(): void {
    if (!this.advancing) return;
    this.stopRequested = true;
    this.announcement = "Stop requested; the current committed day will finish first.";
    this.emit();
  }

  private async pacingDelay(): Promise<void> {
    const milliseconds = this.preferences.animationMode === "normal" ? 220
      : this.preferences.animationMode === "reduced" ? 70
        : 0;
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
  }

  public async advanceUntilInterrupted(maximumDays = 365): Promise<number> {
    if (this.advancing) return 0;
    const initialView = getCampaignPlayerView(this.state);
    if (hasBlockingInterruption(initialView)) {
      this.fail("Resolve or dismiss the current interruption before advancing a leg.");
      return 0;
    }
    this.advancing = true;
    this.stopRequested = false;
    this.announcement = "Advancing one committed day at a time.";
    this.emit();
    let committed = 0;
    try {
      while (committed < maximumDays && !this.stopRequested) {
        if (!this.advanceOneDay()) break;
        committed += 1;
        if (hasBlockingInterruption(getCampaignPlayerView(this.state))) break;
        await this.pacingDelay();
      }
    } finally {
      this.advancing = false;
      this.stopRequested = false;
      this.announcement = `Advance stopped after ${committed} committed ${committed === 1 ? "day" : "days"}.`;
      this.emit();
    }
    return committed;
  }
}
