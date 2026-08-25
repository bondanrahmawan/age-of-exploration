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
WP3_STATE_SHA256: b871fca57445a23a037df96fb270e558b5be9fe9961fcf7967a52ba15a0c8866
WP3_LOG_SHA256: fbb2626f880cb8c5fb0e7217dd979e8cdffa44278acafdb44498142cc56bb843

WP4_RUN_1_STATE_SHA256: 57118f1d586dab7df6236dce6ae775f8c7404aace11e5cb2815d7cfe443f32df
WP4_RUN_1_REPORT_SHA256: 6906a062e74a5da2fc2a979187818432261d6e5c4289d462077f0c3187e379a7
WP4_RUN_2_STATE_SHA256: 99c12349bde5a01a123cf8ff923f543655a0a2a14bd319aba2196d846ca88f02
WP4_RUN_2_REPORT_SHA256: 0966692d283e4769972da8e7d847fb852232019181c766227678d3272a94821d
WP4_RUN_3_STATE_SHA256: b9a138037cd56bb2e2709c10ed51d079f02ae89ba4f48a9f299aa826e672382a
WP4_RUN_3_REPORT_SHA256: 74b92b7776c8f6596f7bb4cf130b50d8f4e0a79ee84da4ed63794ff159351fc2
WP4_FINAL_KNOWLEDGE_SHA256: 5c85cbdf2df0e599a028df5c9ba1b03bd4600fab5ad58377ea6bbd39dd9807df
WP4_CAMPAIGN_COMMAND_LOG_SHA256: cb510d32b00724873fb2e1a20956c86bde67456469890e243eaeee3371a5d6ee
WP4_CAMPAIGN_REPLAY_SHA256: ea7188dd94a2bc7e206f27af9bce4fd5f84024eb9ec11f41fba5b77cb2c74a72
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
