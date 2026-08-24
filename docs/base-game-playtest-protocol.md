# Base-Game Human Playtest Protocol

This protocol closes the human-evidence gap left after WP5. It evaluates the
published base game at `c3f1ba3c7acd81a9e8d4eecb76b7f1bea2a87adc` without
changing its mechanics, tuning, content, or deterministic fixtures.

The session is a genuine use of the normal production game. It is not an
automated test, a shortened route, or permission to begin another work package.

## Evidence and privacy rules

- Use an anonymous session label. Do not record the participant's name,
  contact details, account details, browsing history, or other personal or
  sensitive information.
- Record what is directly observed separately from what the participant says.
- Record timings as measured, including results outside a target. Do not round
  or reinterpret a result to make a gate pass.
- Do not inspect or disclose the hidden true position, current, route, seed,
  PRNG state, save bytes, or other hidden campaign state during an expedition.
- Do not use developer tools to manipulate state, local storage, seeds, saves,
  routes, or outcomes. Do not reload to reverse an unwanted outcome.
- Use only controls visible in the player-facing game. Normal save/resume is
  permitted only when a real interruption requires it and must be noted.
- Do not coach navigation choices or explain a missed landfall before the
  participant gives their own after-action explanation.

## Production-session setup

1. Double-click `play.cmd` from the repository root. This one player action
   builds and serves the ordinary production bundle, then opens the local game
   in the default browser. It does not use Vite's separate E2E mode or shortened
   route.
2. Keep the launcher window open for the session. Closing it or pressing Ctrl+C
   stops the local game server.
3. Confirm the game opens at the ordinary Outfitting screen. Do not inspect
   browser storage or hidden application state.
4. Start a fresh campaign through the visible product control. This intentionally
   replaces any previous local campaign in the selected browser profile.
5. Select any player-facing animation preference desired. Do not change it in
   order to manufacture a target duration; record any change made during play.
6. Use the local wall-clock time in ISO-like form with timezone offset, for
   example `2026-08-24 11:30 +07:00`.

## Timing method

Each expedition is timed separately.

- **Start:** when the participant begins considering the expedition's
  outfitting choices.
- **End:** when the expedition's after-action report first appears.
- **Active play time:** the end-to-end elapsed time, including reading,
  thinking, and making decisions, minus only clearly recorded off-task breaks.
- Record every excluded break with its start, end, and reason. A normal pause
  to think is active play, not a break.
- The §34.15 gate 14 Cape-attempt timing is assessed using measured active play
  time. At least one expedition must make a normal, genuine attempt to reach
  the Cape objective.
- For **Advance until interrupted**, time each continuous stretch from pressing
  the control until the next visible interruption or player stop. Record the
  longest stretch in elapsed time and, when the UI makes it available, resolved
  sailing days.

## Three-expedition procedure

Complete three expeditions in the same campaign so that reported knowledge can
carry between runs. For each expedition:

1. Record the start time before making outfitting decisions.
2. Outfit and depart using only visible controls.
3. Play normally. The participant owns all decisions; the evaluator does not
   recommend headings, policies, rations, event choices, repair choices,
   deposits, or whether to continue or turn home.
4. For each notable navigation decision, record the visible information used
   and the action taken. Note specifically whether the error ellipse affected
   the decision, without asking the participant to use it.
5. Record the elapsed time of every Advance-until-interrupted stretch needed to
   identify the longest one. Note any transition from tension to passive
   waiting in the participant's own words if volunteered during play.
6. Record any confusion, blocked action, UI defect, or accessibility issue at
   the point it occurs. Preserve the participant's words where practical, but
   do not record personal information.
7. Record whether a report was deposited at Cape Verde.
8. Continue until the run reaches a normal outcome: Cape objective reached,
   abandoned, or failed. Do not force a particular outcome.
9. Stop timing when the after-action report first appears. Record the end time,
   breaks, active duration, outcome, and whether the Cape objective was
   reached, abandoned, or failed.
10. Let the participant inspect the after-action report. If a landfall was
    missed, ask for their explanation before offering any correction or
    interpretation, and record it verbatim or as a faithful paraphrase.
11. Begin the next expedition from the visible product control. Do not start a
    different campaign.

## Per-expedition evidence worksheet

Complete one copy for each expedition.

| Field | Record |
|---|---|
| Anonymous session label | |
| Expedition number | |
| Start time and UTC offset | |
| End time and UTC offset | |
| Off-task breaks | None / exact intervals and reasons |
| Elapsed active play time | |
| Result | |
| Cape objective | Reached / abandoned / failed |
| Cape Verde report deposited | Yes / no |
| Notable navigation decisions | |
| Concrete uses or non-use of the error ellipse | |
| Longest Advance-until-interrupted stretch | Elapsed time and resolved days if visible |
| Confusion or blocked action | |
| UI defect | |
| Accessibility issue | |
| Missed-landfall explanation after final chart | Not applicable / participant's explanation |
| Direct observations not captured above | |
| Participant statements not captured above | |

## Post-campaign interview

Ask these questions only after all three expeditions. Read them as written and
do not propose an answer, example, or preferred interpretation.

1. Did the ellipse affect any decisions, or did it feel decorative? Please give
   a concrete example.
2. If a landfall was missed, why do you think it was missed after reading the
   final chart?
3. Did depositing a report make partial progress feel earned, consolatory, or
   irrelevant? Why?
4. How many uninterrupted sailing days felt tense before they became passive
   waiting?
5. Across the three runs, did inherited knowledge increase confidence while
   leaving meaningful decisions? What changed between runs?

Record each answer without correction. `Inconclusive`, `not experienced`, and
`participant could not answer` are valid evidence outcomes.

## Evaluation and closeout rules

- Keep measured timings, directly observed behavior, participant statements,
  evaluator interpretation, defects, tuning observations, and unanswered
  questions in distinct sections of the results document.
- Gate 14 passes only if at least one genuine normal Cape attempt takes
  approximately 45–90 minutes of active play and the already-established
  five-uneventful-days-under-five-seconds evidence remains valid.
- If the qualifying attempt is outside 45–90 minutes, record its actual duration
  and mark gate 14 **Failed**. If the timing evidence is incomplete or ambiguous,
  retain **Unverified**.
- Answer every §35.2 question only as strongly as the three-expedition evidence
  supports. `Inconclusive` is a valid result.
- Record a concrete defect or tuning need as a narrowly scoped follow-up
  recommendation. Do not implement or retune it in this closeout.
- Do not commit or push the evidence artifacts.
