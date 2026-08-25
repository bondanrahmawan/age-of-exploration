import {
  SHIP_COMPONENTS,
  createCampaign,
  executeCampaignCommand,
  getCampaignPlayerView,
  type CampaignCommand,
  type CampaignExecutionOptions,
  type CampaignPlayerView,
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
  shipComponentCondition,
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

const STORE_LABELS: Record<StoreKind, string> = {
  water: "Water",
  provisions: "Provisions",
  repair_stores: "Repair stores",
  medicine: "Medicine",
};

const INTENT_ANNOUNCEMENTS: Record<string, string> = {
  pursue_objective: "The ship will continue to the Cape.",
  return_to_lisbon: "The ship will turn home for Lisbon.",
  objective_abandoned: "The ship has given up the Cape.",
};

/**
 * Screen-reader announcements name the action a player just took. Falling back to the
 * raw command identifier would read command names aloud, so every command dispatched
 * from the interface is spelled out here.
 */
function describeSimulationCommand(command: Readonly<SimulationCommand>): string {
  switch (command.type) {
    case "set_expedition_intent":
      return INTENT_ANNOUNCEMENTS[command.intent] ?? "The ship’s intent has changed.";
    case "enter_cape_verde_port":
      return "In port at Cape Verde. Its stores and services are open.";
    case "leave_cape_verde_port":
      return "Left Cape Verde. Back at sea.";
    case "rest_at_cape_verde":
      return "The crew rested ashore for a day.";
    case "careen_day_at_cape_verde":
      return "Spent a day careening the hull.";
    case "purchase_cape_verde_rumour":
      return "Bought a rumour. It is on the chart, and it may be wrong.";
    case "recognise_cape_landfall":
      return "The Cape is recognised. The estimated position has been corrected.";
    case "survey_cape_day":
      return "Spent a day surveying the Cape.";
    case "collect_cape_water":
      return "Spent a day taking on water at the Cape.";
    case "observation_day":
      return "Spent a day on observation. The log records what the water showed.";
    case "leave_cape":
      return "Left the Cape. Back at sea.";
    default:
      return "Order logged.";
  }
}

const FULL_CONDITION_BPS = 10_000;

/**
 * Names the condition behind a dismissible deck warning, or null when the halt is a real
 * one (a decision, a landfall, a port, a terminal outcome) that dismissal must never
 * silence. Two states share a signature only when the player is looking at the same
 * warning about the same ship, so an acknowledgement survives orders that commit no day
 * and lapses the moment a new warning is raised or a component drops below full.
 */
function softInterruptSignature(view: Readonly<CampaignPlayerView>): string | null {
  const active = view.activeRun;
  if (active === null) return null;
  if (active.journey.pendingEvent !== null || active.journey.outcome !== null) return null;
  if (active.journey.location !== "at_sea") return null;
  if (active.navigation.interruption.kind !== "none") return null;
  if (active.survival.status.kind !== "active") return null;
  if (active.survival.interruption.kind !== "warning") return null;
  const raised = [...active.survival.interruption.warnings].sort().map((code) => {
    const warning = active.survival.warnings.find((item) => item.code === code);
    return `${code}@${warning === undefined ? "-" : warning.firstCommittedDay}`;
  });
  const damaged = SHIP_COMPONENTS.filter(
    (component) => shipComponentCondition(active.ship, component) < FULL_CONDITION_BPS,
  );
  return `run:${view.currentRunNumber ?? "-"}|warning:${raised.join(",")}|damaged:${damaged.join(",")}`;
}

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
  private acknowledgedSoftInterrupt: string | null = null;
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

  /**
   * True while the warning the player dismissed is still the only thing halting the ship.
   */
  private softInterruptAcknowledged(view: Readonly<CampaignPlayerView>): boolean {
    if (this.acknowledgedSoftInterrupt === null) return false;
    return softInterruptSignature(view) === this.acknowledgedSoftInterrupt;
  }

  /**
   * The halt check the helm obeys: engine interruptions, minus one the player has already
   * answered by returning to the helm.
   */
  private isBlocked(view: Readonly<CampaignPlayerView>): boolean {
    return hasBlockingInterruption(view) && !this.softInterruptAcknowledged(view);
  }

  public view(): AppViewModel {
    const campaign = getCampaignPlayerView(this.state);
    return buildAppViewModel(campaign, {
      savePreview: this.preview,
      selectedPanel: this.preferences.panel,
      animationMode: this.preferences.animationMode,
      isAdvancing: this.advancing,
      announcement: this.announcement,
      error: this.lastError,
      forceExpedition: this.forceExpedition || this.softInterruptAcknowledged(campaign),
    });
  }

  public beginNewCampaign(): void {
    this.lastError = null;
    this.forceExpedition = false;
    this.acknowledgedSoftInterrupt = null;
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
    this.announcement = "New campaign started. Outfit the ship in Lisbon.";
    this.emit();
  }

  public resumeCampaign(): void {
    if (this.inspection.kind !== "valid") {
      this.fail("There is no saved campaign to resume. Start a new one instead.");
      return;
    }
    this.state = this.inspection.state;
    this.preview = this.inspection.preview;
    this.forceExpedition = false;
    this.acknowledgedSoftInterrupt = null;
    this.lastError = null;
    this.announcement = `Campaign resumed — ${this.preview.boundary ?? "at the last saved point"}.`;
    this.emit();
  }

  public prepareNextExpedition(): void {
    if (this.state.activeExpedition !== null) {
      this.fail("Finalize this expedition before preparing the next one.");
      return;
    }
    const seed = this.seeds.nextSeed();
    this.commit({ type: "start_expedition", runSeed: seed }, "The next expedition is ready to outfit.");
  }

  private fail(message: string): void {
    this.lastError = message;
    this.announcement = message;
    this.emit();
  }

  private commit(
    command: Readonly<CampaignCommand>,
    announcement: string | ((next: Readonly<CampaignState>) => string),
  ): boolean {
    try {
      const next = executeCampaignCommand(this.state, command, this.executionOptions);
      const nextPreview = this.saves.save(next);
      this.state = next;
      this.preview = nextPreview;
      this.inspection = { kind: "valid", preview: nextPreview, state: next };
      this.forceExpedition = false;
      this.lastError = null;
      this.announcement = typeof announcement === "string" ? announcement : announcement(next);
      this.emit();
      return true;
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "That order could not be carried out.");
      return false;
    }
  }

  public outfitAndDepart(allocation: Readonly<StoresState>): boolean {
    const validation = validateOutfitting(allocation);
    if (!validation.valid) {
      this.fail("Cannot depart yet. Correct the hold and money errors above first.");
      return false;
    }
    if (!this.commit(
      { type: "forward_simulation_command", command: { type: "set_lisbon_outfitting", allocation: { ...allocation } } },
      "Hold loaded.",
    )) return false;
    return this.commit(
      { type: "forward_simulation_command", command: { type: "depart_lisbon" } },
      "Departed Lisbon. The voyage has begun.",
    );
  }

  public dispatchSimulation(command: Readonly<SimulationCommand>, announcement?: string): boolean {
    return this.commit(
      { type: "forward_simulation_command", command },
      announcement ?? describeSimulationCommand(command),
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
    return this.commit(
      { type: "forward_simulation_command", command: { type: "advance_day" } },
      (next) => {
        const day = getCampaignPlayerView(next).activeRun?.committedDay;
        return day === undefined ? "One day sailed and logged." : `Day ${day} sailed and logged.`;
      },
    );
  }

  public chooseEvent(eventId: string, choiceId: string): boolean {
    return this.dispatchSimulation({ type: "choose_event", eventId, choiceId }, "Decision made. It is in the ship’s log.");
  }

  public purchaseAtCapeVerde(store: StoreKind, quantityKg: number): boolean {
    return this.dispatchSimulation(
      { type: "purchase_at_cape_verde", store, quantityKg },
      `Took on ${quantityKg} kg of ${STORE_LABELS[store].toLowerCase()} at Cape Verde.`,
    );
  }

  public repair(component: ShipComponent, location: "at_sea" | "cape_verde"): boolean {
    return this.dispatchSimulation({ type: "repair_day", component, location }, `Spent a day repairing the ${component}.`);
  }

  public depositReport(): boolean {
    return this.commit({ type: "deposit_report_at_cape_verde" }, "A copy of the report is safe at Cape Verde.");
  }

  public finalizeExpedition(): boolean {
    return this.commit({ type: "finalize_expedition" }, "Expedition finalized. The report is ready to read.");
  }

  public dismissSoftInterrupt(): void {
    const campaign = getCampaignPlayerView(this.state);
    const player = campaign.activeRun;
    if (player?.journey.pendingEvent !== null || player.journey.outcome !== null) return;
    // Record which warning was answered, so orders that commit no day do not raise it again.
    this.acknowledgedSoftInterrupt = softInterruptSignature(campaign);
    this.forceExpedition = true;
    this.announcement = "Back at the helm. The warning stays in the ship’s log.";
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
    this.announcement = `Motion set to ${animationMode}.`;
    this.emit();
  }

  public stopAdvance(): void {
    if (!this.advancing) return;
    this.stopRequested = true;
    this.announcement = "Stopping. The day already under way will finish first.";
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
    if (this.isBlocked(initialView)) {
      this.fail("Answer the decision on screen before sailing on.");
      return 0;
    }
    this.advancing = true;
    this.stopRequested = false;
    this.announcement = "Sailing on, one day at a time.";
    this.emit();
    let committed = 0;
    try {
      while (committed < maximumDays && !this.stopRequested) {
        if (!this.advanceOneDay()) break;
        committed += 1;
        if (this.isBlocked(getCampaignPlayerView(this.state))) break;
        await this.pacingDelay();
      }
    } finally {
      this.advancing = false;
      this.stopRequested = false;
      this.announcement = `Stopped after ${committed} ${committed === 1 ? "day" : "days"} at sea.`;
      this.emit();
    }
    return committed;
  }
}
