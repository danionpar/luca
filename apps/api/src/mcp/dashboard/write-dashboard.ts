import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { LucaDb } from "../queries/db-types.js";
import { dashboardData } from "../queries/dashboard-data.js";
import { renderDashboardHtml } from "./render-html.js";

/** Outside the repository on purpose: the file holds real spending data. */
export const DEFAULT_DASHBOARD_PATH = join(homedir(), "Documents", "luca", "dashboard.html");

export type OpenFile = (path: string) => void;

/** Opens a file in the default macOS handler. Failure to open never fails the render. */
export const openWithMacOs: OpenFile = (path) => {
  execFile("open", [path], () => undefined);
};

export function resolveOutputPath(requested: string | undefined): string {
  if (!requested) return DEFAULT_DASHBOARD_PATH;
  const expanded = requested === "~" || requested.startsWith("~/") ? join(homedir(), requested.slice(1)) : requested;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export interface WriteDashboardOptions {
  outputPath?: string;
  open?: boolean;
  opener?: OpenFile;
  now?: Date;
}

export interface WriteDashboardResult {
  path: string;
  opened: boolean;
  months: number;
  transactions: number;
}

/** Renders the dashboard from the database and writes it to disk, creating the directory. */
export function writeDashboard(db: LucaDb, options: WriteDashboardOptions = {}): WriteDashboardResult {
  const path = resolveOutputPath(options.outputPath);
  const data = dashboardData(db);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderDashboardHtml(data, options.now ?? new Date()), "utf-8");

  const shouldOpen = options.open ?? true;
  if (shouldOpen) (options.opener ?? openWithMacOs)(path);

  return {
    path,
    opened: shouldOpen,
    months: data.months.length,
    transactions: data.months.reduce((n, m) => n + m.count, 0),
  };
}
