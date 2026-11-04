import { describe, expect, it } from "vitest";

import { seedDecision } from "@/server/db/seed-policy";
import { planSeedRetirement } from "@/server/notion/seed-rows";

describe("seedDecision", () => {
  it("refuses production and skips a database that already has Notion dishes", () => {
    expect(
      seedDecision({ vercelEnv: "production", hasNotionDishes: false }),
    ).toBe("refuse-production");
    expect(
      seedDecision({ vercelEnv: "production", hasNotionDishes: true }),
    ).toBe("refuse-production");
    expect(seedDecision({ vercelEnv: "preview", hasNotionDishes: true })).toBe(
      "skip-imported",
    );
    expect(seedDecision({ vercelEnv: "preview", hasNotionDishes: false })).toBe(
      "insert",
    );
  });
});

describe("planSeedRetirement", () => {
  it("repoints a matching name, deletes an unused seed, and inactivates a referenced one", () => {
    const ops = planSeedRetirement({
      seeds: [
        { id: "seed-pork", name: " 红烧肉 ", isActive: true },
        { id: "seed-cucumber", name: "拍黄瓜", isActive: true },
        { id: "seed-rice", name: "米饭", isActive: true },
      ],
      imported: [{ id: "imported-pork", name: "红烧肉", isActive: true }],
      referencedSeedIds: new Set(["seed-pork", "seed-rice"]),
    });
    expect(ops).toEqual([
      { kind: "repoint", seedId: "seed-pork", importedId: "imported-pork" },
      { kind: "delete", seedId: "seed-cucumber" },
      { kind: "inactivate", seedId: "seed-rice" },
    ]);
  });
});
