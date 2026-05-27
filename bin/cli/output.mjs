import { stringify as csvStringify } from "csv-stringify/sync";

const MASK_RE = /sk-[A-Za-z0-9]{4,}/g;

export const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARG: 2,
  SERVER_OFFLINE: 3,
  AUTH: 4,
  RATE_LIMIT: 5,
  TIMEOUT: 124,
});

export function maskSecret(value) {
  if (typeof value !== "string") return value;
  return value.replace(MASK_RE, (m) => `${m.slice(0, 5)}***${m.slice(-4)}`);
}

function toRows(data) {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") return data.items ? data.items : [data];
  return [{ value: data }];
}

function pickFormat(opts) {
  if (opts.output) return opts.output;
  if (opts.json) return "json";
  if (!process.stdout.isTTY) return "json";
  return "table";
}

function inferSchema(sample) {
  return Object.keys(sample).map((k) => ({ key: k, header: k }));
}

function formatCell(v, col) {
  if (v == null) return "";
  if (col.formatter) return col.formatter(v);
  return String(v);
}

const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

/** Truncate a string to `max` chars, appending "…" if trimmed. */
function truncateCell(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

/** Pad a string to exactly `width` chars (left-aligned). */
function padCell(str, width) {
  return str + " ".repeat(Math.max(0, width - str.length));
}

function renderTable(rows, schema, opts = {}) {
  if (rows.length === 0) {
    process.stdout.write("(empty)\n");
    return;
  }
  const cols = schema || inferSchema(rows[0]);
  const quiet = opts.quiet === true;

  // Compute column widths: max(header.length, max cell length), capped by explicit c.width.
  const colWidths = cols.map((c) => {
    const headerLen = c.header.length;
    const maxData = rows.reduce((m, row) => Math.max(m, formatCell(row[c.key], c).length), 0);
    const natural = Math.max(headerLen, maxData);
    return c.width ? Math.max(c.width, 1) : natural;
  });

  const separator = colWidths.map((w) => "-".repeat(w + 2)).join("-+-");

  const renderRow = (cells, cyan) => {
    const parts = cells.map((cell, i) => {
      const truncated = truncateCell(cell, colWidths[i]);
      const padded = padCell(truncated, colWidths[i]);
      return cyan ? ` ${CYAN}${padded}${RESET} ` : ` ${padded} `;
    });
    return `|${parts.join("|")}|`;
  };

  const lines = [];

  if (!quiet) {
    lines.push(separator);
    lines.push(renderRow(cols.map((c) => c.header), true));
  }
  lines.push(separator);

  for (const row of rows) {
    lines.push(renderRow(cols.map((c) => formatCell(row[c.key], c)), false));
  }
  lines.push(separator);

  process.stdout.write(lines.join("\n") + "\n");
}

function renderCsv(rows, schema) {
  if (rows.length === 0) {
    process.stdout.write("\n");
    return;
  }
  const cols = schema || inferSchema(rows[0]);
  const headers = cols.map((c) => c.header);
  const records = rows.map((r) => cols.map((c) => formatCell(r[c.key], c)));
  process.stdout.write(csvStringify([headers, ...records]));
}

function renderJsonl(rows) {
  for (const row of rows) process.stdout.write(JSON.stringify(row) + "\n");
}

/**
 * Emit structured data to stdout in the requested format.
 * @param {unknown} data - Array of objects or single object
 * @param {object} opts - Options: { output, json, quiet }
 * @param {Array|null} schema - Column definitions: [{ key, header, width?, formatter? }]
 */
export function emit(data, opts = {}, schema = null) {
  const format = pickFormat(opts);
  const rows = toRows(data);

  switch (format) {
    case "json":
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      break;
    case "jsonl":
      renderJsonl(rows);
      break;
    case "csv":
      renderCsv(rows, schema);
      break;
    default:
      renderTable(rows, schema, opts);
  }
}

export function printHeading(title, quiet = false) {
  if (quiet) return;
  process.stderr.write(`\n\x1b[1m\x1b[36m${title}\x1b[0m\n\n`);
}

export function printSuccess(message, quiet = false) {
  if (quiet) return;
  process.stderr.write(`\x1b[32m✔ ${message}\x1b[0m\n`);
}

export function printInfo(message, quiet = false) {
  if (quiet) return;
  process.stderr.write(`\x1b[2m${message}\x1b[0m\n`);
}

export function printWarning(message) {
  process.stderr.write(`\x1b[33m⚠ ${message}\x1b[0m\n`);
}

export function printError(message) {
  process.stderr.write(`\x1b[31m✖ ${message}\x1b[0m\n`);
}

export function exitWith(code, message) {
  if (message) printError(message);
  process.exit(code);
}
