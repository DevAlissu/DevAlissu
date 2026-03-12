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
const outDir = "cards";
mkdirSync(outDir, { recursive: true });

// Fetch data once
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

// Common style options
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
