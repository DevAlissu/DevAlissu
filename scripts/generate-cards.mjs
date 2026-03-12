import { writeFileSync, mkdirSync } from "fs";
import { pathToFileURL } from "url";
import { join } from "path";

// Import from the cloned github-readme-stats
const statsApp = process.env.STATS_APP_PATH || "/tmp/stats-app";

const toURL = (p) => pathToFileURL(join(statsApp, p)).href;

const { fetchStats } = await import(toURL("src/fetchers/stats.js"));
const { renderStatsCard } = await import(toURL("src/cards/stats.js"));
const { fetchTopLanguages } = await import(toURL("src/fetchers/top-languages.js"));
const { renderTopLanguages } = await import(toURL("src/cards/top-languages.js"));

const USERNAME = "DevAlissu";
const PAT = process.env.PAT_1;
const outDir = "cards";
mkdirSync(outDir, { recursive: true });

// ─── Fetch stats & top languages ───
console.log("Fetching stats...");
const stats = await fetchStats(
  USERNAME,
  true, // include_all_commits
  [],   // exclude_repo
  false, // include_merged_pull_requests
  false, // include_discussions
  false, // include_discussions_answers
);

console.log(`Total commits found: ${stats.totalCommits}`);
console.log(`Total PRs: ${stats.totalPRs}`);
console.log(`Total stars: ${stats.totalStars}`);
console.log(`Total issues: ${stats.totalIssues}`);

console.log("Fetching top languages...");
const topLangs = await fetchTopLanguages(USERNAME, []);

// ─── Fetch contribution calendar for streak ───
console.log("Fetching contribution calendar for streak...");

async function graphql(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

// Fetch contribution data year by year (API limit: max 1 year span)
const ACCOUNT_CREATED = "2021-01-25";
const today = new Date().toISOString().split("T")[0];
const allDays = [];

// Build year ranges
const ranges = [];
let start = new Date(ACCOUNT_CREATED);
while (start < new Date(today)) {
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  if (end > new Date(today)) {
    // For the last partial year, don't set 'to' - let API use default
    ranges.push({ from: start.toISOString(), to: null });
  } else {
    ranges.push({ from: start.toISOString(), to: end.toISOString() });
  }
  start = end;
}

for (let i = 0; i < ranges.length; i++) {
  const { from, to } = ranges[i];
  const toArg = to ? `, to: "${to}"` : "";
  const query = `{
    user(login: "${USERNAME}") {
      contributionsCollection(from: "${from}"${toArg}) {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }`;
  const data = await graphql(query);
  const weeks = data.data.user.contributionsCollection.contributionCalendar.weeks;
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      allDays.push(day);
    }
  }
}

// Deduplicate by date (overlapping ranges might have duplicate days)
const dayMap = new Map();
for (const day of allDays) {
  dayMap.set(day.date, day.contributionCount);
}

// Sort by date
const sortedDays = [...dayMap.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, count]) => ({ date, count }));

// Calculate total contributions
const totalContributions = sortedDays.reduce((sum, d) => sum + d.count, 0);

// Calculate current streak (from today backwards)
let currentStreak = 0;
let currentStreakStart = null;
let currentStreakEnd = null;

// Start from today or yesterday (if today has 0, check if today isn't over yet)
const todayStr = today;
const yesterdayDate = new Date();
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

for (let i = sortedDays.length - 1; i >= 0; i--) {
  const day = sortedDays[i];
  // Skip future days
  if (day.date > todayStr) continue;
  // For the first day, allow today with 0 (day isn't over)
  if (currentStreak === 0 && day.date === todayStr && day.count === 0) continue;
  if (day.count > 0) {
    currentStreak++;
    currentStreakStart = day.date;
    if (!currentStreakEnd) currentStreakEnd = day.date;
  } else {
    break;
  }
}

// Calculate longest streak
let longestStreak = 0;
let longestStreakStart = null;
let longestStreakEnd = null;
let tempStreak = 0;
let tempStart = null;

for (const day of sortedDays) {
  if (day.count > 0) {
    tempStreak++;
    if (!tempStart) tempStart = day.date;
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
      longestStreakStart = tempStart;
      longestStreakEnd = day.date;
    }
  } else {
    tempStreak = 0;
    tempStart = null;
  }
}

console.log(`Total contributions: ${totalContributions}`);
console.log(`Current streak: ${currentStreak} days`);
console.log(`Longest streak: ${longestStreak} days (${longestStreakStart} - ${longestStreakEnd})`);

// ─── Format dates ───
function formatDate(dateStr) {
  if (!dateStr) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthsPt = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const d = new Date(dateStr + "T00:00:00Z");
  return {
    en: `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
    pt: `${d.getUTCDate()} ${monthsPt[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

function formatDateRange(start, end) {
  if (!start || !end) return { en: "N/A", pt: "N/A" };
  const s = formatDate(start);
  const e = formatDate(end);
  return {
    en: `${s.en} - ${e.en}`,
    pt: `${s.pt} - ${e.pt}`,
  };
}

const accountCreatedFmt = formatDate(ACCOUNT_CREATED);
const todayFmt = formatDate(todayStr);
const currentRange = formatDateRange(currentStreakStart, currentStreakEnd);
const longestRange = formatDateRange(longestStreakStart, longestStreakEnd);
const totalRange = {
  en: `${accountCreatedFmt.en} - Present`,
  pt: `${accountCreatedFmt.pt} - Presente`,
};

// ─── Generate streak SVG ───
function generateStreakSvg(locale) {
  const isPt = locale === "pt-br";
  const totalLabel = isPt ? "Contribuições Totais" : "Total Contributions";
  const currentLabel = isPt ? "Sequência Atual" : "Current Streak";
  const longestLabel = isPt ? "Maior Sequência" : "Longest Streak";
  const totalRangeStr = isPt ? totalRange.pt : totalRange.en;
  const currentRangeStr = currentStreak > 0
    ? (isPt ? currentRange.pt : currentRange.en)
    : (isPt ? todayFmt.pt : todayFmt.en);
  const longestRangeStr = longestStreak > 0
    ? (isPt ? longestRange.pt : longestRange.en)
    : "N/A";

  // Ring progress (current streak as % of longest, capped at 100%)
  const progress = longestStreak > 0 ? Math.min(currentStreak / longestStreak, 1) : 0;
  const circumference = 2 * Math.PI * 40;
  const dashoffset = circumference * (1 - progress);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800" height="195" viewBox="0 0 800 195">
  <defs>
    <style>
      @keyframes currstreak { 0% { font-size: 3px; opacity: 0.2; } 80% { font-size: 34px; opacity: 1; } 100% { font-size: 28px; opacity: 1; } }
      @keyframes fadein { 0% { opacity: 0; } 100% { opacity: 1; } }
    </style>
  </defs>
  <rect xmlns="http://www.w3.org/2000/svg" rx="4.5" x="0.5" y="0.5" width="799" height="194" fill="#1A0D19" stroke="#FFFFFF"/>

  <!-- Total Contributions -->
  <g transform="translate(133, 48)">
    <text x="0" y="32" fill="#FFFFFF" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="700" font-size="28" text-anchor="middle" style="animation: currstreak 0.6s ease-in-out forwards">${totalContributions}</text>
    <text x="0" y="60" fill="#FFFFFF" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="14" text-anchor="middle">${totalLabel}</text>
    <text x="0" y="78" fill="#FF40FD" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="12" text-anchor="middle" style="animation: fadein 0.5s linear forwards">${totalRangeStr}</text>
  </g>

  <!-- Current Streak (center) -->
  <g transform="translate(400, 48)">
    <!-- Ring -->
    <circle cx="0" cy="28" r="40" fill="none" stroke="#B92FB8" stroke-width="5" stroke-opacity="0.2"/>
    <circle cx="0" cy="28" r="40" fill="none" stroke="#B92FB8" stroke-width="5" stroke-dasharray="${circumference}" stroke-dashoffset="${dashoffset}" stroke-linecap="round" transform="rotate(-90 0 28)"/>
    <!-- Fire icon -->
    <g transform="translate(-8, -8)">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="22" viewBox="0 0 16 22" fill="none">
        <path d="M8 0C5.6 4.4 0 6.5 0 12.5C0 17.2 3.6 21 8 21C12.4 21 16 17.2 16 12.5C16 6.5 10.4 4.4 8 0Z" fill="#771E76" opacity="0.9"/>
      </svg>
    </g>
    <text x="0" y="32" fill="#FFFFFF" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="700" font-size="28" text-anchor="middle" style="animation: currstreak 0.6s ease-in-out forwards">${currentStreak}</text>
    <text x="0" y="60" fill="#FFFFFF" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="14" text-anchor="middle">${currentLabel}</text>
    <text x="0" y="78" fill="#FF40FD" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="12" text-anchor="middle" style="animation: fadein 0.5s linear forwards">${currentRangeStr}</text>
  </g>

  <!-- Longest Streak -->
  <g transform="translate(667, 48)">
    <text x="0" y="32" fill="#FFFFFF" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="700" font-size="28" text-anchor="middle" style="animation: currstreak 0.6s ease-in-out forwards">${longestStreak}</text>
    <text x="0" y="60" fill="#FFFFFF" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="14" text-anchor="middle">${longestLabel}</text>
    <text x="0" y="78" fill="#FF40FD" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="12" text-anchor="middle" style="animation: fadein 0.5s linear forwards">${longestRangeStr}</text>
  </g>

  <!-- Dividers -->
  <line x1="266" y1="28" x2="266" y2="170" stroke="#FF40FD" stroke-width="1"/>
  <line x1="534" y1="28" x2="534" y2="170" stroke="#FF40FD" stroke-width="1"/>
</svg>`;
}

writeFileSync(join(outDir, "streak-dark.svg"), generateStreakSvg("en"));
console.log("Streak card (EN) generated.");

writeFileSync(join(outDir, "streak-dark-ptbr.svg"), generateStreakSvg("pt-br"));
console.log("Streak card (PT-BR) generated.");

// ─── Common style options ───
const darkStyle = {
  title_color: "995098",
  icon_color: "771e76",
  bg_color: "1a0d19",
  theme: "midnight-purple",
};

// Stats card - EN
writeFileSync(
  join(outDir, "stats-dark.svg"),
  renderStatsCard(stats, {
    ...darkStyle,
    show_icons: true,
    include_all_commits: true,
    card_width: 800,
    hide: [],
    show: [],
  }),
);
console.log("Stats card (EN) generated.");

// Stats card - PT-BR
writeFileSync(
  join(outDir, "stats-dark-ptbr.svg"),
  renderStatsCard(stats, {
    ...darkStyle,
    show_icons: true,
    include_all_commits: true,
    card_width: 800,
    locale: "pt-br",
    hide: [],
    show: [],
  }),
);
console.log("Stats card (PT-BR) generated.");

// Top languages - EN
writeFileSync(
  join(outDir, "top-langs-dark.svg"),
  renderTopLanguages(topLangs, {
    ...darkStyle,
    icon_color: "240122",
    langs_count: "8",
  }),
);
console.log("Top languages card (EN) generated.");

// Top languages - PT-BR
writeFileSync(
  join(outDir, "top-langs-dark-ptbr.svg"),
  renderTopLanguages(topLangs, {
    ...darkStyle,
    icon_color: "240122",
    langs_count: "8",
    locale: "pt-br",
  }),
);
console.log("Top languages card (PT-BR) generated.");

console.log("All cards generated successfully!");
