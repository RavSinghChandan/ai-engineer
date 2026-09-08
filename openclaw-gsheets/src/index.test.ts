import { describe, expect, it } from "vitest";
import entry from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";

describe("gsheets", () => {
  it("declares the full-control tool surface", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
      "sheet_describe",
      "sheet_read",
      "sheet_append",
      "sheet_update",
      "sheet_clear",
      "sheet_batch_update",
    ]);
  });

  it("warns in the description of every destructive tool", () => {
    const tools = getToolPluginMetadata(entry)?.tools ?? [];
    for (const name of ["sheet_update", "sheet_clear", "sheet_batch_update"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `${name} should exist`).toBeDefined();
      expect(tool?.description).toMatch(/revision is pinned/i);
    }
  });

  it("does not warn on the non-destructive tools", () => {
    const tools = getToolPluginMetadata(entry)?.tools ?? [];
    for (const name of ["sheet_describe", "sheet_read", "sheet_append"]) {
      expect(tools.find((t) => t.name === name)?.description).not.toMatch(
        /revision is pinned/i,
      );
    }
  });
});
