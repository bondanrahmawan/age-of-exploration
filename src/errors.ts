export class SimulationValidationError extends Error {
  public readonly code = "SIMULATION_VALIDATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "SimulationValidationError";
  }
}
export class CanonicalizationError extends Error {
  public readonly code = "CANONICALIZATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

export class SaveFormatError extends Error {
  public readonly code = "SAVE_FORMAT_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "SaveFormatError";
  }
}

export class ReplayError extends Error {
  public readonly code = "REPLAY_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}
