const SVG_WIDTH = 1000;
const SVG_HEIGHT = 720;
const PLOT_MARGIN = 70;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pointKey(point) {
  return `${point.xMnm},${point.yMnm}`;
}

function estimatedTrack(view) {
  const points = [{ xMnm: 0, yMnm: 0 }];
  for (const entry of view.log) {
    if (entry.type === "day") points.push(entry.estimatedPosition);
  }
  if (pointKey(points.at(-1)) !== pointKey(view.estimatedPosition)) {
    points.push(view.estimatedPosition);
  }
  return points;
}

function chartFacts(view) {
  if (!("navigation" in view)) return [];
  return view.navigation.knownFacts.filter(
    (fact) => fact.type === "landmark" && fact.status !== "disproved",
  );
}

function boundsFor(view, track, facts, developerTruth) {
  const points = [...track, ...facts.map((fact) => fact.claimedPosition)];
  points.push(
    {
      xMnm: view.estimatedPosition.xMnm - view.uncertainty.eastWestMnm,
      yMnm: view.estimatedPosition.yMnm - view.uncertainty.northSouthMnm,
    },
    {
      xMnm: view.estimatedPosition.xMnm + view.uncertainty.eastWestMnm,
      yMnm: view.estimatedPosition.yMnm + view.uncertainty.northSouthMnm,
    },
  );
  if (developerTruth !== undefined) points.push(developerTruth.truePosition);
  const xs = points.map((point) => point.xMnm);
  const ys = points.map((point) => point.yMnm);
  let minimumX = Math.min(...xs);
  let maximumX = Math.max(...xs);
  let minimumY = Math.min(...ys);
  let maximumY = Math.max(...ys);
  if (minimumX === maximumX) {
    minimumX -= 100_000;
    maximumX += 100_000;
  }
  if (minimumY === maximumY) {
    minimumY -= 100_000;
    maximumY += 100_000;
  }
  const paddingX = Math.max(100_000, Math.round((maximumX - minimumX) / 20));
  const paddingY = Math.max(100_000, Math.round((maximumY - minimumY) / 20));
  return {
    minimumX: minimumX - paddingX,
    maximumX: maximumX + paddingX,
    minimumY: minimumY - paddingY,
    maximumY: maximumY + paddingY,
  };
}

function projector(bounds) {
  const plotWidth = SVG_WIDTH - PLOT_MARGIN * 2;
  const plotHeight = SVG_HEIGHT - PLOT_MARGIN * 2;
  const xScale = plotWidth / (bounds.maximumX - bounds.minimumX);
  const yScale = plotHeight / (bounds.maximumY - bounds.minimumY);
  return {
    x(point) {
      return PLOT_MARGIN + (point.xMnm - bounds.minimumX) * xScale;
    },
    y(point) {
      return SVG_HEIGHT - PLOT_MARGIN - (point.yMnm - bounds.minimumY) * yScale;
    },
    radiusX(value) {
      return Math.max(1, value * xScale);
    },
    radiusY(value) {
      return Math.max(1, value * yScale);
    },
  };
}

function number(value) {
  return value.toFixed(2);
}

/**
 * Deterministic, dependency-free debug rendering. Hidden truth is accepted only
 * as an explicit developerTruth option and is never read from PlayerView.
 */
export function renderDebugChart(view, options = {}) {
  const truth = options.developerTruth;
  const track = estimatedTrack(view);
  const facts = chartFacts(view);
  const bounds = boundsFor(view, track, facts, truth);
  const project = projector(bounds);
  const trackPoints = track
    .map((point) => `${number(project.x(point))},${number(project.y(point))}`)
    .join(" ");
  const currentX = project.x(view.estimatedPosition);
  const currentY = project.y(view.estimatedPosition);
  const navigation = "navigation" in view ? view.navigation : undefined;
  const wind = navigation?.observedWind;
  const windLabel = wind?.fromHeading === null
    ? "calm"
    : wind === undefined
      ? "not observed"
      : `${wind.strength} from ${wind.fromHeading}`;
  const weatherLabel = navigation?.observedWeather ?? "legacy still water";
  const landmarkSvg = facts.map((fact) => {
    const x = project.x(fact.claimedPosition);
    const y = project.y(fact.claimedPosition);
    return [
      `<g class="known-landmark" data-landmark-id="${escapeXml(fact.id)}">`,
      `<path d="M ${number(x - 6)} ${number(y)} L ${number(x + 6)} ${number(y)} M ${number(x)} ${number(y - 6)} L ${number(x)} ${number(y + 6)}"/>`,
      `<text x="${number(x + 9)}" y="${number(y - 8)}">${escapeXml(fact.id)} (${fact.status}, ${fact.confidence}%)</text>`,
      "</g>",
    ].join("");
  }).join("\n");
  const truthSvg = truth === undefined
    ? ""
    : [
        '<g id="developer-truth-overlay">',
        `<circle class="truth-position" cx="${number(project.x(truth.truePosition))}" cy="${number(project.y(truth.truePosition))}" r="7"/>`,
        `<text x="${number(project.x(truth.truePosition) + 10)}" y="${number(project.y(truth.truePosition) + 4)}">TRUE POSITION (developer only)</text>`,
        "</g>",
      ].join("");
  const truthStyle = truth === undefined
    ? ""
    : ".truth-position{fill:#b3261e;stroke:#fff;stroke-width:2}#developer-truth-overlay text{font:700 13px system-ui,sans-serif;fill:#b3261e}";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-labelledby="title description">`,
    "<title id=\"title\">WP1 navigation debug chart</title>",
    `<desc id="description">Estimated track and uncertainty ellipse. Weather ${escapeXml(weatherLabel)}; wind ${escapeXml(windLabel)}.</desc>`,
    "<style>",
    `.background{fill:#f4eddb}.frame{fill:none;stroke:#574d3f;stroke-width:2}.track{fill:none;stroke:#1e5c7a;stroke-width:3}.estimate{fill:#1e5c7a;stroke:#fff;stroke-width:2}.ellipse{fill:#4d93b2;fill-opacity:.16;stroke:#1e5c7a;stroke-width:2;stroke-dasharray:7 5}.known-landmark path{stroke:#43372b;stroke-width:2}.known-landmark text,.label{font:14px system-ui,sans-serif;fill:#29231d}${truthStyle}`,
    "</style>",
    `<rect class="background" width="${SVG_WIDTH}" height="${SVG_HEIGHT}"/>`,
    `<rect class="frame" x="${PLOT_MARGIN}" y="${PLOT_MARGIN}" width="${SVG_WIDTH - PLOT_MARGIN * 2}" height="${SVG_HEIGHT - PLOT_MARGIN * 2}"/>`,
    `<text class="label" x="${PLOT_MARGIN}" y="35">Day ${view.committedDay} · ${escapeXml(view.date)} · weather ${escapeXml(weatherLabel)} · wind ${escapeXml(windLabel)}</text>`,
    `<polyline class="track" points="${trackPoints}"/>`,
    `<ellipse class="ellipse" cx="${number(currentX)}" cy="${number(currentY)}" rx="${number(project.radiusX(view.uncertainty.eastWestMnm))}" ry="${number(project.radiusY(view.uncertainty.northSouthMnm))}"/>`,
    `<circle class="estimate" cx="${number(currentX)}" cy="${number(currentY)}" r="6"/>`,
    `<text class="label" x="${number(currentX + 9)}" y="${number(currentY + 18)}">estimated position; ellipse ±${Math.round(view.uncertainty.eastWestMnm / 1000)} nm EW / ±${Math.round(view.uncertainty.northSouthMnm / 1000)} nm NS</text>`,
    landmarkSvg,
    truthSvg,
    "</svg>",
    "",
  ].join("\n");
}
