import type { DashboardData } from "../queries/dashboard-data.js";
import { DASHBOARD_CLIENT_JS } from "./dashboard-client.js";
import { DASHBOARD_CSS } from "./dashboard-css.js";

/**
 * Serialises data for a `<script type="application/json">` block. `<` is
 * escaped so no value (a merchant-derived city, a category name) can close
 * the script element or open a comment, and U+2028/2029 are escaped for
 * parsers that still treat them as line terminators.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Builds the complete, self-contained dashboard page: all CSS, script and
 * data are inline, and nothing in it references a network resource (no CDN,
 * no web fonts, no fetch). Spanish copy is the owner's personal view; code
 * and identifiers stay English.
 */
export function renderDashboardHtml(data: DashboardData, generatedAt: Date): string {
  const generated = generatedAt.toISOString().slice(0, 16).replace("T", " ");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Luca · Gasto</title>
<style>${DASHBOARD_CSS}</style>
</head>
<body>
<svg id="ns" width="0" height="0" aria-hidden="true" style="position:absolute"></svg>
<main>
  <header class="top">
    <h1>Luca · Gasto con tarjeta</h1>
    <span class="meta">Generado ${generated} UTC · datos locales, nada sale de este equipo</span>
  </header>
  <form class="filters" onsubmit="return false">
    <label>Año <select id="f-year"><option value="all">Todos</option></select></label>
    <label>Mes <select id="f-month"></select></label>
    <span class="spacer"></span>
    <label>Tema <select id="f-theme"><option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
  </form>
  <div id="app"></div>
</main>
<div id="tip" role="status"></div>
<script type="application/json" id="luca-data">${jsonForScript(data)}</script>
<script>${DASHBOARD_CLIENT_JS}</script>
</body>
</html>
`;
}
