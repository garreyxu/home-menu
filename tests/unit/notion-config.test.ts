import { afterEach, describe, expect, it, vi } from "vitest";

import { readNotionConfig } from "@/server/notion/config";

afterEach(() => vi.unstubAllEnvs());

describe("Notion sync configuration", () => {
  it.each(["NOTION_TOKEN", "NOTION_DATABASE_ID", "NOTION_DATA_SOURCE_ID"])(
    "rejects missing %s when sync reads configuration",
    (missing) => {
      vi.stubEnv("NOTION_TOKEN", "test-token");
      vi.stubEnv("NOTION_DATABASE_ID", "11111111111141118111111111111111");
      vi.stubEnv("NOTION_DATA_SOURCE_ID", "22222222222242228222222222222222");
      vi.stubEnv(missing, "   ");
      expect(readNotionConfig).toThrow(missing);
    },
  );

  it("normalizes explicitly configured identifiers", () => {
    vi.stubEnv("NOTION_TOKEN", " test-token ");
    vi.stubEnv("NOTION_DATABASE_ID", "11111111111141118111111111111111");
    vi.stubEnv("NOTION_DATA_SOURCE_ID", "22222222222242228222222222222222");
    expect(readNotionConfig()).toEqual({
      token: "test-token",
      databaseId: "11111111-1111-4111-8111-111111111111",
      dataSourceId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
