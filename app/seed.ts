export interface ExpeditionSeedSource {
  nextSeed(): string;
}

export class BrowserCryptoSeedSource implements ExpeditionSeedSource {
  public nextSeed(): string {
    const words = new Uint32Array(4);
    globalThis.crypto.getRandomValues(words);
    return `expedition-${Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("")}`;
  }
}

export class FixedSeedSource implements ExpeditionSeedSource {
  private index = 0;

  public constructor(private readonly seeds: readonly string[]) {
    if (seeds.length === 0) throw new Error("FixedSeedSource requires at least one seed");
  }

  public nextSeed(): string {
    const seed = this.seeds[this.index];
    if (seed === undefined) throw new Error("FixedSeedSource exhausted its explicit seeds");
    this.index += 1;
    return seed;
  }
}
