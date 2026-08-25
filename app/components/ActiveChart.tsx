import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import type { ChartLandmarkViewModel, ChartPointViewModel, ChartViewModel } from "../view-model.js";
import { WindArrow, bearingFor, polar } from "./CompassRose.js";

interface PlotBox {
  readonly width: number;
  readonly height: number;
}

interface PlotTransform {
  readonly x: (value: number) => number;
  readonly y: (value: number) => number;
  readonly xScale: number;
  readonly yScale: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly chrome: ReturnType<typeof chromeFor>;
}

const FALLBACK_BOX: PlotBox = { width: 800, height: 500 };
const NICE_STEPS_NM = [25, 50, 100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000] as const;

/** Chart furniture is sized from the pane, so a short cockpit panel never crowds out the sea. */
function chromeFor(box: PlotBox) {
  const tight = box.height < 340 || box.width < 620;
  return {
    // Blank paper outside the chart border, and nothing is drawn in it: the tick labels and the scale
    // bar live inside, in the gutters below. It was wide enough to read as a mount around a smaller
    // map. Enough is kept to hold the border clear of the panel's own padding, and the rest goes to
    // the sea, which grows on every side because the gutters are measured in from this edge.
    frame: tight ? 4 : 8,
    left: tight ? 34 : 62,
    right: tight ? 12 : 30,
    top: tight ? 12 : 30,
    bottom: tight ? 30 : 54,
    ticksX: tight ? 4 : 9,
    ticksY: tight ? 3 : 6,
    tight,
  };
}

/** Presentation-only measurement: the chart claims its whole pane instead of letterboxing a fixed box. */
function usePlotBox(ref: RefObject<HTMLDivElement>): PlotBox {
  const [box, setBox] = useState<PlotBox>(FALLBACK_BOX);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect;
      if (measured === undefined || measured.width < 40 || measured.height < 40) return;
      setBox({ width: Math.round(measured.width), height: Math.round(measured.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

/**
 * One nautical mile is the same length on both axes, so the grid reads as square sea and a single
 * scale bar is true in every direction. The window is centred on the content and then widened on
 * whichever axis has slack, rather than stretched to fill the pane.
 */
function transformFor(
  points: readonly ChartPointViewModel[],
  extraNm: number,
  box: PlotBox,
): PlotTransform {
  const xs = points.map((point) => point.xNm);
  const ys = points.map((point) => point.yNm);
  const centreX = xs.length === 0 ? 0 : (Math.min(...xs) + Math.max(...xs)) / 2;
  const centreY = ys.length === 0 ? 0 : (Math.min(...ys) + Math.max(...ys)) / 2;
  const spreadX = xs.length === 0 ? 0 : (Math.max(...xs) - Math.min(...xs)) / 2;
  const spreadY = ys.length === 0 ? 0 : (Math.max(...ys) - Math.min(...ys)) / 2;
  const chrome = chromeFor(box);
  const left = chrome.frame + chrome.left;
  const right = box.width - chrome.frame - chrome.right;
  const top = chrome.frame + chrome.top;
  const bottom = box.height - chrome.frame - chrome.bottom;
  const spanX = Math.max(60, right - left);
  const spanY = Math.max(60, bottom - top);
  const neededX = Math.max(100, spreadX + extraNm);
  const neededY = Math.max(100, spreadY + extraNm);
  const scale = Math.min(spanX / (neededX * 2), spanY / (neededY * 2));
  const halfX = spanX / 2 / scale;
  const halfY = spanY / 2 / scale;
  const minX = centreX - halfX;
  const minY = centreY - halfY;
  return {
    x: (value) => left + (value - minX) * scale,
    y: (value) => bottom - (value - minY) * scale,
    xScale: scale,
    yScale: scale,
    minX,
    maxX: centreX + halfX,
    minY,
    maxY: centreY + halfY,
    left,
    right,
    top,
    bottom,
    chrome,
  };
}

/** Grid intervals are chosen so every ruled line stands for a round number of nautical miles. */
function gradations(from: number, to: number, targetLines: number): readonly number[] {
  const span = to - from;
  const step = NICE_STEPS_NM.find((candidate) => span / candidate <= targetLines) ?? NICE_STEPS_NM.at(-1)!;
  const first = Math.ceil(from / step) * step;
  const marks: number[] = [];
  for (let value = first; value <= to; value += step) marks.push(Math.round(value));
  return marks;
}

interface PlacedLandmark {
  readonly landmark: ChartLandmarkViewModel;
  readonly x: number;
  readonly y: number;
  readonly labelY: number;
  readonly offChart: boolean;
  readonly distanceNm: number;
  readonly bearing: string;
}

/**
 * A working chart is drawn around the ship, not around the whole ocean. Landmarks outside the
 * window are pinned to the edge with their distance so a rumoured goal 4,000 nm away cannot
 * squash the water the player is actually sailing in.
 */
function placeLandmarks(
  landmarks: readonly ChartLandmarkViewModel[],
  transform: PlotTransform,
  from: ChartPointViewModel,
): readonly PlacedLandmark[] {
  const taken: { x: number; y: number }[] = [];
  const reach = (transform.right - transform.left) * (transform.chrome.tight ? 1 : 0.35);
  return landmarks.map((landmark) => {
    const insideX = landmark.xNm >= transform.minX && landmark.xNm <= transform.maxX;
    const insideY = landmark.yNm >= transform.minY && landmark.yNm <= transform.maxY;
    const eastWest = landmark.xNm - from.xNm;
    const northSouth = landmark.yNm - from.yNm;
    const distanceNm = Math.round(Math.hypot(eastWest, northSouth));
    const vertical = northSouth >= 0 ? "N" : "S";
    const horizontal = eastWest >= 0 ? "E" : "W";
    const bearing = Math.abs(northSouth) >= Math.abs(eastWest) * 2
      ? vertical
      : Math.abs(eastWest) >= Math.abs(northSouth) * 2 ? horizontal : `${vertical}${horizontal}`;
    const x = transform.x(Math.min(transform.maxX, Math.max(transform.minX, landmark.xNm)));
    const y = transform.y(Math.min(transform.maxY, Math.max(transform.minY, landmark.yNm)));
    let labelY = y + 5;
    while (taken.some((mark) => Math.abs(mark.x - x) < reach && Math.abs(mark.y - labelY) < 15)) labelY += 16;
    taken.push({ x, y: labelY });
    return { landmark, x, y, labelY, offChart: !insideX || !insideY, distanceNm, bearing };
  });
}

function scaleBarNm(transform: PlotTransform): number {
  const usable = (transform.right - transform.left) * 0.24;
  return NICE_STEPS_NM.find((candidate) => candidate * transform.xScale >= usable) ?? NICE_STEPS_NM.at(-1)!;
}

function pointsAttribute(points: readonly ChartPointViewModel[], transform: PlotTransform): string {
  return points.map((point) => `${transform.x(point.xNm).toFixed(1)},${transform.y(point.yNm).toFixed(1)}`).join(" ");
}

function ChartFrame({ transform, box }: { readonly transform: PlotTransform; readonly box: PlotBox }) {
  const { chrome } = transform;
  const eastWest = gradations(transform.minX, transform.maxX, chrome.ticksX);
  const northSouth = gradations(transform.minY, transform.maxY, chrome.ticksY);
  const bar = scaleBarNm(transform);
  const barWidth = bar * transform.xScale;
  const barX = transform.left;
  const barY = transform.bottom + (chrome.tight ? 24 : 40);
  const tickY = transform.bottom + (chrome.tight ? 13 : 18);
  return (
    <>
      <rect
        x={chrome.frame}
        y={chrome.frame}
        width={Math.max(40, box.width - chrome.frame * 2)}
        height={Math.max(40, box.height - chrome.frame * 2)}
        rx={chrome.tight ? 6 : 10}
        class="chart-water"
      />
      {eastWest.map((value) => (
        <g key={`gx-${value}`}>
          <line x1={transform.x(value)} y1={transform.top} x2={transform.x(value)} y2={transform.bottom} class="chart-grid" />
          <text x={transform.x(value)} y={tickY} text-anchor="middle" class="chart-tick">{value}</text>
        </g>
      ))}
      {northSouth.map((value) => (
        <g key={`gy-${value}`}>
          <line x1={transform.left} y1={transform.y(value)} x2={transform.right} y2={transform.y(value)} class="chart-grid" />
          <text x={transform.left - 7} y={transform.y(value) + 4} text-anchor="end" class="chart-tick">{value}</text>
        </g>
      ))}
      {!chrome.tight && <text x={transform.left - 10} y={transform.top - 11} text-anchor="end" class="chart-axis">nm N/S</text>}
      {!chrome.tight && <text x={transform.right} y={transform.bottom + 44} text-anchor="end" class="chart-axis">Same scale on both axes</text>}
      {!chrome.tight && (
        <g class="compass" aria-hidden="true">
          <line x1={transform.right - 16} y1={transform.top + 34} x2={transform.right - 16} y2={transform.top - 2} class="compass-needle" />
          <path d={`M${transform.right - 16},${transform.top - 10} l6,14 l-12,0 z`} class="compass-head" />
          <text x={transform.right - 16} y={transform.top + 48} text-anchor="middle" class="chart-axis">N</text>
        </g>
      )}
      <g class="scale-bar" aria-hidden="true">
        <line x1={barX} y1={barY} x2={barX + barWidth} y2={barY} class="scale-rule" />
        <line x1={barX} y1={barY - 5} x2={barX} y2={barY + 5} class="scale-rule" />
        <line x1={barX + barWidth} y1={barY - 5} x2={barX + barWidth} y2={barY + 5} class="scale-rule" />
          <text x={barX + barWidth + 8} y={barY + 4} class="chart-axis">{bar} {chrome.tight ? "nm" : "nautical miles"}</text>
      </g>
    </>
  );
}

export function ActiveChart({ chart }: { readonly chart: ChartViewModel }) {
  const pane = useRef<HTMLDivElement>(null);
  const box = usePlotBox(pane);
  const working = Math.max(chart.uncertaintyEastWestNm, chart.uncertaintyNorthSouthNm) * 1.9;
  const transform = transformFor(
    [...chart.estimatedTrack, chart.estimatedPosition],
    Math.max(130, working),
    box,
  );
  const placed = placeLandmarks(chart.knownLandmarks, transform, chart.estimatedPosition);
  const estimateX = transform.x(chart.estimatedPosition.xNm);
  const estimateY = transform.y(chart.estimatedPosition.yNm);
  const origin = chart.estimatedTrack[0];
  const courseBearing = bearingFor(chart.heading);
  const courseEnd = polar(estimateX, estimateY, 52, courseBearing);
  const sternPoint = polar(estimateX, estimateY, 26, courseBearing + 180);
  /** The label trails astern of the marker, pushed further the way the stern already lies. */
  const sternLabel = {
    x: sternPoint.x,
    y: sternPoint.y + (sternPoint.y < estimateY ? -6 : 14),
    anchor: Math.abs(sternPoint.x - estimateX) < 1 ? "middle" : sternPoint.x < estimateX ? "end" : "start",
  };
  const windLabel = chart.wind.fromHeading === null
    ? { x: estimateX, y: estimateY }
    : polar(estimateX, estimateY, 76, bearingFor(chart.wind.fromHeading));
  return (
    <section class="chart-shell" aria-label="Chart room: estimated Atlantic position">
      <div class="chart-pane" ref={pane}>
        <p class="uncertainty-readout">
          <span>Position is estimated</span>
          The ship could be up to ±{chart.uncertaintyEastWestNm.toFixed(0)} nm east–west and
          ±{chart.uncertaintyNorthSouthNm.toFixed(0)} nm north–south of this mark.
        </p>
        <svg
          class="chart"
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-labelledby="active-chart-svg-title active-chart-svg-desc"
        >
          <title id="active-chart-svg-title">Chart of the ship’s estimated position</title>
          <desc id="active-chart-svg-desc">
            The marker is the crew's estimate of where the ship is, not its true position. The dotted line is the
            estimated track and the hatched ellipse is the uncertainty around the estimate, not a coastline.
            The plain arrow from the marker is the heading being steered; the feathered arrow is the observed wind,
            drawn flying from the compass point it blows out of.
            Grid lines are ruled in nautical miles east–west and north–south. Known chart symbols have visible
            labels and can receive keyboard focus.
          </desc>
          <defs>
            <pattern id="uncertainty-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="9" class="hatch-line" />
            </pattern>
            <marker id="heading-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" class="heading-arrow" />
            </marker>
          </defs>
          <ChartFrame transform={transform} box={box} />
          <ellipse
            cx={estimateX}
            cy={estimateY}
            rx={Math.max(7, chart.uncertaintyEastWestNm * transform.xScale)}
            ry={Math.max(7, chart.uncertaintyNorthSouthNm * transform.yScale)}
            class="uncertainty-ellipse"
            aria-label={`Uncertainty ellipse, plus or minus ${chart.uncertaintyEastWestNm.toFixed(1)} nautical miles east west and ${chart.uncertaintyNorthSouthNm.toFixed(1)} nautical miles north south`}
          />
          {origin !== undefined && (
            <g aria-hidden="true">
              <circle cx={transform.x(origin.xNm)} cy={transform.y(origin.yNm)} r="4.5" class="track-origin" />
            </g>
          )}
          <polyline points={pointsAttribute(chart.estimatedTrack, transform)} class="estimated-track" aria-label="Estimated track history" />
          {placed.map(({ landmark, x, y, labelY, offChart, distanceNm, bearing }) => {
            const alignLeft = x > transform.right - 210;
            const crowded = Math.abs(x - estimateX) < 210 && Math.abs(labelY - estimateY) < 22;
            const caption = offChart
              ? `${landmark.label} · ${distanceNm} nm ${bearing} · ${landmark.confidence}%`
              : `${landmark.label} · ${landmark.confidence}%`;
            return (
              <g
                key={landmark.id}
                tabIndex={0}
                role="img"
                aria-label={
                  offChart
                    ? `${landmark.label}, off the current chart window, about ${distanceNm} nautical miles ${bearing} of the estimate, ${landmark.status}, confidence ${landmark.confidence} percent`
                    : `${landmark.label}, ${landmark.status}, confidence ${landmark.confidence} percent`
                }
              >
                <rect
                  x={x - 6}
                  y={y - 6}
                  width="12"
                  height="12"
                  transform={`rotate(45 ${x} ${y})`}
                  class={offChart ? "landmark-symbol landmark-off-chart" : "landmark-symbol"}
                />
                <text
                  x={x + (alignLeft ? -14 : 14)}
                  y={crowded ? Math.max(labelY, y + 22) : labelY}
                  text-anchor={alignLeft ? "end" : "start"}
                  class={offChart ? "chart-label chart-label-off" : "chart-label"}
                >
                  {caption}
                </text>
              </g>
            );
          })}
          <line x1={estimateX} y1={estimateY} x2={courseEnd.x} y2={courseEnd.y} class="heading-line" marker-end="url(#heading-arrow)" />
          {chart.wind.fromHeading !== null && (
            <g role="img" aria-label={`Observed wind: ${chart.wind.text}, giving a ${chart.pointOfSail.label.toLowerCase()} on the ${chart.heading} heading`}>
              <WindArrow
                cx={estimateX}
                cy={estimateY}
                fromBearing={bearingFor(chart.wind.fromHeading)}
                strength={chart.wind.strength}
                innerRadius={17}
                outerRadius={62}
              />
              <text x={windLabel.x} y={windLabel.y} text-anchor="middle" class="chart-label chart-label-wind">Wind {chart.wind.fromHeading}</text>
            </g>
          )}
          <g tabIndex={0} role="img" aria-label={`Estimated position, heading ${chart.heading}, ${chart.pointOfSail.label}`}>
            <circle cx={estimateX} cy={estimateY} r="9" class="estimated-position" />
            <text x={sternLabel.x} y={sternLabel.y} text-anchor={sternLabel.anchor} class="chart-label chart-label-estimate">Estimate · {chart.heading}</text>
          </g>
        </svg>
      </div>
      <div class="chart-legend" aria-label="Chart legend">
        <span><i class="legend-origin" /> Departure point</span>
        <span><i class="legend-line estimated" /> Estimated track<span class="legend-detail"> — where the crew believes it sailed</span></span>
        <span><i class="legend-area" /> Hatched uncertainty — how wrong the estimate may be, not a coastline</span>
        <span><i class="legend-square" /> Known landmark<span class="legend-detail"> with confidence label</span></span>
        <span><i class="legend-square off" /> Beyond this window<span class="legend-detail"> — pinned to the edge with its distance</span></span>
        <span><i class="legend-wind" /> Wind arrow<span class="legend-detail"> — flying from the point it blows out of, feathered once for moderate and twice for strong</span></span>
      </div>
      <dl class="chart-notes">
        <div><dt>Estimated coordinates</dt><dd>{chart.estimatedPosition.xNm.toFixed(1)} nm E/W, {chart.estimatedPosition.yNm.toFixed(1)} nm N/S</dd></div>
        <div><dt>Observed wind</dt><dd>{chart.observedWind}</dd></div>
        <div><dt>Planned heading</dt><dd>{chart.heading} — {chart.pointOfSail.label}</dd></div>
        <div><dt>How she sails it</dt><dd>{chart.pointOfSail.note}</dd></div>
      </dl>
      {chart.knownCurrentStatements.length > 0 && (
        <div class="known-currents">
          <h3>What the chart says about currents</h3>
          {chart.knownCurrentStatements.map((statement) => <p key={statement}>{statement}</p>)}
        </div>
      )}
    </section>
  );
}

export function AfterActionChart({ estimated, actual }: {
  readonly estimated: readonly ChartPointViewModel[];
  readonly actual: readonly ChartPointViewModel[];
}) {
  const pane = useRef<HTMLDivElement>(null);
  const box = usePlotBox(pane);
  const transform = transformFor([...estimated, ...actual], 90, box);
  return (
    <section class="chart-shell report-chart" aria-labelledby="report-chart-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">What actually happened</p>
          <h2 id="report-chart-title">Estimated and actual tracks</h2>
        </div>
      </div>
      <div class="chart-pane" ref={pane}>
        <svg
          class="chart"
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-labelledby="report-svg-title report-svg-desc"
        >
          <title id="report-svg-title">The estimated route beside the route actually sailed</title>
          <desc id="report-svg-desc">The dotted line is the estimated route. The solid double-marked line is the actual route, revealed only in this finalized report. Grid lines are ruled in nautical miles.</desc>
          <ChartFrame transform={transform} box={box} />
          <polyline points={pointsAttribute(estimated, transform)} class="estimated-track" />
          <polyline points={pointsAttribute(actual, transform)} class="actual-track" />
          {actual.filter((_, index) => index % Math.max(1, Math.floor(actual.length / 12)) === 0).map((point) => (
            <circle key={`${point.day}-${point.xNm}-${point.yNm}`} cx={transform.x(point.xNm)} cy={transform.y(point.yNm)} r="4" class="actual-marker" />
          ))}
        </svg>
      </div>
      <div class="chart-legend" aria-label="Finalized chart legend">
        <span><i class="legend-line estimated" /> Estimated track, dotted</span>
        <span><i class="legend-line actual" /> Actual track, solid with round markers</span>
      </div>
    </section>
  );
}
