import { describe, it, expect } from "vitest";
import { buildCatalog, thumbnailName, toPosix, descriptorIsLabeled } from "../src/build.js";
import { ARCHETYPES, type Catalog } from "../src/types.js";
import type { GlbAsset, ManifestEntry } from "../src/scan.js";

function asset(taskId: string, glbRel: string, textures: string[] = []): GlbAsset {
  return { taskId, glbAbs: `/abs/${glbRel}`, glbRel, textures };
}

describe("helpers", () => {
  it("toPosix normalizes separators", () => {
    expect(toPosix("a\\b\\c")).toBe("a/b/c");
    expect(toPosix("a/b/c")).toBe("a/b/c");
  });
  it("thumbnailName is <task>.png single, <task>__<stem>.png multi", () => {
    expect(thumbnailName(asset("t", "t/model.glb"), false)).toBe("t.png");
    expect(thumbnailName(asset("t", "t/a.glb"), true)).toBe("t__a.png");
  });
  it("descriptorIsLabeled detects any non-empty field", () => {
    expect(descriptorIsLabeled({ apparent_sex: "", apparent_age: "", dress: "", proposed_archetype: "", confidence: "" })).toBe(false);
    expect(descriptorIsLabeled({ apparent_sex: "male", apparent_age: "", dress: "", proposed_archetype: "", confidence: "" })).toBe(true);
    expect(descriptorIsLabeled(undefined)).toBe(false);
  });
});

describe("buildCatalog", () => {
  const nowIso = "2026-07-07T00:00:00.000Z";
  const meshyRoot = "/abs/meshy";

  it("produces the frozen entry schema with EMPTY descriptors, sorted", async () => {
    const assets = [asset("t-b", "t-b/model.glb"), asset("t-a", "t-a/model.glb", ["x.png"])];
    const cat = buildCatalog(assets, {}, { meshyRoot, nowIso });

    expect(cat.schema).toBe(1);
    expect(cat.count).toBe(2);
    expect(cat.archetypes).toEqual([...ARCHETYPES]);
    expect(cat.entries.map((e) => e.task_id)).toEqual(["t-a", "t-b"]); // sorted

    const e = cat.entries[0]!;
    expect(Object.keys(e).sort()).toEqual(["descriptor", "glb_path", "notes", "task_id", "thumbnail_path"]);
    expect(Object.keys(e.descriptor).sort()).toEqual(["apparent_age", "apparent_sex", "confidence", "dress", "proposed_archetype"]);
    expect(Object.values(e.descriptor).every((v) => v === "")).toBe(true);
    expect(e.glb_path).toBe("t-a/model.glb");
    expect(e.thumbnail_path).toBe("_catalog/t-a.png");
    expect(e.notes).toContain("textures=1");
  });

  it("seeds notes from the manifest entry", () => {
    const manifest: Record<string, ManifestEntry> = { "t-a": { mode: "image-to-3d", prompt: "a suited man", art_style: "realistic" } };
    const cat = buildCatalog([asset("t-a", "t-a/model.glb")], manifest, { meshyRoot, nowIso });
    expect(cat.entries[0]!.notes).toContain("mode=image-to-3d");
    expect(cat.entries[0]!.notes).toContain('prompt="a suited man"');
  });

  it("uses the __<stem> thumbnail suffix for a multi-GLB task dir", () => {
    const cat = buildCatalog([asset("t", "t/a.glb"), asset("t", "t/b.glb")], {}, { meshyRoot, nowIso });
    expect(cat.entries.map((e) => e.thumbnail_path).sort()).toEqual(["_catalog/t__a.png", "_catalog/t__b.png"]);
  });

  it("PRESERVES an already-labeled descriptor + notes on re-run, refreshing derived paths", () => {
    const existing: Catalog = {
      schema: 1,
      generated_at: "old",
      meshy_root: meshyRoot,
      archetypes: [...ARCHETYPES],
      descriptor_vocab: {} as never,
      count: 1,
      entries: [
        {
          task_id: "t-a",
          glb_path: "t-a/model.glb",
          thumbnail_path: "_catalog/t-a.png",
          descriptor: { apparent_sex: "male", apparent_age: "adult", dress: "suit", proposed_archetype: "boss", confidence: "high" },
          notes: "hand-labeled",
        },
      ],
    };
    const cat = buildCatalog([asset("t-a", "t-a/model.glb")], {}, { meshyRoot, nowIso, existing });
    expect(cat.entries[0]!.descriptor.proposed_archetype).toBe("boss");
    expect(cat.entries[0]!.notes).toBe("hand-labeled");
  });

  it("does NOT preserve an unlabeled prior entry (fresh scaffold wins, e.g. re-seeded notes)", () => {
    const existing: Catalog = {
      schema: 1, generated_at: "old", meshy_root: meshyRoot, archetypes: [...ARCHETYPES],
      descriptor_vocab: {} as never, count: 1,
      entries: [{ task_id: "t-a", glb_path: "t-a/model.glb", thumbnail_path: "_catalog/t-a.png", descriptor: { apparent_sex: "", apparent_age: "", dress: "", proposed_archetype: "", confidence: "" }, notes: "stale" }],
    };
    const manifest: Record<string, ManifestEntry> = { "t-a": { mode: "image-to-3d" } };
    const cat = buildCatalog([asset("t-a", "t-a/model.glb")], manifest, { meshyRoot, nowIso, existing });
    expect(cat.entries[0]!.notes).toContain("mode=image-to-3d"); // re-seeded, not "stale"
  });
});
