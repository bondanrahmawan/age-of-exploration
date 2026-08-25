import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { HEADINGS, type Heading } from "../../src/index.js";
import type { ObservedWindViewModel, PointOfSailViewModel } from "../view-model.js";
import { pointOfSailFor } from "../view-model.js";

const POINT_DEGREES = 360 / HEADINGS.length;

/** Compass bearing of a named point, measured clockwise from north. */
export function bearingFor(heading: Heading): number {
  return HEADINGS.indexOf(heading) * POINT_DEGREES;
}

/** Screen coordinates of a bearing, with north drawn up the page. */
export function polar(cx: number, cy: number, radius: number, bearing: number): { readonly x: number; readonly y: number } {
  const radians = (bearing - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function wedgePath(cx: number, cy: number, inner: number, outer: number, from: number, to: number): string {
  const outerStart = polar(cx, cy, outer, from);
  const outerEnd = polar(cx, cy, outer, to);
  const innerEnd = polar(cx, cy, inner, to);
  const innerStart = polar(cx, cy, inner, from);
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outer} ${outer} 0 0 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${inner} ${inner} 0 0 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

const FEATHERS: Readonly<Record<ObservedWindViewModel["strength"], number>> = {
  calm: 0,
  moderate: 1,
  strong: 2,
};

/**
 * Wind drawn the way a chart draws it: the shaft lies along the line the wind travels, the head
 * shows which way it pushes the ship, and the feathers on the upwind tail count its strength.
 * A bare compass letter leaves "from NE" ambiguous; an arrow with a tail does not.
 */
export function WindArrow({ cx, cy, fromBearing, strength, innerRadius, outerRadius, scale = 1 }: {
  readonly cx: number;
  readonly cy: number;
  readonly fromBearing: number;
  readonly strength: ObservedWindViewModel["strength"];
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly scale?: number;
}) {
  const head = 9 * scale;
  const spread = 4.2 * scale;
  const featherLength = 8 * scale;
  const featherStep = 7 * scale;
  const feathers = Array.from({ length: FEATHERS[strength] }, (_, index) => {
    const y = -outerRadius + 2 * scale + index * featherStep;
    return `M 0 ${y.toFixed(2)} L ${featherLength.toFixed(2)} ${(y + featherStep * .85).toFixed(2)}`;
  });
  const strokes = [
    `M 0 ${(-outerRadius).toFixed(2)} L 0 ${(-innerRadius).toFixed(2)}`,
    `M ${-spread.toFixed(2)} ${(-innerRadius - head).toFixed(2)} L 0 ${(-innerRadius).toFixed(2)} L ${spread.toFixed(2)} ${(-innerRadius - head).toFixed(2)}`,
    ...feathers,
  ];
  return (
    <g class="wind-arrow" transform={`translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${fromBearing.toFixed(2)})`}>
      {strokes.map((stroke) => <path key={`halo-${stroke}`} d={stroke} class="wind-halo" />)}
      {strokes.map((stroke) => <path key={stroke} d={stroke} class="wind-ink" />)}
    </g>
  );
}

const CENTRE = 100;
const HUB_RADIUS = 42;
const BAND_INNER = 46;
const BAND_OUTER = 76;
const LETTER_RADIUS = 88;
const WIND_OUTER = 96;
/** The wind flies right across the rose to the hub, so it reads as weather crossing the ship
 *  rather than a tick on the rim, and it visibly lies over the wedges it makes unsailable. */
const WIND_INNER = 50;

const CARDINALS = ["N", "E", "S", "W"] as const;

/**
 * The heading control, drawn as the instrument it stands for. Sixteen wedges are shaded by the
 * point of sail each heading would give against the wind last observed, so the three-to-one speed
 * penalty for steering too near the wind is visible before the day is spent rather than after.
 */
export function HeadingRose({ heading, wind, pointOfSail, headings, onSelect }: {
  readonly heading: Heading;
  readonly wind: ObservedWindViewModel;
  readonly pointOfSail: PointOfSailViewModel;
  readonly headings: readonly Heading[];
  readonly onSelect: (heading: Heading) => void;
}) {
  const [hovered, setHovered] = useState<Heading | null>(null);
  const wedges = useRef(new Map<Heading, SVGGElement>());
  const pendingFocus = useRef<Heading | null>(null);

  useEffect(() => {
    const wanted = pendingFocus.current;
    pendingFocus.current = null;
    if (wanted !== null) wedges.current.get(wanted)?.focus();
  });

  const select = (next: Heading, refocus: boolean) => {
    if (refocus) pendingFocus.current = next;
    if (next !== heading) onSelect(next);
  };

  const step = (delta: number) => {
    const index = headings.indexOf(heading);
    const next = headings[(index + delta + headings.length) % headings.length];
    if (next !== undefined) select(next, true);
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") step(1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") step(-1);
    else if (event.key === "Home") select("N", true);
    else if (event.key === " " || event.key === "Enter") return;
    else return;
    event.preventDefault();
  };

  const shown = hovered ?? heading;
  const shownSail = hovered === null ? pointOfSail : pointOfSailFor(hovered, wind.fromHeading);
  const courseEnd = polar(CENTRE, CENTRE, BAND_OUTER - 4, bearingFor(heading));
  const windBearing = wind.fromHeading === null ? null : bearingFor(wind.fromHeading);

  return (
    <div class="heading-rose">
      <svg
        class="rose-dial"
        viewBox="0 0 200 200"
        role="radiogroup"
        aria-label="Heading"
        aria-describedby="rose-readout"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHovered(null)}
      >
        <title>Compass rose for setting the ship’s heading</title>
        <desc>
          Each of the sixteen compass points can be chosen as the heading. Points are shaded by how
          well the ship would sail them against the {wind.text}: the darkest wedges run before the
          wind at full pace, and the wedges nearest the wind force the ship to beat back and forth
          at about a third of her pace.
        </desc>
        <circle cx={CENTRE} cy={CENTRE} r={BAND_OUTER} class="rose-face" />
        {headings.map((point) => {
          const sail = pointOfSailFor(point, wind.fromHeading);
          const bearing = bearingFor(point);
          const chosen = point === heading;
          return (
            <g
              key={point}
              ref={(node) => { if (node === null) wedges.current.delete(point); else wedges.current.set(point, node); }}
              class="rose-point"
              role="radio"
              aria-checked={chosen}
              aria-label={`${point} — ${sail.label}`}
              tabIndex={chosen ? 0 : -1}
              onClick={() => select(point, true)}
              onMouseEnter={() => setHovered(point)}
              onFocus={() => setHovered(point)}
              onBlur={() => setHovered(null)}
            >
              <path
                d={wedgePath(CENTRE, CENTRE, BAND_INNER, BAND_OUTER, bearing - POINT_DEGREES / 2, bearing + POINT_DEGREES / 2)}
                class={`rose-wedge quality-${sail.quality}`}
              />
            </g>
          );
        })}
        <g aria-hidden="true" class="rose-furniture">
          {/* Wind first, so a compass letter under the shaft still reads through its halo. */}
          {windBearing !== null
            ? <WindArrow cx={CENTRE} cy={CENTRE} fromBearing={windBearing} strength={wind.strength} innerRadius={WIND_INNER} outerRadius={WIND_OUTER} />
            : <circle cx={CENTRE} cy={CENTRE} r={BAND_OUTER + 10} class="rose-becalmed" />}
          {CARDINALS.map((cardinal) => {
            const at = polar(CENTRE, CENTRE, LETTER_RADIUS, bearingFor(cardinal));
            return <text key={cardinal} x={at.x} y={at.y + 5} text-anchor="middle" class="rose-cardinal">{cardinal}</text>;
          })}
          <line x1={CENTRE} y1={CENTRE} x2={courseEnd.x} y2={courseEnd.y} class="rose-course" />
          <circle cx={CENTRE} cy={CENTRE} r={HUB_RADIUS} class="rose-hub" />
          <text x={CENTRE} y={CENTRE + 2} text-anchor="middle" class={hovered === null ? "rose-heading" : "rose-heading rose-preview"}>{shown}</text>
          <text x={CENTRE} y={CENTRE + 22} text-anchor="middle" class="rose-sail">{shownSail.label}</text>
        </g>
      </svg>
      <p class="rose-readout" id="rose-readout">
        {wind.fromHeading === null
          ? "No wind observed — the rose cannot say which heading sails best."
          : <>Wind from <strong>{wind.fromHeading}</strong>, {wind.strength}</>}
      </p>
    </div>
  );
}
