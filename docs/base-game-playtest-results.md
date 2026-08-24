# Base-Game Human Playtest Results

Status: **Human session pending; acceptance remains unverified.**

This artifact records the post-WP5 human playtest separately from the automated
evidence in `docs/wp5-acceptance.md`. No human result is inferred from automated
tests, scripted browser paths, or evaluator expectations.

## Evaluation context

- Repository: `D:\pet_project\age-of-exploration`
- Published starting branch: `main`
- Published starting commit:
  `c3f1ba3c7acd81a9e8d4eecb76b7f1bea2a87adc`
- Initial repository state: clean `main`, synchronized with `origin/main`
- Protocol: `docs/base-game-playtest-protocol.md`
- Anonymous session label: Pending
- Session date and timezone: Pending

## Pre-session baseline

All requested pre-session checks passed before the production game was opened.

| Check | Result |
|---|---|
| `node --version` | Passed: `v22.13.1` |
| `pnpm exec node --version` | Passed: `v22.13.1` |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 17 files, 151 tests |
| `pnpm build` | Passed: engine and production browser bundle |
| `pnpm test:ui` | Passed: 2 files, 20 tests |
| `pnpm test:determinism` | Passed: 5 files, 29 tests |
| `pnpm event:validate` | Passed: 24 total, 8 delayed, 7 remembered, 8 preparation-softened, 5 fact-producing |
| `pnpm fixture:wp3` | Passed; hashes recorded below |
| `pnpm fixture:wp4` | Passed; hashes recorded below |
| `pnpm test:launcher` | Passed: 4 focused launcher tests |
| `play.cmd` production launch | Passed: dependencies/build refreshed, first-party loopback server started, and identified health returned HTTP 200 |
| second `play.cmd` launch | Passed: matching running build reused in 175 ms without rebuild or duplicate server |
| legacy/foreign port checks | Passed: earlier Vite preview identified; unrelated HTTP server refused without opening a page |

The pnpm launcher printed its existing unsupported-engine warning identifying
its host as Node `v24.19.0`; both explicit runtime checks used the required Node
`v22.13.1`, and every command passed without suppressing the warning.

### Preserved fixture hashes

```text
WP3_STATE_SHA256: 03caed9796f4f2343e35bfc3e1766c9a4c1530d0409e4d02203feedae6b7b44b
WP3_LOG_SHA256: fbb2626f880cb8c5fb0e7217dd979e8cdffa44278acafdb44498142cc56bb843

WP4_RUN_1_STATE_SHA256: 1a075775315bd14cb2f85ea5904b802b2bfa74efbf2d9b95a31cd709d5bd5ea2
WP4_RUN_1_REPORT_SHA256: 51ae94c066ea8058374f7f834467b4f2d12fa3e2d172216603add816e53168b0
WP4_RUN_2_STATE_SHA256: 982ec85868345052bc56d8cfbbeea31579180e533051c86176969fe42b96af40
WP4_RUN_2_REPORT_SHA256: 87399103a4d45225af7d22658bf1cdaee28af6376fc7ee078bfb5d8508a89967
WP4_RUN_3_STATE_SHA256: 4f7ce85f677813885a6b85fc70835cdaf7b14d38f02a7f274e6ee50758b8a9b5
WP4_RUN_3_REPORT_SHA256: 604ce03165d64a43e02d65db7cccb5c4d639e3345df739f317633b2e9649d5c3
WP4_FINAL_KNOWLEDGE_SHA256: 5c85cbdf2df0e599a028df5c9ba1b03bd4600fab5ad58377ea6bbd39dd9807df
WP4_CAMPAIGN_COMMAND_LOG_SHA256: 0d6a87612a58d3f0286e9d26a630beb4fd56007964fb57f4d6e89c5ec43c1b2b
WP4_CAMPAIGN_REPLAY_SHA256: 6d732984e395fccdf56a7f122a08b3e8d7a4fc5df48a96d8f018e2e1e2cb6af8
WP4_RUN_3_KNOWN_CURRENT_ESTIMATE_DELTA_MNM: 18000
```

## Measured timings and outcomes

No human expedition has yet been measured.

| Expedition | Start | End | Excluded breaks | Active time | Result | Cape objective | Cape Verde report | Longest uninterrupted stretch |
|---:|---|---|---|---|---|---|---|---|
| 1 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| 2 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| 3 | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Directly observed behavior

Pending the genuine three-expedition human session.

## Participant statements

Pending the genuine three-expedition human session and post-campaign interview.

## §35.2 evidence results

| Question | Result | Evidence |
|---|---|---|
| Did the ellipse affect decisions or feel decorative? | Unverified | Human session pending. |
| Could the participant explain a missed landfall after the final chart? | Unverified | Human session pending. |
| Did a report deposit make partial progress feel earned? | Unverified | Human session pending. |
| How many uninterrupted days remained tense? | Unverified | Human session pending. |
| Did inherited knowledge increase confidence without removing decisions across three runs? | Unverified | Human session pending. |

## Evaluator interpretation

No human evidence is available to interpret yet.

## Gate 14 decision

**Unverified.** The previously established real-Chromium evidence still shows
five skipped-animation days completing in under five seconds, but no genuine
normal 45–90 minute human Cape attempt has been measured.

## Defects

- **Pre-session access blocker:** the participant reported that the published
  repository did not appear playable because it offered no executable or
  launcher and required multiple terminal commands. After the participant
  explicitly required a one-step entrypoint, `play.cmd` and its first-party
  loopback launcher/server were added. The implementation preserves the fixed
  browser origin, detects stale or foreign servers, exposes only safe build
  identity, and verifies that production assets omit E2E markers. This
  packaging/accessibility correction does not change mechanics, tuning,
  campaign state, deterministic fixtures, or hidden information.

## Tuning observations

No human-session tuning evidence has been collected yet. No tuning change is
authorized in this closeout.

## Unanswered questions

- The gate 14 normal Cape-attempt duration remains unanswered.
- All five §35.2 human product questions remain unanswered.

## Follow-up recommendations

None currently. The reported pre-session access blocker is addressed by the
one-step Windows launcher; the three-expedition session remains pending.
