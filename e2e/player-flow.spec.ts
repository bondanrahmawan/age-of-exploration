import { expect, test, type Page } from "@playwright/test";

const FIXED_SESSION_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 520, height: 900 },
] as const;

async function assertFixedSessionLayout(page: Page): Promise<void> {
  for (const viewport of FIXED_SESSION_VIEWPORTS) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const main = document.querySelector("main");
      const mainRect = main?.getBoundingClientRect();
      const inViewport = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) return false;
        const rect = element.getBoundingClientRect();
        return rect.top >= -1 && rect.left >= -1 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1;
      };
      return {
        verticalOverflow: root.scrollHeight - root.clientHeight,
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        missionVisible: inViewport(".mission-summary"),
        milestoneVisible: inViewport(".milestone-summary"),
        criticalVisible: inViewport(".critical-status"),
        decisionVisible: inViewport(".order-heading, .interrupt-decision-frame h2"),
        primaryVisible: inViewport(".primary-action"),
        removedChromeCount: document.querySelectorAll(".app-chrome, .site-footer").length,
        mainTopGap: mainRect?.top ?? Number.POSITIVE_INFINITY,
        mainBottomGap: mainRect === undefined ? Number.POSITIVE_INFINITY : innerHeight - mainRect.bottom,
      };
    });
    expect(Math.abs(layout.verticalOverflow), `${viewport.width}x${viewport.height} vertical document overflow`).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.horizontalOverflow), `${viewport.width}x${viewport.height} horizontal document overflow`).toBeLessThanOrEqual(1);
    expect(layout.missionVisible).toBe(true);
    expect(layout.milestoneVisible).toBe(true);
    expect(layout.criticalVisible).toBe(true);
    expect(layout.decisionVisible).toBe(true);
    expect(layout.primaryVisible).toBe(true);
    expect(layout.removedChromeCount).toBe(0);
    expect(Math.abs(layout.mainTopGap), `${viewport.width}x${viewport.height} empty global header space`).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.mainBottomGap), `${viewport.width}x${viewport.height} empty global footer space`).toBeLessThanOrEqual(1);
  }
  await expect(page.getByText("Age of Exploration", { exact: true })).toHaveCount(0);
  await expect(page.getByText("The Uncertain Sea", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Local only · deterministic commands · no telemetry or network play", { exact: true })).toHaveCount(0);
}

async function assertActiveTruthBoundary(page: Page): Promise<void> {
  const markup = await page.locator("#app").innerHTML();
  for (const forbidden of ["truePosition", "hiddenTrace", "eventPrng", "environmentPrng", "snapshotHash", "runSeed"]) {
    expect(markup).not.toContain(forbidden);
  }
  await expect(page.getByText("Actual track, solid with round markers")).toHaveCount(0);
}

/** The heading control is a compass rose, so a course is set by choosing its point, not a list row. */
async function steer(page: Page, heading: string): Promise<void> {
  await page.getByRole("radio", { name: new RegExp(`^${heading} — `) }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`^${heading} — `) })).toHaveAttribute("aria-checked", "true");
}

async function outfitAndDepart(page: Page): Promise<void> {
  await expect(page.locator("main[data-screen='outfitting']")).toBeVisible();
  await page.getByLabel("Water tonnes").fill("20");
  await page.getByLabel("Provisions tonnes").fill("16");
  await page.getByLabel("Repair stores tonnes").fill("4");
  await page.getByLabel("Medicine tonnes").fill("0");
  await expect(page.getByText("Estimated range")).toBeVisible();
  await page.getByRole("button", { name: "Depart Lisbon" }).press("Enter");
  await expect(page.locator("main[data-screen='expedition']")).toBeVisible();
  await assertActiveTruthBoundary(page);
}

async function sailToCapeVerde(page: Page, heading: "SW" | "NNW"): Promise<void> {
  await steer(page, heading);
  await page.getByRole("button", { name: /Sail one day/ }).press("Enter");
  await expect(page.locator("main[data-screen='interrupt']")).toBeVisible();
  await page.getByRole("button", { name: /Enter Cape Verde port/ }).press("Enter");
  await expect(page.getByRole("heading", { name: /Cape Verde — Porto/ })).toBeVisible();
}

async function completeRun(page: Page, runNumber: number): Promise<void> {
  await outfitAndDepart(page);
  await sailToCapeVerde(page, "SW");
  if (runNumber === 1) await page.getByRole("button", { name: /Buy a rumour/ }).press("Enter");
  await page.getByRole("button", { name: /Depart Cape Verde/ }).press("Enter");

  await steer(page, "SE");
  await page.getByRole("button", { name: /Sail one day/ }).press("Enter");
  await page.getByRole("button", { name: /Recognise the Cape landfall/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "The Cape", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Survey the coast/ }).press("Enter");
  await page.getByRole("button", { name: /Survey the coast/ }).press("Enter");
  await page.getByRole("button", { name: /Take on water/ }).press("Enter");
  await page.getByRole("button", { name: /Turn home/ }).press("Enter");
  await page.getByRole("button", { name: /Leave the Cape/ }).press("Enter");

  await sailToCapeVerde(page, "NNW");
  await page.getByRole("button", { name: /Leave a copy of the report/ }).press("Enter");
  await page.getByRole("button", { name: /Depart Cape Verde/ }).press("Enter");
  await steer(page, "NE");
  await page.getByRole("button", { name: /Sail one day/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "The expedition is over" })).toBeVisible();
  await page.getByRole("button", { name: /Finalize and read the report/ }).press("Enter");
  await expect(page.locator("main[data-screen='after_action']")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Full Success" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimated and actual tracks" })).toBeVisible();
  await expect(page.getByText("Actual track, solid with round markers")).toBeVisible();
}

async function sessionDay(page: Page): Promise<number> {
  const meta = await page.locator(".session-meta span").first().innerText();
  const match = /day (\d+)/.exec(meta);
  return match === null ? Number.NaN : Number(match[1]);
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
  await page.getByRole("button", { name: "Start a new campaign" }).press("Enter");

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
  await page.getByRole("button", { name: "Start a new campaign" }).press("Enter");
  await outfitAndDepart(page);
  await expect(page.getByRole("img", { name: /Chart of the ship’s estimated position/ })).toBeVisible();
  await expect(page.locator("svg [role='img'][tabindex='0']").first()).toBeVisible();
  await expect(page.getByText(/Position is estimated/i)).toBeVisible();
  await expect(page.getByText(/how wrong the estimate may be, not a coastline/i)).toBeVisible();
  await page.getByLabel("Motion").selectOption("skipped");
  await page.getByRole("tab", { name: "Deck" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Ship, crew, and stores" })).toBeVisible();
  await page.getByRole("tab", { name: "Chart" }).press("Enter");
  await steer(page, "W");
  for (let day = 0; day < 12; day += 1) await page.getByRole("button", { name: /Sail one day/ }).press("Enter");
  await page.setViewportSize({ width: 520, height: 900 });
  await page.getByRole("tab", { name: "Log" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Ship’s log" })).toBeVisible();
  const log = page.locator(".log-panel");
  const logOverflow = await log.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(logOverflow).toBeGreaterThan(0);
  await log.press("PageDown");
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("tab", { name: "Chart" }).press("Enter");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await assertActiveTruthBoundary(page);
});

test("fixed expedition and interrupt workspaces hold required information at every target viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Start a new campaign" }).press("Enter");
  await outfitAndDepart(page);
  await assertFixedSessionLayout(page);

  await steer(page, "SW");
  await page.getByRole("button", { name: /Sail one day/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "A known port" })).toBeVisible();
  await assertFixedSessionLayout(page);
  await page.getByRole("button", { name: /Enter Cape Verde port/ }).press("Enter");
  await assertFixedSessionLayout(page);

  const portOperations = page.getByLabel("Cape Verde stores and services");
  const portOverflow = await portOperations.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(portOverflow).toBeGreaterThan(0);
  await portOperations.press("PageDown");
  await expect.poll(() => portOperations.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /Depart Cape Verde/ })).toBeInViewport();
  await assertActiveTruthBoundary(page);
});

test("a deck warning with nothing to answer never halts the voyage", async ({ page }) => {
  await page.getByRole("button", { name: "Start a new campaign" }).press("Enter");
  await outfitAndDepart(page);
  await page.getByLabel("Motion").selectOption("skipped");
  await steer(page, "W");

  // The day-45 spoilage warnings arrive on a sound ship, so nothing on a halt screen could
  // answer them. The voyage must sail straight through them.
  await page.getByRole("button", { name: /Sail until something happens/ }).press("Enter");
  await expect.poll(() => sessionDay(page), { timeout: 60_000 }).toBeGreaterThan(46);
  await expect(page.locator("main[data-screen='interrupt'].interrupt-survival")).toHaveCount(0);
  await expect(page.locator(".global-error")).toHaveCount(0);

  // The warnings stay standing where they belong, in the session briefing strip.
  await expect(page.getByLabel("Active warnings")).toContainText(/older than 45 days/);
});

test("five uneventful skipped-animation days resolve under five seconds", async ({ page }) => {
  await page.getByRole("button", { name: "Start a new campaign" }).press("Enter");
  await outfitAndDepart(page);
  await steer(page, "W");
  await page.getByLabel("Motion").selectOption("skipped");
  const start = Date.now();
  for (let day = 0; day < 5; day += 1) await page.getByRole("button", { name: /Sail one day/ }).press("Enter");
  const elapsedMs = Date.now() - start;
  console.log(`WP5_FIVE_DAY_SKIPPED_BROWSER_MS: ${elapsedMs}`);
  expect(elapsedMs).toBeLessThan(5_000);
  await expect(page.getByText(/day 5/i).first()).toBeVisible();
});
