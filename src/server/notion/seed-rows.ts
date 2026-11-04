import { normalizeDishName } from "@/server/notion/text";

export type SeedRow = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ImportedNameRow = {
  id: string;
  name: string;
  isActive: boolean;
};

export type SeedRetirementOp =
  | { kind: "repoint"; seedId: string; importedId: string }
  | { kind: "delete"; seedId: string }
  | { kind: "inactivate"; seedId: string };

/**
 * Seed rows have no Notion page id.
 * A matching imported name takes over menu links and the seed is deleted.
 * Otherwise an unreferenced seed is deleted, and a referenced one is inactivated.
 */
export function planSeedRetirement(input: {
  seeds: readonly SeedRow[];
  imported: readonly ImportedNameRow[];
  referencedSeedIds: ReadonlySet<string>;
}): SeedRetirementOp[] {
  const byName = new Map<string, ImportedNameRow>();
  const ordered = [...input.imported].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  for (const row of ordered) {
    const key = normalizeDishName(row.name);
    if (!key || byName.has(key)) continue;
    byName.set(key, row);
  }

  const ops: SeedRetirementOp[] = [];
  for (const seed of input.seeds) {
    const match = byName.get(normalizeDishName(seed.name));
    if (match && match.id !== seed.id) {
      ops.push({
        kind: "repoint",
        seedId: seed.id,
        importedId: match.id,
      });
      continue;
    }
    if (!input.referencedSeedIds.has(seed.id)) {
      ops.push({ kind: "delete", seedId: seed.id });
      continue;
    }
    if (seed.isActive) {
      ops.push({ kind: "inactivate", seedId: seed.id });
    }
  }
  return ops;
}
