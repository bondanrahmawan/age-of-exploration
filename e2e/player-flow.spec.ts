import { expect, test, type Page } from "@playwright/test";

async function assertActiveTruthBoundary(page: Page): Promise<void> {
  const markup = await page.locator("#app").innerHTML();
  for (const forbidden of ["truePosition", "hiddenTrace", "eventPrng", "environmentPrng", "snapshotHash", "runSeed"]) {
    expect(markup).not.toContain(forbidden);
  }
  await expect(page.getByText("Actual track, solid with round markers")).toHaveCount(0);
}

async function outfitAndDepart(page: Page): Promise<void> {
  await expect(page.locator("main[data-screen='outfitting']")).toBeVisible();
  await page.getByLabel("Water tonnes").fill("20");
  await page.getByLabel("Provisions tonnes").fill("16");
  await page.getByLabel("Repair stores tonnes").fill("4");
  await page.getByLabel("Medicine tonnes").fill("0");
  await expect(page.getByText("Projected-range estimate")).toBeVisible();
  await page.getByRole("button", { name: "Depart Lisbon" }).press("Enter");
  await expect(page.locator("main[data-screen='expedition']")).toBeVisible();
  await assertActiveTruthBoundary(page);
}

async function sailToCapeVerde(page: Page, heading: "SW" | "NNW"): Promise<void> {
  await page.getByRole("combobox", { name: "Heading" }).selectOption(heading);
  await page.getByRole("button", { name: /Advance one day/ }).press("Enter");
  await expect(page.locator("main[data-screen='interrupt']")).toBeVisible();
  await page.getByRole("button", { name: /Enter Cape Verde port/ }).press("Enter");
  await expect(page.getByRole("heading", { name: /Cape Verde — Porto/ })).toBeVisible();
}

async function completeRun(page: Page, runNumber: number): Promise<void> {
  await outfitAndDepart(page);
  await sailToCapeVerde(page, "SW");
  if (runNumber === 1) await page.getByRole("button", { name: /Buy a seeded rumour/ }).press("Enter");
  await page.getByRole("button", { name: /Depart Cape Verde/ }).press("Enter");

  await page.getByRole("combobox", { name: "Heading" }).selectOption("SE");
  await page.getByRole("button", { name: /Advance one day/ }).press("Enter");
  await page.getByRole("button", { name: /Recognise the Cape landfall/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "The Cape objective" })).toBeVisible();
  await page.getByRole("button", { name: /Survey one full day/ }).press("Enter");
  await page.getByRole("button", { name: /Survey one full day/ }).press("Enter");
  await page.getByRole("button", { name: /Collect legal Cape water/ }).press("Enter");
  await page.getByRole("button", { name: /Turn home/ }).press("Enter");
  await page.getByRole("button", { name: /Leave the Cape/ }).press("Enter");

  await sailToCapeVerde(page, "NNW");
  await page.getByRole("button", { name: /Deposit report snapshot/ }).press("Enter");
  await page.getByRole("button", { name: /Depart Cape Verde/ }).press("Enter");
  await page.getByRole("combobox", { name: "Heading" }).selectOption("NE");
  await page.getByRole("button", { name: /Advance one day/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "Expedition ended" })).toBeVisible();
  await page.getByRole("button", { name: /Finalize and read the report/ }).press("Enter");
  await expect(page.locator("main[data-screen='after_action']")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Full Success" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimated and actual tracks" })).toBeVisible();
  await expect(page.getByText("Actual track, solid with round markers")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("three finalized browser expeditions inherit reported knowledge without active hidden truth", async ({ page }) => {
  await expect(page.locator("main[data-screen='outfitting']")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.getByRole("button", { name: "Begin new local campaign" }).press("Enter");

  for (let run = 1; run <= 3; run += 1) {
    await completeRun(page, run);
    if (run < 3) {
      await page.getByRole("button", { name: "Prepare the next expedition" }).press("Enter");
      await expect(page.locator("main[data-screen='outfitting']")).toBeVisible();
      await expect(page.getByRole("heading", { name: "What the chart claims" })).toBeVisible();
      await expect(page.getByText(/two-day Cape survey/i).first()).toBeVisible();
      await assertActiveTruthBoundary(page);
    }
  }
  await expect(page.getByText(/Finalized expedition 3/)).toBeVisible();
});

test("chart, log, skipped pacing, keyboard controls, and narrow layout remain usable", async ({ page }) => {
  await page.getByRole("button", { name: "Begin new local campaign" }).press("Enter");
  await outfitAndDepart(page);
  await expect(page.getByRole("img", { name: /Accessible estimated-position chart/ })).toBeVisible();
  await expect(page.locator("svg [role='img'][tabindex='0']").first()).toBeVisible();
  await page.getByLabel("Animation").selectOption("skipped");
  await page.getByRole("tab", { name: "Log" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Expedition log" })).toBeVisible();
  await page.getByRole("tab", { name: "Chart" }).press("Enter");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await assertActiveTruthBoundary(page);
});

test("five uneventful skipped-animation days resolve under five seconds", async ({ page }) => {
  await page.getByRole("button", { name: "Begin new local campaign" }).press("Enter");
  await outfitAndDepart(page);
  await page.getByRole("combobox", { name: "Heading" }).selectOption("W");
  await page.getByLabel("Animation").selectOption("skipped");
  const start = Date.now();
  for (let day = 0; day < 5; day += 1) await page.getByRole("button", { name: /Advance one day/ }).press("Enter");
  const elapsedMs = Date.now() - start;
  console.log(`WP5_FIVE_DAY_SKIPPED_BROWSER_MS: ${elapsedMs}`);
  expect(elapsedMs).toBeLessThan(5_000);
  await expect(page.getByText(/day 5/i).first()).toBeVisible();
});
