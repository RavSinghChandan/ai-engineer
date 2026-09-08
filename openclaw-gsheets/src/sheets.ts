import { getAccessToken } from "./auth.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

export type SheetsContext = {
  keyPath: string;
  spreadsheetId: string;
};

async function call<T>(
  ctx: SheetsContext,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken(ctx.keyPath);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        `Google returned ${res.status}. The most common cause is that the sheet has not been shared with the service account's email address. Detail: ${detail.slice(0, 300)}`,
      );
    }
    throw new Error(`Google API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Records a named Drive revision before a destructive change so the edit can
 * be traced and rolled back from the sheet's version history.
 */
export async function snapshot(ctx: SheetsContext, label: string): Promise<string> {
  try {
    const stamp = new Date().toISOString();
    await call(ctx, `${DRIVE_API}/${ctx.spreadsheetId}/revisions/head`, {
      method: "PATCH",
      body: JSON.stringify({
        keepForever: true,
        publishedOutsideDomain: false,
      }),
    });
    return `Revision pinned before "${label}" at ${stamp}. Restore via File > Version history in the sheet.`;
  } catch (err) {
    return `Warning: could not pin a revision before "${label}" (${(err as Error).message}). The operation still proceeded.`;
  }
}

export async function readRange(ctx: SheetsContext, range: string) {
  return call<{ values?: string[][] }>(
    ctx,
    `${SHEETS_API}/${ctx.spreadsheetId}/values/${encodeURIComponent(range)}`,
  );
}

export async function appendRows(
  ctx: SheetsContext,
  range: string,
  values: string[][],
) {
  return call<{ updates?: { updatedRange?: string } }>(
    ctx,
    `${SHEETS_API}/${ctx.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

export async function updateRange(
  ctx: SheetsContext,
  range: string,
  values: string[][],
) {
  return call<{ updatedCells?: number }>(
    ctx,
    `${SHEETS_API}/${ctx.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );
}

export async function clearRange(ctx: SheetsContext, range: string) {
  return call<{ clearedRange?: string }>(
    ctx,
    `${SHEETS_API}/${ctx.spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", body: "{}" },
  );
}

export async function getMetadata(ctx: SheetsContext) {
  return call<{
    properties?: { title?: string };
    sheets?: { properties?: { title?: string; sheetId?: number; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
  }>(ctx, `${SHEETS_API}/${ctx.spreadsheetId}?fields=properties.title,sheets.properties`);
}

export async function batchUpdate(ctx: SheetsContext, requests: unknown[]) {
  return call<{ replies?: unknown[] }>(
    ctx,
    `${SHEETS_API}/${ctx.spreadsheetId}:batchUpdate`,
    { method: "POST", body: JSON.stringify({ requests }) },
  );
}
