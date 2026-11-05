#!/usr/bin/env node
/**
 * Reads flight data checked out from the private `dji-flight-log-github`
 * repo (via the `flight-data` checkout path) and updates the
 * FLIGHT-STATS marker section in README.md with a summary table.
 *
 * Run by .github/workflows/update-flight-stats.yml on a weekly schedule.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_PATH = path.join(
  __dirname,
  "..",
  "flight-data",
  "data",
  "flights.json",
);
const README_PATH = path.join(__dirname, "..", "README.md");
const START_MARKER = "<!--FLIGHT-STATS:START-->";
const END_MARKER = "<!--FLIGHT-STATS:END-->";

function formatHours(totalSeconds) {
  return (totalSeconds / 3600).toFixed(1);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function computeStats(flights) {
  const withDates = flights
    .filter((f) => f.startTime)
    .map((f) => ({ ...f, date: new Date(f.startTime) }))
    .sort((a, b) => a.date - b.date);

  const totalFlights = withDates.length;
  const totalDurationSeconds = withDates.reduce(
    (sum, f) => sum + (f.flightDurationSeconds ?? 0),
    0,
  );
  const totalDistanceMeters = withDates.reduce(
    (sum, f) => sum + (f.totalDistanceMeters ?? 0),
    0,
  );
  const lastFlight = withDates[withDates.length - 1] ?? null;

  let currentStreakWeeks = 0;
  if (withDates.length > 0) {
    const weekKey = (date) => {
      const d = new Date(date);
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - day);
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    };
    const weeksWithFlights = new Set(withDates.map((f) => weekKey(f.date)));
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    let cursor = weekKey(withDates[withDates.length - 1].date);
    while (weeksWithFlights.has(cursor)) {
      currentStreakWeeks += 1;
      cursor -= oneWeekMs;
    }
  }

  return {
    totalFlights,
    totalDurationSeconds,
    totalDistanceKm: totalDistanceMeters / 1000,
    lastFlight,
    currentStreakWeeks,
  };
}

function renderMarkdown(stats) {
  const lastFlightDate = stats.lastFlight
    ? formatDate(stats.lastFlight.startTime)
    : "n/a";

  return [
    "| Metric | Value |",
    "| --- | --- |",
    `| ✈️ Total Flights | ${stats.totalFlights} |`,
    `| ⏱️ Total Flight Time | ${formatHours(stats.totalDurationSeconds)} hrs |`,
    `| 📏 Total Distance | ${stats.totalDistanceKm.toFixed(1)} km |`,
    `| 🔥 Current Streak | ${stats.currentStreakWeeks} week${stats.currentStreakWeeks === 1 ? "" : "s"} |`,
    `| 🛬 Last Flight | ${lastFlightDate} |`,
    "",
    `<sub>Last updated ${new Date().toISOString().slice(0, 10)}</sub>`,
  ].join("\n");
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`No flight data found at ${DATA_PATH}`);
    process.exit(1);
  }

  const flights = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const stats = computeStats(flights);
  const markdown = renderMarkdown(stats);

  const readme = fs.readFileSync(README_PATH, "utf8");
  const pattern = new RegExp(
    `${START_MARKER}[\\s\\S]*?${END_MARKER}`,
  );

  if (!pattern.test(readme)) {
    console.error("FLIGHT-STATS markers not found in README.md");
    process.exit(1);
  }

  const updated = readme.replace(
    pattern,
    `${START_MARKER}\n${markdown}\n${END_MARKER}`,
  );

  fs.writeFileSync(README_PATH, updated, "utf8");
  console.log("README.md flight stats section updated.");
}

main();
