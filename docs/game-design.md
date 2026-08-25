# Age of Exploration — Game Design Document

> **Document status:** Base-game development contract; broader game remains a design concept.
>
> **Base-game scope:** Lisbon → Cape Verde → Cape of Good Hope → Lisbon, as defined in §34.
>
> **Authority rule:** For the base game, §34 overrides broader or conflicting examples elsewhere in this document. Values marked **TUNING** may change during balancing; rules marked **CONTRACT** should not change without updating this document and its acceptance checks.

This document deliberately separates two layers:

- **Base game:** the smallest complete, replayable game used to validate navigation uncertainty and knowledge progression.
- **Full game:** the larger campaign vision described in §§5–33.

Development should begin with the base game only. Full-game systems are context, not implied scope.

**Readiness verdict:** this document is ready to drive a separate technical plan and the bounded WP0–WP5 sequence in §34.16. It is not a build contract for the full campaign vision. Event prose, balance values, visual style, and technology choices remain work inside their named packages; they must not be guessed early or treated as permission to expand scope.

## 1. High-Level Concept

A survival-management exploration game set during the **Age of Exploration**, using a gameplay structure similar to **The Oregon Trail**.

The player commands a maritime expedition during roughly **1450–1700**.

The main gameplay is not combat. It is:

- Expedition planning
- Navigation under uncertainty
- Resource management
- Crew management
- Trade
- Exploration
- Risk management
- Discovery
- Returning home successfully

The core fantasy is:

> **Turn an unknown world into a navigable one.**

A successful expedition is not only about reaching a destination.

The full loop is:

> **Discover → Survive → Return → Profit / Report**

### 1.1 The One-Sentence Mechanic

If the game keeps only one system, it keeps this one:

> **The player never sees where the ship is. Only where the crew believes it is.**

Everything else — supplies, morale, disease, trade — exists to make that uncertainty expensive.

---

## 2. Game Pillars

The game should focus on five main pillars:

1. **Uncertainty**
   - The player does not know exact distances, routes, hazards, or resources.
   - The player does not know their own position.

2. **Expedition Management**
   - Every ton of hold space, crew member, and day matters.

3. **Navigation**
   - Wind, current, season, and incomplete maps affect travel.

4. **Knowledge as Progression**
   - Failed expeditions can still produce useful information.

5. **Risk vs Reward**
   - Safer routes are slower.
   - Faster routes expose the expedition to more danger.
   - More trade cargo means fewer survival supplies.

---

## 3. Core Gameplay Loop

```text
Prepare expedition
        ↓
Choose route
        ↓
Sail
        ↓
Event / encounter
        ↓
Make decision
        ↓
Resources + crew + ship state change
        ↓
Reach port / landmark
        ↓
Trade / repair / recruit / gather information
        ↓
Choose next route
        ↓
Return home
```

Returning home should be a major part of the game.

Reaching India with valuable information but losing the ship on the return journey can still mean failure.

---

## 4. Turn Structure and Units

Systems only work if they share units. These are the units.

### 4.1 The Tick

The tick is **one day**.

A **leg** is a stretch of sailing between two decisions — usually 5 to 40 days.

The player sets a heading and a policy, then the days resolve one at a time until something interrupts:

```text
Leg begins
  ↓
Each day:
    lock the player's heading and sailing policy
    resolve weather and current
    advance true position (hidden)
    advance estimated position and uncertainty (shown)
    attempt observation / landfall
    consume stores and apply spoilage
    tick ship, crew health, and morale
    evaluate and resolve at most one event
    test interruptions and terminal states
  ↓
Leg ends on: event, landfall, order change, or arrival
```

The player can watch days pass one at a time, or run the leg until it breaks. Days without events resolve fast and silently.

This order is a **CONTRACT**. A day is committed as one deterministic transaction; pausing, saving, or reloading must not resolve only half of it. A queued event interrupts before the next day begins.

### 4.2 Mass

Everything in the hold is measured in **tons**.

Consumption per crew member per day:

```text
Water     6 kg     (about one gallon)
Food      2 kg     (biscuit, salt meat, peas, cheese)
Wine      1 kg
-----------------
Total     9 kg  =  0.009 tons
```

The rule of thumb the player learns:

> **crew × days × 0.009 = tons of stores**

A 25-man crew burns about **one ton every four days**, and two-thirds of that is water.

### 4.3 Why Water Is The Real Enemy

Water is three times the mass burden of food and cannot be stretched by rationing nearly as far.

This produces the historically correct pressure and the game's most common decision:

> The hold is not empty. The water casks are.

Land is not a destination. Land is water.

### 4.4 Range Is A Ratio, Not A Ship

Bigger ships carry more stores, but they need more crew to sail them, and crew drink.

```text
Range in days ≈ tons of stores ÷ (crew × 0.009)
```

A large carrack is not automatically a longer-ranged ship than a small caravel. It is a *larger* ship. Range comes from the **tons-per-crewman** ratio of the hull, and from how much of the hold the player refuses to fill with cargo.

This is the single most important number in expedition planning, and the game should show it during outfitting.

---

## 5. Expedition Objectives

Campaigns can have different objectives.

Examples:

- Find a sea route to India.
- Reach the Spice Islands.
- Cross the Atlantic and return.
- Circumnavigate the world.
- Establish a profitable trade route.
- Map unknown coastlines.
- Search for a missing expedition.
- Complete a scientific expedition.
- Deliver diplomatic messages.
- Establish contact with a distant port.

Different objectives allow the same systems to support different play styles.

Each objective should also define what counts as **partial** success, because most expeditions will end partial. See §30.

---

## 6. Expedition Preparation

This replaces the wagon preparation phase from Oregon Trail.

The player starts with limited funding and must choose how to spend it.

### 6.1 Ship Selection

| Ship | Hold (t) | Crew | t/crewman | Speed | Hull | Draft | Guns | Cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Pinnace | 25 | 14 | 1.8 | 5 | 2 | Shallow | 2 | 150 |
| Caravel | 60 | 25 | 2.4 | 4 | 3 | Shallow | 6 | 350 |
| Carrack | 150 | 60 | 2.5 | 2 | 4 | Deep | 12 | 700 |
| Galleon | 200 | 110 | 1.8 | 3 | 5 | Deep | 30 | 1400 |

Maximum range with a full hold of stores, no cargo:

```text
Pinnace    ~200 days
Caravel    ~267 days
Carrack    ~278 days
Galleon    ~202 days
```

The table is deliberately counter-intuitive. The galleon is the strongest ship and one of the shortest-legged, because its gun crews eat. The caravel is small and can sit at sea nearly as long as anything afloat.

#### Caravel
Best for:
- Exploration
- Shallow coastal survey
- Long endurance on a small budget

Weakness:
- Little space left for cargo once stores are aboard

#### Carrack
Best for:
- Long expeditions
- Bulk trade
- Large supply reserves

Weakness:
- Slow, deep draft, cannot approach unknown coasts safely

#### Galleon
Best for:
- Contested waters
- Valuable cargo
- Surviving a fight rather than avoiding one

Weakness:
- Expensive, and its crew drinks its range away

#### Pinnace
Best for:
- Coastal survey, river mouths, reef work
- Fast scouting from a larger consort

Weakness:
- Fragile, short-legged, cannot carry a profit home

### 6.2 Consorts

The player may sail with more than one ship.

A second ship adds redundancy, a place to put survivors, and a shallow-draft scout — at the cost of a second crew's consumption and the risk of separation in weather.

Separated consorts should be a real event, resolved by a pre-agreed rendezvous point that the player must choose *before* sailing.

This is optional for the first version of the game. See §35.

### 6.3 Supplies

Possible supplies:

- Water
- Food (biscuit, salt meat, peas, cheese)
- Wine
- Medicine
- Timber
- Sailcloth
- Rope
- Tar and oakum
- Spare tools
- Gunpowder
- Ammunition
- Navigation equipment
- Trade goods
- Gifts (for first contact and courts — distinct from trade goods)

Hold space creates the main trade-off.

Balanced exploration loadout, caravel, 25 crew:

```text
Hold: 60 tons

22  Water              146 days
16  Food and wine      213 days
 8  Repair stores      timber, sailcloth, rope, tar
 4  Powder, shot, tools
10  Trade goods and gifts
```

Water runs out first. It almost always does.

Aggressive merchant loadout:

```text
Hold: 60 tons

12  Water               80 days
 9  Food and wine      120 days
 4  Repair stores
 3  Powder, shot, tools
32  Trade goods
```

This expedition can produce three times the profit.

It also cannot cross an ocean without finding water on the way, which means it cannot afford to be lost.

---

## 7. Money and Contracts

Money is listed as a resource everywhere in this document, so it needs a loop.

### 7.1 The Contract

```text
Advance          paid at departure, spent on ship and stores
Shares           the sponsor's cut of anything sold on return
Wages            owed to each crewman, paid on return
Penalty          owed if the objective is not met
```

### 7.2 Wages Are Paid To The Living

Wages accrue per crewman per month and are paid out when the expedition returns.

Dead crew are cheaper than living crew.

The game should not hide this. It should make the player notice it, once, and then live with having noticed it. Nothing rewards it mechanically — a decimated crew fails the survival metric (§30), loses officers whose skills the player needs, and mans a ship that may not be sailable home with the hands remaining.

### 7.3 Insolvency

If the return cargo plus prize money does not cover wages, penalties and the sponsor's shares, the expedition ends in debt.

Debt carries into the next expedition as a smaller advance and a stricter sponsor.

This is a failure state (§29) that still permits play.

---

## 8. Crew System

Instead of managing a family, the player manages a ship crew.

### 8.1 Crew Roles

Possible specialists:

- Captain
- Master / Navigator
- Pilot (hired locally, knows one coast well)
- Surgeon
- Carpenter
- Cooper (keeps the casks tight — see §14)
- Gunner
- Interpreter
- Merchant
- Cartographer
- Naturalist
- Chaplain
- Boatswain
- Sailors

Specialists affect gameplay systems.

A skilled carpenter reduces:

- Repair time
- Timber consumption
- Storm damage

A skilled navigator reduces:

- Daily position error (§9)
- Chance of a missed landfall
- Chance of misreading weather

A cooper reduces:

- Water loss to leakage and souring

Officers are named individuals. Sailors are a pool with an average health and morale.

### 8.2 Crew Attributes

Each officer has:

```text
Health
Morale
Skill
Loyalty
Experience
Role
Background
```

Example:

```text
João Rodrigues
Navigator

Navigation: 8
Leadership: 3
Health: 67%
Morale: 42%
Loyalty: 71%
```

### 8.3 Officers Have Opinions

Crew members develop a relationship with the expedition, and their opinions drive events.

> João believes the expedition should turn east.

Options:

- Follow his recommendation.
- Ignore him.
- Replace him.
- Ask other officers.

The important part is that **the game remembers**. Ignoring an officer who turns out to have been right costs loyalty across the whole wardroom. Ignoring one who turns out to have been wrong buys it.

Later, low morale makes those old disagreements load-bearing:

> Several sailors support João and demand that the expedition return home.

### 8.4 Officers Are Also Knowledge

An officer who survives an expedition carries what they learned into the next one, and can be re-hired.

Losing a veteran navigator is a loss of map, not just a loss of a body.

---

## 9. Navigation and Dead Reckoning

This is the centre of the game.

### 9.1 Two Positions

The simulation holds two positions:

```text
True position       hidden during an active run
Estimated position  shown to the player, drifts
```

The player gives orders based on the estimate. The world resolves them against the truth.

### 9.2 Latitude Is Solvable. Longitude Is Not.

This is historically accurate until roughly 1760, and it is a gift of a game mechanic.

```text
Latitude    measurable with quadrant or astrolabe
            needs a clear sky and a steady deck
            resets north–south error to ±15 nm

Longitude   not measurable at sea in this period
            estimated only from speed, heading, elapsed time
            error only ever grows until landfall
```

The estimated position should therefore be drawn as an **ellipse**: narrow north to south, wide east to west, growing wider every day at sea.

The player learns the mechanic by looking at it.

### 9.3 Error Growth

```text
Longitude error per day at sea

  base                          +12 nm
  navigator skill 8/10           ×0.6
  overcast or heavy weather      ×1.5
  damaged rudder                 ×1.4
  unknown current          +up to 20 nm, one direction, silent
```

The silent current term matters most. An uncharted current does not announce itself — it simply makes the ship arrive somewhere other than where the arithmetic said, and the player has no way to tell that from ordinary error until landfall proves it.

Discovering a current (§20) removes it from the silent term and adds it to the estimate.

### 9.4 Resetting Error

```text
Noon sighting, clear sky        latitude error → ±15 nm
Noon sighting, heavy swell      latitude error → ±40 nm
Overcast                        no sighting
Recognised landmark             both errors → 0
Local pilot aboard              both errors → near 0 on his coast
```

### 9.5 Strategies This Creates

Because latitude is cheap and longitude is expensive, the historical strategies emerge on their own:

- **Running down the latitude.** Sail north or south to the target's latitude while still near known land, then hold that parallel and sail east or west until land appears. Slow. Almost never lost.
- **Great circle guesswork.** Cut the corner across open water. Fast, and every day widens the ellipse.
- **Coast-hugging.** Constant position fixes and constant reef risk.

None of these needs to be explained in a tutorial. The ellipse explains them.

### 9.6 The Landfall Moment

When land appears, the game resolves the truth against the estimate:

```text
Estimated:  17°S, roughly 380 nm off the coast
Actual:     17°S, 40 nm off the coast

The current has been setting east for eleven days.
```

This is the emotional peak of a leg. It should be presented as one, whether the news is good or catastrophic.

### 9.7 Route Decisions

The player does not click a destination. They choose a strategy.

Example, at Cape Verde:

#### Option A — Follow the African Coast

Advantages:
- Constant position fixes
- Frequent resupply
- Low chance of getting lost

Disadvantages:
- Slower
- More disease exposure
- Contrary coastal winds
- Reefs

#### Option B — Sail Southwest into the Atlantic

Advantages:
- Potentially much faster
- Better large-scale wind patterns

Disadvantages:
- No ports
- Error ellipse grows for weeks
- No margin if water runs short

#### Option C — Explore West

Advantages:
- Possible discoveries
- New routes

Disadvantages:
- Unknown destination
- High risk

---

## 10. Wind and Ocean Currents

Wind should make maritime travel fundamentally different from land travel.

The shortest geometric route should not always be the fastest route.

```text
Cape Verde
     |
     | Contrary winds, foul current
     ↓
West African Coast

Cape Verde ───────→ South Atlantic
                         ↓
                  Favourable winds
                         ↓
                 Cape of Good Hope
```

The player gradually learns navigation concepts through gameplay:

- Trade winds
- Westerlies
- Monsoon winds
- Ocean currents
- Seasonal storms
- Coastal wind patterns
- Doldrums and calms

A route that looks longer on the map can be much faster. The great southwest sweep into the Atlantic to reach southern Africa — the *volta do mar* — should be discoverable, not given.

### 10.1 Points of Sail

Speed is a function of the angle between heading and wind, not of the ship's speed rating alone.

```text
Running / broad reach      full speed
Beam reach                 90% speed
Close-hauled               50% speed, drifting to leeward
Into the wind              no progress, tacking only
Becalmed                   no progress, stores still burning
```

Being becalmed is the purest expression of the game: nothing happens, and it costs everything.

---

## 11. Time and Seasons

Time is a resource. Each expedition tracks:

```text
Day
Month
Year
Season
```

Season affects:

- Wind direction
- Monsoon patterns
- Storm probability
- Food availability
- Disease
- Port activity
- Trade prices

Example:

The player reaches India shortly before the monsoon changes.

- Leave immediately, half-loaded.
- Wait four months, burning stores and wages in port.
- Sail against the season and take the weather.

A seasonal window the player misses by five days should cost them five months. That asymmetry is what makes time feel like a real resource rather than a counter.

---

## 12. Resource Management

Primary expedition resources:

```text
Water
Food and wine
Crew
Morale
Ship condition (per component)
Repair stores
Medicine
Money
Hold space
Time
Knowledge
```

Resources should interact.

A storm damages the mast. Repair requires:

```text
1.5 t timber
0.3 t rope
0.4 t sailcloth
4 days
```

Stopping for four days with 25 crew also consumes:

```text
0.9 t of stores  (4 days of water and food)
```

And the player must choose:

- Repair fully.
- Repair partially and continue.
- Continue with reduced speed and a widening error ellipse.
- Search for land — costs unknown days, may find water, may find a reef.

---

## 13. Ship Condition

The ship is several systems, not one health bar.

```text
Hull
Masts
Sails
Rudder
Rigging
Cannons
Storage
Navigation Equipment
```

### Damaged Hull
- Slow water ingress, crew time on the pumps
- Increased storm risk
- Cargo spoilage

### Damaged Mast
- Lower speed
- Reduced ability to point close to the wind

### Damaged Rudder
- Position error growth ×1.4
- Severe danger in heavy weather

### Damaged Navigation Equipment
- No noon sightings — latitude error stops resetting

Losing the quadrant is quietly one of the worst things that can happen, and the player will not realise it until the ellipse stops narrowing.

### 13.1 Fouling

Below the waterline, the hull fouls with weed and worm, faster in warm water.

```text
Speed loss: about 1% per 20 days in the tropics
Careening at a safe beach: 6 days, restores hull speed
```

Fouling is the clock that makes the second half of an expedition slower than the first, without any event having to fire. See §24.

---

## 14. Disease

Disease should be systemic, not a random death roll.

```text
Crew: 78

Healthy: 62
Sick: 16
```

Causes, tracked as hidden state:

- Water quality (declines with cask age; a cooper slows it)
- Diet variety (days since fresh provisions)
- Tropical exposure by region and season
- Wounds and infection
- Crowding, and whether the ship is kept dry

The player is never told the cause directly. They are told the symptoms.

> Several sailors have swollen gums, loose teeth, and no strength for the ropes.

The surgeon suggests fresh provisions.

Possible actions:

- Search for land.
- Buy fruit at the next port.
- Continue sailing.
- Reduce workload.
- Use medicine.

### 14.1 Knowledge Is Period-Accurate

The surgeon's advice reflects what was believed in the campaign's era, not what is true. Early campaigns give the player good instincts wrapped in wrong theory; later campaigns narrow the gap.

A player who knows modern medicine can exploit this — buying citrus that their surgeon says is pointless. That exploit is intended. It is the knowledge pillar operating on the player rather than on the character.

---

## 15. Morale and Mutiny

Morale affects:

- Work efficiency and repair speed
- Desertion
- Mutiny
- Event outcomes
- Fighting strength
- Recovery from illness

Morale changes with:

- Food quality and ration size
- Visible progress toward the objective
- Deaths
- Successful discoveries
- Pay and prize money
- Leadership decisions, and whether past ones proved right
- Time away from home
- Weather
- Disease

```text
Morale: 32%

Repair speed        -10%
Desertion chance    +15%
Mutiny events        enabled
```

### 15.1 Mutiny Is A Process

Mutiny should never be a single failed roll. It should be a visible sequence the player can spend resources to break:

```text
Grumbling      →  Petition      →  Officers divide   →  Seizure
```

At each stage the player can spend something real — full rations, a course change, promised shares, a flogging, putting a ringleader ashore — and each of those has its own later cost.

A player who loses the ship to mutiny should be able to name the four decisions that led there.

---

## 16. Ports

Ports act as temporary safe zones.

At a port, the player can:

- Repair and careen
- Resupply
- Trade
- Recruit
- Rest the crew ashore
- Gather rumours
- Hire pilots and guides
- Study or buy charts
- Negotiate
- Seek medical help

Each port has different conditions.

### Malacca

Available:

```text
Water        Cheap
Rice         Cheap
Timber       Medium
Spices       Expensive
```

Demand:

```text
Silver       Very High
Wool         Low
```

Ports also sell information:

> A merchant offers word of the coming monsoon for 50 ducats.

Information can be worth more than cargo. It can also be wrong (§19), and the merchant may know that.

---

## 17. Trade

Trade should matter without turning the game into a spreadsheet.

Regional exports:

```text
Europe            Silver, weapons, textiles, wool
West Africa       Gold, ivory, pepper
India             Cotton textiles, pepper, indigo
Southeast Asia    Cloves, nutmeg, mace
China             Silk, porcelain, tea
```

Prices change with region, supply, demand, politics, distance, and the player's own past voyages.

```text
Pepper

Malacca:      8
Goa:         14
Lisbon:      62
Amsterdam:   71
```

Trade goods compete directly with stores for hold space. That is the entire trade system's job. Anything more elaborate than that is optional.

### 17.1 The Player Moves The Market

A route the player establishes and repeats should saturate. The fifth cargo of pepper into Lisbon sells for less than the first.

This is the counter-pressure that keeps a solved route from being an income button, and it pushes the player back toward the unknown — which is the game.

---

## 18. Exploration and the Player's Chart

The map is not revealed. The player draws it.

Initial state:

```text
????
   |
Canary Islands
   |
????
   |
Cape Verde
```

After several expeditions:

```text
Canary Islands
      |
Cape Verde
      |
Sierra Leone
      |
Gold Coast
      |
Kongo
      |
Cape of Good Hope
```

The chart the player carries is the chart the player made. Where their surveys were sloppy, their coastline is wrong — and it stays wrong until someone sails it again properly.

A coast surveyed from ten miles out in poor weather should be drawn on the player's chart as a fuzzy, hedged line. The chart is a record of confidence, not of terrain.

---

## 19. Information Reliability

Every piece of information has a source, a confidence, and an age.

```text
Cape location          own survey, 1487        Confidence 92%
Fresh water source     own landing, 1487       Confidence 88%
Strait to the south    Venetian chart, 1470    Confidence 44%
Rumoured island        tavern, Lisbon, 1489    Confidence 23%
```

### 19.1 Confidence By Source

```text
Own survey, twice          highest
Own survey, once           high
Local pilot                high on his own coast, low elsewhere
Purchased chart            medium, and sellers lie
Rival nation's chart       medium, and rivals lie deliberately
Port rumour                low
```

### 19.2 Information Ages

Political facts decay fastest, physical facts slowest.

```text
Coastline           effectively permanent
Water source        may fail in a dry season
Port prices         stale within a year
Friendly ruler      stale within a year
Rival presence      stale within months
```

A player who returns to a port after four years should find their notes are half fiction.

### 19.3 Wrong Maps Are Better Than Random Events

The player's chart shows:

```text
Island of San Mateo
```

The expedition sails there. Nothing is there.

Twelve days of water are gone. No event fired. No die was rolled against the player. The player simply believed something false, which is the entire subject of the game.

This is a better source of difficulty than random misfortune, and the game should prefer it whenever it can.

---

## 20. Discovery

Discoveries have several kinds of value.

```text
Discovery: Southern Ocean Current

Navigation value:   3
Scientific value:   1
Commercial value:   5
```

Possible discoveries:

- New coastline
- Islands
- Ports and anchorages
- Trade routes
- Wind systems
- Ocean currents
- Natural resources
- New species
- Fresh water sources
- Dangerous reefs and shoals

A discovery is provisional until the expedition **returns home and reports it**. A current recorded in a log at the bottom of the Atlantic is worth nothing.

This is the rule that makes §24 matter.

---

## 21. Knowledge as Meta-Progression

Knowledge is the long-term progression system.

### Expedition 1

```text
Result: ship lost near the Cape
```

But the boat that reached Cape Verde carried a log recording:

```text
A safer approach to the Cape Verde islands
A reliable water source at 15°N
A reef, uncharted, at roughly 12°N
```

### Expedition 2

Those three facts are on the chart from day one.

Eventually the player has a route:

```text
Lisbon → Canaries → Cape Verde → South Atlantic sweep
      → Cape of Good Hope → Mozambique → Goa
```

Progress is the reduction of uncertainty.

### 21.1 The Counter-Pressure Problem

This is the biggest design risk in the whole concept.

If knowledge only accumulates, expedition ten is a solved route with no tension, and the game dies of its own success. Three forces push back:

1. **Objectives escalate.** Each solved route is the *departure point* for the next campaign, not the content of it. Reaching the Cape becomes the first leg of reaching India.
2. **Rivals move.** Other powers explore whether the player does or not. A route the player leaves alone for three years may be charted, fortified, or closed by someone else. The player's advantage is temporal, not permanent.
3. **Markets saturate** (§17.1). The solved route stops paying.

The player should always be able to sail the safe known route. It should just never be the best available use of a season.

---

## 22. Event System

Events depend on expedition state. They are not free-floating random draws.

Event inputs:

```text
Region
Season
Weather
Crew morale and health
Ship condition
Stores remaining
Navigator skill
Political relations
Cargo
Days since last landfall
```

### 22.1 Selection

```text
Each day:
  1. Filter the pool by hard gates (region, season, state tags)
  2. Weight remaining events by expedition state
  3. Drop anything on cooldown or already fired this leg
  4. Roll against the daily event chance (base ~12%, modified by state)
```

### 22.2 Rules That Keep It Honest

- **No unwarned kills.** Nothing may end the expedition without a prior event that made the danger visible and offered an action.
- **Every event has a spendable option.** At least one choice must convert a resource the player might hold — days, stores, money, morale, a person's loyalty — into a better outcome. Pure coin-flips are not choices.
- **Death spirals must be escapable at a price.** Not free. A player at 15% morale, no water, and a cracked mast should always have one terrible option available, and it should cost them the objective.
- **Foreshadow, then fire.** Storms build over two days. Sickness starts as fatigue. Mutiny grumbles.

### 22.3 Example — Storm

Conditions:

```text
Season: monsoon
Region: Indian Ocean
Navigator skill: low
```

> The glass is falling and the swell is coming from the wrong quarter.

#### Lower sails and ride it out
- Reduced sail damage
- Low mast risk
- Lost days, large position error

#### Run before it
- Escape the worst of the weather
- Large, silent position error
- Moderate hull damage

#### Hold the course
- Fastest progress
- High risk to masts and hull

---

## 23. Encounter Types

- Storms and squalls
- Calms and doldrums
- Pirates
- Merchant vessels
- Shipwreck survivors
- Fishing boats
- Unknown islands
- Disease outbreaks
- Crew fights
- Officer disputes
- Whales
- Reefs and shoals
- Water contamination
- Rats in the stores
- Fire aboard
- Mast and rigging failure
- Navigation errors
- Desertion
- Mutiny
- Foreign naval patrols
- Local rulers and their courts
- Trading fleets
- Religious missions
- Competing explorers
- Separated consorts

---

## 24. The Return Leg

The document has said twice that returning home matters. This is the section that makes it true.

The return is not the outbound leg reversed. It is systematically worse:

```text
Hull            fouled, several percent slower (§13.1)
Stores          old; water sour, biscuit weevilled
Hold            full of cargo, so fewer tons available for stores
Crew            smaller, sicker, and homesick rather than eager
Season          has moved; the wind that carried you out may now oppose you
Charts          better — the one thing that improved
```

The player's chart is the only asset that got stronger, which is exactly the point of the game.

### 24.1 The Cargo Decision

At the far port the player must split the hold between profit and survival, knowing the return is longer than the outbound leg felt.

```text
Fill the hold with pepper       →  rich if you arrive, dead if you don't
Half stores, half cargo         →  modest profit, likely arrival
Stores only                     →  certain arrival, sponsor unpaid
```

This is the best decision in the game because the player now has enough experience to be wrong with confidence.

### 24.2 Getting The Report Home

If the ship cannot be saved, knowledge can still be:

- Send the pinnace ahead with the logs.
- Leave a cache and a marker at a known anchorage.
- Entrust the charts to a passing vessel — which may sell them to a rival.
- Put the surviving navigator aboard a friendly ship (§8.4).

A player who loses everything except the log has still moved the campaign forward.

---

## 25. Sponsors

Sponsors change objectives, rewards, and pressure.

### Royal Expedition

Goals: discover territory, establish strategic routes, claim locations, return with charts.

Advantages: high funding, military support, access to royal shipyards.

Disadvantages: political obligations, and the crown will want claims made in places where claims cause trouble.

### Merchant Consortium

Goal: profit.

Advantages: better trade contacts, larger capital, better prices.

Disadvantages: relentless pressure for returns; a scientifically magnificent voyage that loses money is a failed voyage.

### Scientific Society

Goals: map coastlines, catalogue species, record geography.

Advantages: better specialists, research bonuses, prestige rewards.

Disadvantages: low funding, small ships, no protection.

---

## 26. Diplomacy and Local Relations

Local societies are active political entities with their own goals, rivals, and trade interests — not passive resources or terrain features.

```text
Hostile
Suspicious
Neutral
Friendly
Allied
```

Relations affect trade prices, port access, repair access, pilots, intelligence, and military risk.

The strongest states in this period — Ming China, Mughal India, the Ottomans, the Malacca and Gujarat sultanates, Calicut — were richer and more powerful than the expeditions arriving on their coasts. The game should reflect that. A caravel does not dictate terms at Calicut.

Example:

> A foreign trading company asks the expedition to help seize control of a local port.

#### Assist

```text
+500 ducats
+Foreign sponsor relations
+Port access
-Local relations, durably, across the whole region
```

#### Remain neutral

```text
No immediate reward
Limited political consequences
```

#### Warn the local ruler

```text
+Local relations
-Foreign sponsor relations
Possible future trade privileges
```

Consequences should outlive the expedition that caused them. A region the player burned in campaign two should still be closed in campaign four.

---

## 27. Historical Content and Boundaries

The Age of Exploration involved trade, diplomacy, conquest, enslavement, disease, colonisation, religious expansion, competition between states, and severe disruption of existing societies.

The design position is:

**These appear as historical forces and as consequences. They are never player-optimisable reward mechanics.**

Specifically:

- The game does not model the slave trade as a cargo the player buys and sells for profit. It exists in the world — in ports, in the fleets the player passes, in what rival powers do — as something the expedition encounters and must respond to, with reputational and political consequences either way.
- Conquest and seizure are available choices with durable costs, not a progression track.
- Local polities have their own histories, interests, and agency, and are not scenery.
- Disease transmitted by the expedition to populations it contacts is modelled as a consequence in the world, not as a score.

The structure to avoid:

```text
Discover land → Colonise → Gain points
```

The structure to aim for:

```text
Act → The world remembers → Later expeditions live in that world
```

---

## 28. Campaign Structure

Campaigns introduce mechanics in layers.

### Campaign 1 — Atlantic

```text
Lisbon → Canary Islands → West Africa
```

Teaches: stores, consumption, basic navigation, crew, simple trade.

Position error is small because the coast is always in sight.

### Campaign 2 — Cape Route

```text
Lisbon → West Africa → Cape of Good Hope → East Africa
```

Adds: open-ocean dead reckoning, the wide error ellipse, major storms, currents, severe supply management, the volta do mar.

This is where the game's real subject arrives.

### Campaign 3 — Indian Ocean

Adds: monsoon windows, established trade networks, diplomacy with powers stronger than the player, pilots, interpreters.

### Campaign 4 — Spice Islands

Adds: piracy, competing European powers, reef navigation, extremely valuable cargo, and the cargo-versus-stores decision at its sharpest.

### Campaign 5 — Circumnavigation

```text
Spain → South America → Strait of Magellan → Pacific
      → Philippines → Indian Ocean → Cape of Good Hope → Spain
```

The final survival challenge.

The Pacific crossing is the payoff of the entire navigation system: the player does not know how wide it is, the error ellipse grows for a hundred days, and the estimate they are steering by was wrong from the second week.

---

## 29. Failure States

- The crew dies.
- The ship sinks.
- Mutiny removes the captain.
- The expedition is stranded with no seaworthy hull.
- The sponsor's objective fails.
- The expedition returns insolvent (§7.3).

Failure rarely means zero progress. Anything that reaches home — charts, logs, a surviving officer, a rumour carried by a rescued sailor — improves the next expedition.

The game should never present a failed expedition without also presenting what it bought.

---

## 30. Success Metrics

```text
Profit
Crew survival
Distance travelled
Chart accuracy
Scientific discoveries
Trade routes established
Political standing
Prestige
Elapsed time
Ship condition on return
```

A merchant expedition might score:

```text
Profit:          A
Crew survival:   C
Discovery:       D
```

A scientific expedition:

```text
Profit:          D
Crew survival:   B
Discovery:       S
```

The sponsor decides which line is the one that counts. The others are the player's own conscience, and the game should show them anyway.

---

## 31. Example Expedition

### Starting State

```text
Location:  Lisbon
Ship:      Caravel, 60 tons
Crew:      25
Water:     22 t   (146 days)
Food/wine: 16 t   (213 days)
Repair:     8 t
Trade:     10 t
Money:     400 ducats
Hull:      100%
Morale:    78%
```

Objective:

> Reach the Cape of Good Hope and return.

### Stage 1 — Cape Verde

18 days. The navigator recommends standing southwest into the open Atlantic rather than following the coast.

The player follows him.

```text
Water:   -18 days   (128 remaining)
Food:    -18 days   (195 remaining)
Morale:  +3%
Position error:  ±40 nm east–west, growing
```

### Stage 2 — The Unknown Current

Day 31. Noon sightings put the ship two degrees further south than the day's reckoning allows.

Something is carrying the ship.

The player records it:

```text
South Atlantic Current
Confidence: 47%
```

The estimate is corrected. The ellipse narrows slightly. It will narrow further if a second expedition confirms it.

### Stage 3 — The Storm

Day 52. The mast is sprung.

```text
Mast:    54%
Hull:    88%
Water:   94 days
Food:    161 days
Position error: ±310 nm east–west
```

Choices: repair at sea, continue slowly, or search for land.

The player searches for land — a gamble that costs unknown days against a water reserve that is now the binding constraint.

### Stage 4 — The Bay

Day 59. Land, and it is not on any chart.

```text
Fresh water source discovered
Safe anchorage discovered
Water:  +52 days  (refilled to 138)
Food:   +9 days   (fish, greens)
Mast repaired: 6 days, 1.5 t timber
Morale: +11%
```

The bay is now on the player's chart. It will be there in every future expedition.

### Stage 5 — The Cape

Day 88. The Cape of Good Hope, and the second half of the problem:

> Return to Lisbon.

The player decides whether to:

- Turn for home now, with a chart worth more than the cargo.
- Push east for a few more weeks of coastline.
- Trade the remaining stores for cargo and gamble the return.

The hull is already fouling. The season is turning. The chart is the best thing aboard.

---

## 32. Main Strategic Trade-Offs

### Cargo vs Survival
```text
More trade goods:   +profit, -range
```

### Speed vs Certainty
```text
Open-ocean route:   -days, +position error, +risk of missing land entirely
```

### Exploration vs Objective
```text
Survey the coast:   +knowledge, +discoveries, -stores, -time, +risk
```

### Crew Size
```text
Large crew:  +work capacity, +fighting strength, -range, -range, -range
```

### Repair vs Continue
```text
Repair:     +ship safety, -time, -stores
Continue:   +time, +compounding failure risk
```

### Certainty vs Time
```text
Run down the latitude:  slow, nearly unloseable
Cut the corner:         fast, and you may not find the land at all
```

---

## 33. Presentation

The game is primarily text and chart, in the Oregon Trail lineage. Three views:

```text
Chart room   The player's own map, error ellipse, planned route
Deck         Daily state: stores, crew, weather, ship, sail set
Log          The written record — events, decisions, discoveries
```

The **log is the artefact**. It is what the player reads back after a disaster and what "returning home with the report" literally means. It should be written well enough to be worth reading.

Everything else can be plain. The chart cannot.

---

## 34. Base Game Development Contract

This document describes more game than is needed to validate the idea. The first release is a small but complete game, not a collection of disconnected prototypes.

> **Scope:** Lisbon → Cape Verde → Cape of Good Hope → Lisbon. One caravel, one royal sponsor, one crew pool, one local campaign state, text plus an interactive chart.

The base game answers one product question:

> **Does planning against an uncertain position create readable, tense, replayable decisions?**

If the answer is no, stop and revise navigation before adding trade, diplomacy, combat, or more geography.

### 34.1 Scenario and Run Objective

The base scenario is historically inspired by a late-15th-century Portuguese Cape expedition, but it is not a reenactment of a named voyage.

```text
Departure:       Lisbon, 1 April 1488
Ship:            one caravel
Crew:            25
Navigator rating: 6/10, fixed for the base game
Sponsor:         Portuguese Crown
Primary goal:    make a recognised landfall in the Cape region
Return goal:     bring the ship or an expedition report back to Lisbon
Optional goal:   improve the chart by confirming water, wind, current, or hazard facts
```

The objective is unlocked only by a **true-position** landfall in the Cape goal region. Passing through the estimated marker does not count. The run remains active until the player returns, is lost, or abandons the objective and returns.

The base game is a campaign of repeatable expeditions. It must support at least three consecutive runs in one campaign, but three is not a cap.

### 34.2 Base-Game Player Actions

At departure the player may:

- Allocate the hold among water, provisions, repair stores, and medicine.
- Retain part of the advance as port money.
- Review the inherited chart and prior reports.

At sea the player may:

- Choose one of 16 compass headings.
- Choose a sailing policy: cautious, standard, or press on.
- Advance one day or advance until interrupted.
- Inspect the chart, deck state, and log at any time.
- Stop to repair, change rations, or turn back.
- Spend a full day on a deliberate east-west observation instead of sailing.
- Respond to an event choice.

At Cape Verde the player may:

- Buy water, provisions, repairs, and medicine from finite port stock.
- Repair the ship and rest the crew.
- Pay 10 ducats for one seeded rumour fact per expedition, recorded at confidence 25.
- Deposit a copy of the expedition report.
- Depart, turn home, or continue south.

At the Cape the player may record the landfall, replenish only when an authored water-source fact permits it, survey, or turn home. A survey spends two full days, consumes stores normally, and creates or strengthens applicable landmark, water, current, and hazard facts. Each landmark grants this survey action once per expedition. If the Cape water source is found and usable, collecting up to 12 t of water takes one full day. There is no full trading port at the Cape in the base game.

### 34.3 Visible State and Hidden State

The normal interface may expose only the following expedition state:

```text
Visible                         Hidden during a run
-------                         -------------------
estimated position              true position
error ellipse                   exact current vector if unknown
observed or charted wind         event random rolls
date and elapsed days           exact event weights
stores and hold use             hidden disease / spoilage pressure
crew health and morale          undiscovered landmark locations
hull, mast, sails, rudder       truth behind unconfirmed rumours
money                           unrevealed future weather
known facts and confidence
```

**CONTRACT:** normal logs, tooltips, save previews, and UI state must not leak hidden values. A developer/debug overlay may show them, but it must be impossible to enable accidentally in a normal campaign.

### 34.4 World and Movement Model

The base map uses a deterministic two-dimensional nautical-mile coordinate system:

```text
x axis: nautical miles east / west
y axis: nautical miles north / south
origin: Lisbon
```

Latitude/longitude labels are presentation. Simulation math uses `x` and `y`; this keeps dead reckoning, distance, landfall, and replay tests unambiguous. Authored coastline, port, current, and wind data use the same coordinate system.

Reference landmark centres for the first authored map are approximate and may be refined before content lock:

```text
Lisbon               (    0,     0) nm
Cape Verde / Santiago(-770, -1430) nm
Cape goal region     (+1660, -4390) nm
```

These coordinates are **TUNING**. Their identifiers, roles, and ordering are **CONTRACT**.

For initial implementation, Lisbon and Cape Verde each use a 15 nm physical landmark radius; the Cape goal uses a 60 nm region radius. Land becomes visible when the distance from true position is no greater than physical radius plus the current sight radius. Authored coastline art does not enlarge this collision geometry.

The caravel's undamaged fair-wind speed is **4 knots = 96 nautical miles per day** before modifiers. Daily commanded movement is:

```text
base daily run
× point-of-sail factor
× sailing-policy factor
× sail-condition factor
× crew-work factor
× weather factor
```

Base point-of-sail factors are 1.00 running or on a broad reach, 0.90 on a beam reach, 0.50 close-hauled, and 0.35 when the selected heading requires automatic tacking within 45 degrees of the wind. Calm gives 0.00. Automatic tacking also multiplies position uncertainty by 1.25. These values are **TUNING**.

The crew-work factor is `min(1, able crew / 14)`. The sail-condition factor is `(mast + sails + rudder) / 300` while all three components are above zero. Weather factors are authored data: fair 1.00, rough 0.75, calm 0.00; a storm resolves through an event rather than an unannounced damage multiplier.

True movement then adds the authored current and weather leeway. Estimated movement uses the crew's logged course and speed plus only currents already known with sufficient confidence.

The actual and logged vectors are not identical even in still water. Each day the run seed produces bounded steering and log errors: up to ±4 degrees of heading and ±10% of distance in fair weather before navigator and weather modifiers. The base navigator multiplier is `1.4 - (0.1 × rating)`, or 0.8 at rating 6. Rough weather may enlarge those bounds through authored data. Bounds and distributions are **TUNING**; seeded imperfect reckoning is **CONTRACT**.

Base sailing policies:

| Policy | Speed | Position uncertainty | Wear/event pressure |
|---|---:|---:|---:|
| Cautious | ×0.80 | ×0.75 | ×0.75 |
| Standard | ×1.00 | ×1.00 | ×1.00 |
| Press on | ×1.15 | ×1.35 | ×1.50 |

The multipliers are **TUNING**, but all three policies and their trade-offs are **CONTRACT**.

The base world contains:

- One authored Atlantic wind field with calm, favourable, contrary, and storm states.
- One hidden South Atlantic current whose vector is omitted from dead reckoning until learned.
- One authored African shelf: a polyline approximating the Atlantic coast of Africa from Portugal to the Cape.
- Weather generated from region, season, previous weather, and the run seed—not independent uncorrelated daily rolls.
- No tactical sailing, collision physics, or spherical-earth route calculation.

The shelf is **CONTRACT** as a line rather than a set of points, because coast-hugging and running down a latitude (§9.5) only work against something the ship can steer into and follow. Its vertices are **TUNING**. The shelf carries no ports, no landmarks, no facts to discover, and no landfall geometry; it is read only by the east-west observation in §34.5, and it never appears on the player's chart.

### 34.5 Navigation and the Error Ellipse

The expedition starts at Lisbon with true and estimated position equal and both ellipse radii at zero.

For each day:

```text
true next position      = true position + commanded movement + true current + leeway
estimated next position = estimate + logged movement + known current
```

The displayed ellipse is a readable uncertainty model, not a claim of exact statistical probability. It has east–west and north–south radii.

```text
Base east–west growth:  +12 nm per day at sea
Base north–south growth: +6 nm per day without a usable sight
```

Navigator, weather, damage, sailing policy, and knowledge multiply this growth as described elsewhere. All radii are clamped to non-negative values.

Observation rules:

- A clear noon sight resets north–south uncertainty to ±15 nm.
- Heavy swell resets it to ±40 nm.
- Overcast permits no reset.
- A recognised landmark resets both axes to the landmark's chart confidence floor: 5 nm for a confirmed base-game landmark, larger for an uncertain one.
- A local fix changes the estimate; it never teleports the true ship.
- Unknown current remains silent until evidence creates or improves a current fact.

**East-west observation.** Longitude has no daily equivalent of the noon sight, so without a deliberate order the east-west radius only ever grows until a recognised landmark fixes it. The player may therefore order a full day of observation instead of a day's sailing. The ship makes no commanded run; current, leeway, and weather still apply, stores are consumed normally, and the noon sight resolves as usual.

The observation reports a **bracket**, never a position. It is resolved from the true distance to the authored African shelf:

```text
true distance to the shelf     result           east-west radius
≤ 300 nm                       shoaling water   capped at 200 nm
≤ 900 nm                       land signs       capped at 600 nm
beyond                         open ocean       unchanged
```

Where a bracket applies, the estimate's east-west coordinate is clamped into the bracket either side of the truth, and the east-west radius is capped at the bracket width. The operation may narrow the radius and may move the estimate; it may never widen the radius, never move the estimate away from the truth, and never move the true ship.

These rules are **CONTRACT**:

- The distances, bracket widths, and any cost beyond the day itself are **TUNING**. The existence of a deliberate, player-ordered, costed east-west channel is not.
- The bracket width disclosed to the player is exactly the east-west radius already drawn on the chart, so the observation reveals nothing the interface does not already show. The amount of the correction and its bound must both be visible and explicable.
- Open ocean returns no correction at all. Repeating the observation offshore must never converge on a longitude, because §9.2 holds: at sea, longitude error only ever grows. The band narrows only as land approaches.
- A fruitless observation is still information, and must be logged as such: it establishes that no known coast lies within the outer distance.
- The observation changes neither sight radius nor landfall geometry. A ship may still pass the objective's charted position and miss it.
- An observation day may recognise a landmark and take its fix, but only a sailing day can arrive home and resolve the run. A day that makes no run cannot complete a voyage.
- Every observation day and its result are recorded in the canonical log and in the after-action report, so a run can be explained afterwards.

The chart automatically records the estimated track. The player does not manually draw coordinate points in the base game.

### 34.6 Landfall, Recognition, and Missing Land

Landfall checks use true position.

```text
Clear-weather sight radius: 20 nm
Poor-weather sight radius:   8 nm
```

These are **TUNING** values. A landmark interrupts travel when its true geometry enters sight radius. Recognition then depends on the chart fact, visibility, and whether the approach resembles the recorded bearing.

Possible results are:

- **Recognised landfall:** position estimate is corrected and the landmark fact gains confidence.
- **Unrecognised landfall:** land is visible, but the player must survey, ask locally, or depart without a full fix.
- **Missed landfall:** the ship passes outside true sight radius even if the estimated track crosses the chart symbol.
- **False destination:** the ship reaches the charted area of an inaccurate rumour and finds nothing; time and stores are still spent.

The player may see true and estimated tracks together only on the completed run's after-action chart. Starting the next expedition hides truth again.

### 34.7 Stores, Hold, and Outfitting

The caravel has a 60-ton hold. Eight tons are permanently occupied by mission equipment, casks, boats, tools, and ballast, leaving 52 tons allocatable by the player.

```text
Daily water use:       crew × 0.006 t
Daily provision use:   crew × 0.003 t
Combined rule:         crew × days × 0.009 t
```

Base outfitting caps and starting prices:

| Store | Capacity cap | Lisbon price | Purpose |
|---|---:|---:|---|
| Water | 24 t | 2 ducats/t | survival; cannot be rationed below safe use without health cost |
| Provisions | 18 t | 4 ducats/t | food and wine combined |
| Repair stores | 8 t | 16 ducats/t | repairs to four ship components |
| Medicine | 2 t | 40 ducats/t | improves selected health/event outcomes |

The sponsor provides 300 ducats after ship and crew costs. Unspent money travels without hold mass and is available at Cape Verde. Prices, caps, and advance are **TUNING**; capacity conservation and payment are **CONTRACT**.

Cape Verde has one finite stock allocation per expedition; leaving and returning does not refresh it:

| Store/service | Available | Price |
|---|---:|---:|
| Water | 24 t | 3 ducats/t |
| Provisions | 12 t | 6 ducats/t |
| Repair stores | 4 t | 20 ducats/t |
| Medicine | 0.5 t | 60 ducats/t |
| Rest ashore | — | 5 ducats/day |

One day resting ashore still consumes normal stores and gives +4 morale and +2 health, capped at 100. Store quantities, prices, and recovery are **TUNING**.

Ration policies are explicit commands:

| Policy | Water use | Provision use | Daily consequence |
|---|---:|---:|---|
| Normal | ×1.00 | ×1.00 | none |
| Reduced water | ×0.75 | ×1.00 | -3 health, -2 morale |
| Reduced provisions | ×1.00 | ×0.50 | -1 health, -2 morale |

Ration consequences apply after consumption on every day the policy is active. The two reductions may be combined. The player cannot select a lower rate in the base game.

Rules and invariants:

- Allocated cargo plus the fixed eight tons may never exceed 60 tons.
- Stores and money may reach zero but never become negative.
- Consumption is based on the living crew at the beginning of the day.
- A port transaction is atomic: stock, money, and hold update together or not at all.
- Rounding is display-only. Simulation stores mass with at least kilogram precision.
- Spoilage changes usable quantity or quality; it may not create mass.

Water and provisions are stored as dated batches and consumed oldest first. After 45 days, each provision batch loses 0.1% of its remaining usable mass per day. Old water does not lose mass automatically; after 45 days it increases the weight of sour-water events. These are **TUNING** values and must be visible through warnings before they become severe.

At 25 crew, four uneventful days consume exactly 0.600 t water and 0.300 t provisions.

### 34.8 Crew, Ship, Repair, and Failure

Base crew state:

```text
Crew count:     25 at departure
Able crew:      25 at departure; crew count minus event-incapacitated hands
Crew health:    0–100 pooled condition, starts at 100
Crew morale:    0–100 pooled condition, starts at 75
Minimum hands:  8 to make way under sail
```

The base game models only four ship components, each from 0–100:

```text
Hull   Mast   Sails   Rudder
```

All four components start at 100. Fouling is separate from component condition: each tropical day reduces the speed factor by 0.05 percentage points, to a maximum 15% loss. Careening at Cape Verde takes six full days and resets fouling; it still consumes stores and may trigger eligible port events.

Rigging, cannons, storage, and navigation equipment from §13 are full-game systems. In the base game, damage to ropes or instruments is represented through events or modifiers rather than additional component bars.

Base failure contracts:

- Hull at 0 ends the run as ship lost, but hull-threatening damage must be foreshadowed.
- Mast, sails, or rudder at 0 stops normal travel and opens repair, distress, or abandonment choices; it is not an instant loss.
- Fewer than eight able crew leaves the ship stranded unless an authored rescue or port outcome applies.
- Crew health at 0 ends the run as the crew unable to continue; the text must not claim every person died unless an event established that.
- Mutiny may end a run only after the staged warning process in §15.1.
- Voluntary return and objective abandonment remain available whenever the ship can sail.

Zero-store pressure is gradual and always warned:

```text
No water:       prominent warning, then -20 health and -10 morale per day
No provisions:  prominent warning, then -5 health and -3 morale per day
```

One at-sea repair day spends 0.25 t repair stores and restores 5 points to one chosen component. One port repair day spends 0.5 t and restores 15 points. Repair days consume stores and may receive weather or event interruptions, but produce no travel. Condition is capped at 100.

Medicine has no general “heal” button. It is spent only through event choices or port care whose text states the health effect. This prevents it from becoming an interchangeable extra health bar.

Repair rates and damage magnitudes are **TUNING** and must be data-defined. The requirements to spend time, target one component, and cap condition are **CONTRACT**.

### 34.9 Events and Content Contract

An event is data with a stable identifier, not logic embedded only in interface text.

Minimum event record:

```text
id
title and log text
hard gates
weight modifiers
cooldown / once-per-leg flag
warning stage, if potentially terminal
2–4 choices
choice requirements
immediate state changes
delayed flags or follow-ups
knowledge revealed or confidence changed
```

The base game ships with at least 20 authored events across all of these groups:

| Group | Required examples |
|---|---|
| Weather | falling glass, squall, major storm, calm, contrary wind |
| Stores | leaking cask, sour water, spoiled provisions, rats |
| Ship | sprung mast, torn sail, rudder strain, hull leak |
| Crew | fatigue, injury, scurvy symptoms, grumbling/mutiny warning |
| Navigation/discovery | current discrepancy, birds or vegetation, false land, unknown anchorage |

At least:

- Four events must have delayed consequences.
- Four must use prior player decisions or expedition state in later text/outcomes.
- Four must be avoidable or softened by preparation.
- Three must create or update a knowledge fact.
- No event may violate §22.2.

At most one choice event is presented per day. The daily event chance and weights are **TUNING**; the seeded selection procedure in §22.1 is **CONTRACT**.

### 34.10 Knowledge, Reports, and Campaign Persistence

Knowledge is stored as facts, not as permanently revealed map pixels.

Minimum fact record:

```text
stable fact id and type
location or affected region
claimed value
source
confidence 0–100
observed date
reported date, if any
status: rumoured / observed / confirmed / disproved
```

Base confidence interpretation:

```text
0–39    rumoured; visible as uncertain information, not used automatically
40–69   observed; usable for player judgement, not used for automatic current correction
70–100  confirmed; eligible for automatic navigation correction where applicable
```

The starting campaign knows Lisbon at confidence 100, Cape Verde and its port at 90, and only a broad Cape goal region at 25. It has no South Atlantic current fact.

When a recognised landfall reveals at least 50 nm of sustained east–west discrepancy after five or more days without a fix, the game records an observed current hypothesis at confidence 40. A matching survey or authored current cue adds 20; independent confirmation on a later expedition adds 25, to a cap of 95. A conflicting observation may lower confidence or disprove the claim. These increments are **TUNING**; the thresholds and need for evidence are **CONTRACT**.

Persistence rule:

- Returning to Lisbon reports every eligible fact in the carried log.
- Depositing a report at Cape Verde creates a snapshot of eligible facts known at that moment.
- If the ship is later lost, only the last deposited snapshot persists.
- Unreported observations disappear with the expedition.
- A disproved rumour remains on record as disproved; it is not silently deleted.
- Starting a new expedition loads only reported facts and prior run summaries, never hidden truth.

This report-deposit rule is the base game's implementation of “failure can still buy knowledge.” Lifeboats, passing ships, caches, and surviving officers are deferred.

### 34.11 Run Outcomes and After-Action Report

Every run ends with exactly one primary outcome:

```text
Full success       Cape recognised and ship returns to Lisbon
Report success     Cape recognised; ship lost; deposited report proves useful progress
Partial return     Ship returns without recognising the Cape
Objective failure  Ship/report lost or expedition otherwise terminated
```

The after-action report must show:

- Outcome and reason.
- Crew and ship condition.
- Days elapsed and stores consumed.
- Objective status.
- Facts observed, reported, disproved, and lost with the ship.
- Estimated track versus true track, with the hidden current's contribution explained only where evidence supports it.
- Every east-west observation day: when it was spent, what it returned, and what it did to the east–west radius.
- Differences that will appear in the next expedition.

Profit, letter grades, market saturation, debt, and multiple sponsor scoring are not base-game requirements.

### 34.12 Save, Replay, and Determinism

The simulation uses a named pseudo-random seed per run.

**CONTRACT:** given the same content version, starting campaign state, run seed, and ordered player commands, the game must produce the same daily states, events, event outcomes, facts, and final report.

Additional rules:

- Random draws come from the simulation, never from rendering or animation code.
- Random draw order is stable and documented; adding a visual effect cannot change outcomes.
- Mutable state is serialisable at every committed day boundary and at every player-choice interrupt.
- Saving and resuming must produce the same result as uninterrupted play.
- A replay record contains the content version, seed, starting-state hash, and ordered commands.
- Content changes that alter deterministic outcomes increment the content version.

Determinism is for reproducibility and debugging. The player does not choose or see the seed by default.

### 34.13 Base-Game Screens

Only four product screens are required:

1. **Outfitting:** inherited knowledge, hold allocation, money, projected range, depart.
2. **Expedition:** chart room plus compact deck state; daily advance and heading/policy controls.
3. **Interrupt:** event, landfall, repair, or port choice with costs and known consequences.
4. **After-action report:** outcome, log summary, truth comparison, and persisted knowledge.

The Chart, Deck, and Log views from §33 may be tabs or panels inside the Expedition screen. The exact layout is not a contract.

Accessibility requirements for the base game:

- Error and confidence cannot be communicated by colour alone.
- Every chart symbol has text or tooltip identification.
- Day advance is operable without precise pointer input.
- Animation speed can be reduced or skipped.
- The written log remains usable if chart animation is disabled.

### 34.14 Explicit Scope Boundary

In the base game:

```text
day tick and deterministic command resolution
outfitting with hold and money constraints
true position, estimate, error ellipse, noon sights, landmark fixes
deliberate east-west observation days against one authored shelf
one authored wind field and one initially hidden current
water, provisions, repair stores, medicine
pooled crew health and morale
hull, mast, sails, rudder
Cape Verde port and report deposit
Cape landfall and optional water-source discovery
fouling and spoilage on the return
20+ authored events
after-action truth comparison
persistent reported knowledge across 3+ runs
save, resume, and deterministic replay data
```

Not in the base game:

```text
multiple ships or consorts
individual officers, loyalty, recruitment, or veteran persistence
full disease model or disease subtypes
combat, guns, pirates as tactical encounters, conquest
trade cargo, market simulation, wages, shares, debt
multiple sponsors or objectives
diplomacy, factions, local-relation simulation
manual cartography
procedural world geography
campaigns beyond the Cape route
lifeboats, caches, passing-ship reports, or rival simulation
multiplayer, accounts, cloud saves, or online services
```

Broader sections remain design direction for later releases. They do not authorise pulling those systems into base-game work.

### 34.15 Acceptance Gates

The base game is ready for evaluation only when all of these pass:

1. **Mass:** 25 crew over four uneventful days consume exactly 0.600 t water and 0.300 t provisions.
2. **Capacity:** no outfitting or port transaction can exceed 60 t, overspend money, exceed port stock, or create negative resources.
3. **Hidden truth:** a normal run exposes no true-position or unknown-current values before the after-action report.
4. **Drift:** with an unknown current, true and estimated tracks diverge; once the current fact is sufficiently learned, later estimates account for it.
5. **Latitude:** a clear noon sight narrows north–south uncertainty without erasing east–west uncertainty.
5a. **Longitude:** an observation day near the shelf measurably narrows east–west uncertainty and says so in the log; the same order repeated in open ocean narrows nothing, however many days are spent on it.
6. **Landfall:** a ship can miss Cape Verde or the Cape because its true position is outside sight radius even when its estimate reaches the chart symbol.
7. **Fix:** a recognised landmark corrects the estimate and updates fact confidence.
8. **Warnings:** water loss, ship loss, crew incapacity, and mutiny cannot terminate a run without a visible prior warning and an available response.
9. **Reports:** a loss after depositing at Cape Verde persists only the deposited knowledge snapshot; a safe return persists all eligible carried facts.
10. **Determinism:** two runs with identical version, state, seed, and commands produce byte-equivalent canonical daily-state and event logs.
11. **Resume:** save/resume at a day boundary and at an event choice produces the same final state as uninterrupted play.
12. **Progression:** a second and third expedition visibly inherit reported knowledge but not hidden truth or lost observations.
13. **Complete loop:** the player can outfit, depart, reach or abandon the Cape objective, return or fail, read the report, and begin another expedition without developer intervention.
14. **Usability:** a normal Cape attempt can be completed in approximately 45–90 minutes, and five uneventful days can resolve in under five seconds on the target development machine. Both are **TUNING** targets, not simulation shortcuts.
15. **Content:** all 20+ events pass their gates, never present an unaffordable choice as available, and write coherent log entries.

The navigation question is evaluated only after these gates pass. A broken or incomplete loop is not evidence that the central mechanic failed.

### 34.16 Recommended Development Sequence

Each package stops at its gate; later packages must not be pulled forward merely because their full-game design already exists.

```text
WP0  Deterministic headless rules
     Day transaction, state model, seeded randomness, movement, consumption,
     canonical logs, save/replay contract.

WP1  Navigable expedition
     Heading and policy, wind/current, estimate and ellipse, observations,
     landmark sight and fixes, minimal debug chart.

WP2  Survival decisions
     Outfitting, stores, port stock, crew pools, four ship components,
     repair, fouling, spoilage, warning/terminal rules.

WP3  Authored journey
     Cape Verde, Cape goal, 20+ events, log writing, run outcomes.

WP4  Knowledge campaign
     Fact confidence, Cape Verde report snapshot, persistence, after-action
     truth comparison, second/third expedition flow.

WP5  Player-facing base game
     Four screens, pacing, accessibility, balance, acceptance run evidence.
```

Technology stack, framework, art pipeline, and repository architecture are intentionally not chosen in this design document. They should be decided in a separate technical plan after the product contract is accepted.

---

## 35. Resolved and Open Design Questions

### 35.1 Resolved for the Base Game

- **Long quiet legs:** the player can advance one day or until interruption; silent days compress, but every day still resolves.
- **True position:** hidden during play and revealed beside the estimate in the after-action report.
- **Consorts:** not in the base game.
- **Chart plotting:** automatic in the base game; manual plotting remains a possible later mode.
- **Failure with a report:** tested through the explicit Cape Verde report-deposit snapshot.
- **Trade:** excluded from the base game so the navigation question is not obscured.

### 35.2 Questions the Base Game Must Answer with Evidence

- Does the ellipse help players form decisions, or does it feel like decorative probability?
- Can players explain why a landfall was missed after seeing the after-action chart?
- Does depositing a report make partial progress feel earned rather than consolatory?
- How many uninterrupted days feel tense before they become passive waiting?
- After three runs, does inherited knowledge create confidence without removing the need to decide?

### 35.3 Deferred Full-Game Questions

- Are consorts worth their simulation and interface cost?
- Should manual plotting be an advanced mode?
- How should knowledge decay compete with permanent physical discoveries?
- Which trade, diplomacy, and officer systems add pressure without diluting navigation?
- How should later campaigns represent different maritime knowledge traditions rather than treating the European model as universal?

---

## 36. Core Design Principle

The most important resource is:

### Knowledge

The player begins with questions:

```text
Where is land?
How far away is it?
Which winds work, and when?
Where is fresh water?
Which ports are safe?
Which goods are valuable?
When does the monsoon change?
Which of my maps are lying to me?
Where am I?
```

Every expedition converts risk into information.

```text
Unknown world
      ↓
Exploration
      ↓
Partial knowledge
      ↓
Repeated expeditions
      ↓
Reliable routes
      ↓
Navigable world
```

This gives the game an identity beyond:

> "Oregon Trail with ships."

The central experience is:

> **Build knowledge through dangerous expeditions until the unknown world becomes understandable.**

And the reason it works is that the first thing the player is uncertain about is not the world.

It is where they are standing.
