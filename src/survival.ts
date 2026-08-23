import { daysBetweenIsoDates } from "./date.js";
import { SimulationValidationError } from "./errors.js";
import { deepFreeze } from "./immutable.js";
import type {
  DatedStoreBatches,
  RationPolicy,
  ShipComponent,
  StoreBatch,
  StoreKind,
  StoresState,
  SurvivalStatus,
  SurvivalWarning,
  SurvivalWarningCode,
} from "./types.js";
import { ALLOCATABLE_HOLD_KG, divideCeiling } from "./units.js";
import type { AuthoredBounds } from "./world.js";
import { contains } from "./world.js";

export interface StoreTuning {
  readonly capKg: number;
  readonly lisbonPriceDucatsPer1000Kg: number;
  readonly capeVerdeStockKg: number;
  readonly capeVerdePriceDucatsPer1000Kg: number;
}

export interface SurvivalTuning {
  readonly hold: {
    readonly totalKg: number;
    readonly fixedMissionAllocationKg: number;
    readonly allocatableKg: number;
  };
  readonly sponsorAdvanceDucats: number;
  readonly stores: Readonly<Record<StoreKind, StoreTuning>>;
  readonly rations: Readonly<Record<RationPolicy, {
    readonly waterUsePermille: number;
    readonly provisionUsePermille: number;
    readonly healthDeltaBps: number;
    readonly moraleDeltaBps: number;
  }>>;
  readonly repair: Readonly<Record<"at_sea" | "cape_verde", {
    readonly repairStoresKg: number;
    readonly restorationBps: number;
  }>>;
  readonly fouling: {
    readonly dailySpeedLossBps: number;
    readonly maximumSpeedLossBps: number;
    readonly tropicalBounds: AuthoredBounds;
    readonly careeningDays: number;
  };
  readonly spoilage: {
    readonly ageDays: number;
    readonly dailyRateNumerator: number;
    readonly dailyRateDenominator: number;
    readonly integerRounding: "ceiling_kg";
  };
  readonly warnings: {
    readonly hullDangerAtOrBelowBps: number;
    readonly crewHealthDangerAtOrBelowBps: number;
    readonly zeroWaterHealthDeltaBps: number;
    readonly zeroWaterMoraleDeltaBps: number;
    readonly zeroProvisionHealthDeltaBps: number;
    readonly zeroProvisionMoraleDeltaBps: number;
  };
  readonly crew: {
    readonly departureCount: number;
    readonly departureAble: number;
    readonly departureHealthBps: number;
    readonly departureMoraleBps: number;
    readonly minimumAbleToMakeWay: number;
  };
  readonly capeVerdeRest: {
    readonly costDucats: number;
    readonly healthRestorationBps: number;
    readonly moraleRestorationBps: number;
  };
}

/** WP2 authored TUNING data. Bounds are authoritative engine data and never enter normal views/logs. */
export const SURVIVAL_TUNING: SurvivalTuning = deepFreeze({
  hold: {
    totalKg: 60_000,
    fixedMissionAllocationKg: 8_000,
    allocatableKg: ALLOCATABLE_HOLD_KG,
  },
  sponsorAdvanceDucats: 300,
  stores: {
    water: {
      capKg: 24_000,
      lisbonPriceDucatsPer1000Kg: 2,
      capeVerdeStockKg: 24_000,
      capeVerdePriceDucatsPer1000Kg: 3,
    },
    provisions: {
      capKg: 18_000,
      lisbonPriceDucatsPer1000Kg: 4,
      capeVerdeStockKg: 12_000,
      capeVerdePriceDucatsPer1000Kg: 6,
    },
    repair_stores: {
      capKg: 8_000,
      lisbonPriceDucatsPer1000Kg: 16,
      capeVerdeStockKg: 4_000,
      capeVerdePriceDucatsPer1000Kg: 20,
    },
    medicine: {
      capKg: 2_000,
      lisbonPriceDucatsPer1000Kg: 40,
      capeVerdeStockKg: 500,
      capeVerdePriceDucatsPer1000Kg: 60,
    },
  },
  rations: {
    normal: {
      waterUsePermille: 1_000,
      provisionUsePermille: 1_000,
      healthDeltaBps: 0,
      moraleDeltaBps: 0,
    },
    reduced_water: {
      waterUsePermille: 750,
      provisionUsePermille: 1_000,
      healthDeltaBps: -300,
      moraleDeltaBps: -200,
    },
    reduced_provisions: {
      waterUsePermille: 1_000,
      provisionUsePermille: 500,
      healthDeltaBps: -100,
      moraleDeltaBps: -200,
    },
    reduced_both: {
      waterUsePermille: 750,
      provisionUsePermille: 500,
      healthDeltaBps: -400,
      moraleDeltaBps: -400,
    },
  },
  repair: {
    at_sea: { repairStoresKg: 250, restorationBps: 500 },
    cape_verde: { repairStoresKg: 500, restorationBps: 1_500 },
  },
  fouling: {
    dailySpeedLossBps: 5,
    maximumSpeedLossBps: 1_500,
    tropicalBounds: {
      minimumXMnm: -3_000_000,
      maximumXMnm: 3_000_000,
      minimumYMnm: -3_800_000,
      maximumYMnm: -950_000,
    },
    careeningDays: 6,
  },
  spoilage: {
    ageDays: 45,
    dailyRateNumerator: 1,
    dailyRateDenominator: 1_000,
    integerRounding: "ceiling_kg",
  },
  warnings: {
    hullDangerAtOrBelowBps: 1_500,
    crewHealthDangerAtOrBelowBps: 2_000,
    zeroWaterHealthDeltaBps: -2_000,
    zeroWaterMoraleDeltaBps: -1_000,
    zeroProvisionHealthDeltaBps: -500,
    zeroProvisionMoraleDeltaBps: -300,
  },
  crew: {
    departureCount: 25,
    departureAble: 25,
    departureHealthBps: 10_000,
    departureMoraleBps: 7_500,
    minimumAbleToMakeWay: 8,
  },
  capeVerdeRest: {
    costDucats: 5,
    healthRestorationBps: 200,
    moraleRestorationBps: 400,
  },
});

const STORE_FIELDS: Readonly<Record<StoreKind, keyof StoresState>> = {
  water: "waterKg",
  provisions: "provisionsKg",
  repair_stores: "repairStoresKg",
  medicine: "medicineKg",
};

export function storeQuantity(stores: Readonly<StoresState>, store: StoreKind): number {
  return stores[STORE_FIELDS[store]];
}

export function withStoreQuantity(
  stores: Readonly<StoresState>,
  store: StoreKind,
  quantityKg: number,
): StoresState {
  return { ...stores, [STORE_FIELDS[store]]: quantityKg };
}

export function holdUsedKg(stores: Readonly<StoresState>): number {
  return stores.waterKg + stores.provisionsKg + stores.repairStoresKg + stores.medicineKg;
}

export function emptyStores(): StoresState {
  return { waterKg: 0, provisionsKg: 0, repairStoresKg: 0, medicineKg: 0 };
}

export function capeVerdeInitialStock(): StoresState {
  return {
    waterKg: SURVIVAL_TUNING.stores.water.capeVerdeStockKg,
    provisionsKg: SURVIVAL_TUNING.stores.provisions.capeVerdeStockKg,
    repairStoresKg: SURVIVAL_TUNING.stores.repair_stores.capeVerdeStockKg,
    medicineKg: SURVIVAL_TUNING.stores.medicine.capeVerdeStockKg,
  };
}

function pricedCost(quantityKg: number, ducatsPer1000Kg: number): number {
  return divideCeiling(
    BigInt(quantityKg) * BigInt(ducatsPer1000Kg),
    1_000n,
    "store purchase price",
  );
}

export function lisbonOutfittingCost(stores: Readonly<StoresState>): number {
  return (Object.keys(STORE_FIELDS) as StoreKind[]).reduce(
    (total, store) => total + pricedCost(
      storeQuantity(stores, store),
      SURVIVAL_TUNING.stores[store].lisbonPriceDucatsPer1000Kg,
    ),
    0,
  );
}

export function capeVerdePurchaseCost(store: StoreKind, quantityKg: number): number {
  return pricedCost(
    quantityKg,
    SURVIVAL_TUNING.stores[store].capeVerdePriceDucatsPer1000Kg,
  );
}

export function assertStoreCapsAndHold(stores: Readonly<StoresState>): void {
  for (const store of Object.keys(STORE_FIELDS) as StoreKind[]) {
    const quantity = storeQuantity(stores, store);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new SimulationValidationError(`${store} quantity must be a non-negative integer kilogram value`);
    }
    if (quantity > SURVIVAL_TUNING.stores[store].capKg) {
      throw new SimulationValidationError(`${store} exceeds its ${SURVIVAL_TUNING.stores[store].capKg} kg cap`);
    }
  }
  if (holdUsedKg(stores) > SURVIVAL_TUNING.hold.allocatableKg) {
    throw new SimulationValidationError(
      `stores exceed the ${SURVIVAL_TUNING.hold.allocatableKg} kg allocatable hold`,
    );
  }
}

export function copyBatches(batches: Readonly<DatedStoreBatches>): DatedStoreBatches {
  return {
    water: batches.water.map((batch) => ({ ...batch })),
    provisions: batches.provisions.map((batch) => ({ ...batch })),
  };
}

export function emptyBatches(): DatedStoreBatches {
  return { water: [], provisions: [] };
}

export function appendBatch(
  batches: Readonly<DatedStoreBatches>,
  store: "water" | "provisions",
  source: StoreBatch["source"],
  acquiredDate: string,
  quantityKg: number,
  sequence: number,
): { readonly batches: DatedStoreBatches; readonly nextSequence: number } {
  if (quantityKg === 0) return { batches: copyBatches(batches), nextSequence: sequence };
  const batch: StoreBatch = {
    id: `batch.${String(sequence).padStart(6, "0")}`,
    store,
    source,
    acquiredDate,
    remainingKg: quantityKg,
  };
  return {
    batches: {
      water: store === "water" ? [...batches.water.map((item) => ({ ...item })), batch] : batches.water.map((item) => ({ ...item })),
      provisions: store === "provisions" ? [...batches.provisions.map((item) => ({ ...item })), batch] : batches.provisions.map((item) => ({ ...item })),
    },
    nextSequence: sequence + 1,
  };
}

export function consumeOldestFirst(
  batches: readonly Readonly<StoreBatch>[],
  requestedKg: number,
): { readonly batches: readonly StoreBatch[]; readonly consumedKg: number } {
  let remainingRequest = requestedKg;
  const next: StoreBatch[] = [];
  let consumedKg = 0;
  for (const batch of batches) {
    const taken = Math.min(batch.remainingKg, remainingRequest);
    const remainingKg = batch.remainingKg - taken;
    remainingRequest -= taken;
    consumedKg += taken;
    if (remainingKg > 0) next.push({ ...batch, remainingKg });
  }
  return { batches: next, consumedKg };
}

export function spoilProvisionBatches(
  batches: readonly Readonly<StoreBatch>[],
  serviceDate: string,
): { readonly batches: readonly StoreBatch[]; readonly spoiledKg: number } {
  let spoiledKg = 0;
  const next = batches.map((batch) => {
    const ageDays = daysBetweenIsoDates(batch.acquiredDate, serviceDate);
    if (ageDays <= SURVIVAL_TUNING.spoilage.ageDays || batch.remainingKg === 0) {
      return { ...batch };
    }
    const lossKg = divideCeiling(
      BigInt(batch.remainingKg) * BigInt(SURVIVAL_TUNING.spoilage.dailyRateNumerator),
      BigInt(SURVIVAL_TUNING.spoilage.dailyRateDenominator),
      "daily provision spoilage",
    );
    spoiledKg += lossKg;
    return { ...batch, remainingKg: batch.remainingKg - lossKg };
  }).filter((batch) => batch.remainingKg > 0);
  return { batches: next, spoiledKg };
}

export function batchTotalKg(batches: readonly Readonly<StoreBatch>[]): number {
  return batches.reduce((total, batch) => total + batch.remainingKg, 0);
}

export function hasOldWater(batches: readonly Readonly<StoreBatch>[], date: string): boolean {
  return batches.some(
    (batch) => daysBetweenIsoDates(batch.acquiredDate, date) > SURVIVAL_TUNING.spoilage.ageDays,
  );
}

export function isTropicalDay(position: { readonly xMnm: number; readonly yMnm: number }): boolean {
  return contains(SURVIVAL_TUNING.fouling.tropicalBounds, position);
}

const WARNING_MESSAGES: Readonly<Record<SurvivalWarningCode, string>> = {
  zero_water: "Water stores are exhausted. Replenish or change course before dehydration pressure continues.",
  zero_provisions: "Provision stores are exhausted. Replenish or change course before hunger pressure continues.",
  sour_water: "The oldest water has passed 45 days and sour-water pressure is now visible.",
  provisions_spoiling: "Provision batches older than 45 days are losing usable mass.",
  hull_danger: "Hull condition is critical. Repair or seek safety before ship loss can occur.",
  crew_health_danger: "Pooled crew health is critical. The crew may soon be unable to continue.",
};

export function survivalWarning(
  code: SurvivalWarningCode,
  firstCommittedDay: number,
): SurvivalWarning {
  return { code, firstCommittedDay, message: WARNING_MESSAGES[code] };
}

export const ACTIVE_SURVIVAL_STATUS: SurvivalStatus = deepFreeze({
  kind: "active",
  message: "Expedition remains active.",
});

export function componentCondition(
  ship: Readonly<{ hullBps: number; mastBps: number; sailsBps: number; rudderBps: number }>,
  component: ShipComponent,
): number {
  return ship[`${component}Bps` as keyof typeof ship];
}

export function withComponentCondition(
  ship: Readonly<{ hullBps: number; mastBps: number; sailsBps: number; rudderBps: number }>,
  component: ShipComponent,
  conditionBps: number,
) {
  return { ...ship, [`${component}Bps`]: conditionBps };
}
