import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  appendRows,
  batchUpdate,
  clearRange,
  getMetadata,
  readRange,
  snapshot,
  updateRange,
  type SheetsContext,
} from "./sheets.js";

const KEY_PATH_ENV = "GSHEETS_SERVICE_ACCOUNT_KEY";
const SPREADSHEET_ENV = "GSHEETS_SPREADSHEET_ID";

function context(): SheetsContext {
  const keyPath = process.env[KEY_PATH_ENV];
  const spreadsheetId = process.env[SPREADSHEET_ENV];
  if (!keyPath) {
    throw new Error(
      `${KEY_PATH_ENV} is not set. It must point at the service account JSON key file.`,
    );
  }
  if (!spreadsheetId) {
    throw new Error(`${SPREADSHEET_ENV} is not set.`);
  }
  return { keyPath, spreadsheetId };
}

export default defineToolPlugin({
  id: "gsheets",
  name: "Google Sheets",
  description:
    "Read and write the team Google Sheet. Destructive operations pin a Drive revision first so they can be rolled back from version history.",
  tools: (tool) => [
    tool({
      name: "sheet_describe",
      description:
        "List the tabs in the spreadsheet with their dimensions. Use this first when unsure which tab a request refers to.",
      parameters: Type.Object({}),
      execute: async () => {
        const meta = await getMetadata(context());
        return {
          title: meta.properties?.title,
          tabs: (meta.sheets ?? []).map((s) => ({
            title: s.properties?.title,
            rows: s.properties?.gridProperties?.rowCount,
            columns: s.properties?.gridProperties?.columnCount,
          })),
        };
      },
    }),

    tool({
      name: "sheet_read",
      description:
        "Read a range in A1 notation, e.g. 'Sheet1!A1:D20'. Returns the rows as arrays of strings.",
      parameters: Type.Object({
        range: Type.String({
          description: "Range in A1 notation, including the tab name.",
        }),
      }),
      execute: async ({ range }) => {
        const result = await readRange(context(), range);
        return { range, rows: result.values ?? [] };
      },
    }),

    tool({
      name: "sheet_append",
      description:
        "Append one or more rows to the end of a tab. This never overwrites existing data and is the preferred way to add information.",
      parameters: Type.Object({
        range: Type.String({
          description:
            "Target tab or range, e.g. 'Sheet1' or 'Sheet1!A:D'. Rows are added after the last populated row.",
        }),
        rows: Type.Array(Type.Array(Type.String()), {
          description: "Rows to append; each row is an array of cell values.",
        }),
      }),
      execute: async ({ range, rows }) => {
        const result = await appendRows(context(), range, rows);
        return {
          appended: rows.length,
          updatedRange: result.updates?.updatedRange,
        };
      },
    }),

    tool({
      name: "sheet_update",
      description:
        "Overwrite the cells in a specific range. This REPLACES existing content, so read the range first if the current values matter. A Drive revision is pinned before the change.",
      parameters: Type.Object({
        range: Type.String({
          description: "Exact range to overwrite in A1 notation.",
        }),
        rows: Type.Array(Type.Array(Type.String()), {
          description: "Replacement values, matching the shape of the range.",
        }),
      }),
      execute: async ({ range, rows }) => {
        const ctx = context();
        const note = await snapshot(ctx, `update ${range}`);
        const result = await updateRange(ctx, range, rows);
        return { updatedCells: result.updatedCells, rollback: note };
      },
    }),

    tool({
      name: "sheet_clear",
      description:
        "Clear the values in a range, leaving the rows in place. Destructive: a Drive revision is pinned first. Confirm the exact range with the user before calling this.",
      parameters: Type.Object({
        range: Type.String({ description: "Range to clear in A1 notation." }),
      }),
      execute: async ({ range }) => {
        const ctx = context();
        const note = await snapshot(ctx, `clear ${range}`);
        const result = await clearRange(ctx, range);
        return { clearedRange: result.clearedRange, rollback: note };
      },
    }),

    tool({
      name: "sheet_batch_update",
      description:
        "Run raw Sheets API batchUpdate requests for structural changes: adding or deleting tabs, deleting rows, formatting. Destructive: a Drive revision is pinned first. Confirm intent with the user before calling this.",
      parameters: Type.Object({
        requests: Type.Array(Type.Unknown(), {
          description:
            "Array of Sheets API Request objects, e.g. [{ addSheet: { properties: { title: 'Q3' } } }].",
        }),
        summary: Type.String({
          description:
            "Short human-readable description of what these requests do, for the audit trail.",
        }),
      }),
      execute: async ({ requests, summary }) => {
        const ctx = context();
        const note = await snapshot(ctx, summary);
        const result = await batchUpdate(ctx, requests as unknown[]);
        return { applied: result.replies?.length ?? 0, summary, rollback: note };
      },
    }),
  ],
});
