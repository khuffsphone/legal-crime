import { describe, it, expect } from "vitest";
import { renderGallery } from "../src/gallery.js";
import { ARCHETYPES, type Catalog, type CatalogEntry } from "../src/types.js";

function catalogOf(entries: CatalogEntry[]): Catalog {
  return {
    schema: 1,
    generated_at: "2026-07-07T00:00:00.000Z",
    meshy_root: "/abs/meshy",
    archetypes: [...ARCHETYPES],
    descriptor_vocab: {} as never,
    count: entries.length,
    entries,
  };
}

const entry: CatalogEntry = {
  task_id: "task-a",
  glb_path: "task-a/model.glb",
  thumbnail_path: "_catalog/task-a.png",
  descriptor: { apparent_sex: "", apparent_age: "", dress: "", proposed_archetype: "", confidence: "" },
  notes: "mode=image-to-3d textures=2",
};

describe("renderGallery", () => {
  it("embeds the thumbnail inline with a path RELATIVE to the gallery (basename)", () => {
    const md = renderGallery(catalogOf([entry]));
    expect(md).toContain("![task-a](task-a.png)"); // not _catalog/task-a.png — gallery lives in _catalog/
    expect(md).toContain("### task-a");
    expect(md).toContain("`task-a/model.glb`");
    expect(md).toContain("mode=image-to-3d");
  });

  it("lists the 7 archetypes and the vocab", () => {
    const md = renderGallery(catalogOf([entry]));
    for (const a of ARCHETYPES) expect(md).toContain(a);
    expect(md).toContain("male/female/unknown");
    expect(md).toContain("suit/dress/uniform/workclothes/unknown");
  });

  it("flags a not-yet-rendered thumbnail when a rendered-set is supplied", () => {
    const md = renderGallery(catalogOf([entry]), new Set()); // nothing rendered
    expect(md).toContain("not rendered yet");
    expect(md).not.toContain("![task-a](task-a.png)");
  });

  it("shows the image when the thumbnail is in the rendered set", () => {
    const md = renderGallery(catalogOf([entry]), new Set(["_catalog/task-a.png"]));
    expect(md).toContain("![task-a](task-a.png)");
  });

  it("renders filled descriptor values", () => {
    const labeled: CatalogEntry = { ...entry, descriptor: { apparent_sex: "female", apparent_age: "adult", dress: "dress", proposed_archetype: "civilian", confidence: "medium" } };
    const md = renderGallery(catalogOf([labeled]));
    expect(md).toContain("`female`");
    expect(md).toContain("`civilian`");
  });

  it("handles an empty catalog", () => {
    const md = renderGallery(catalogOf([]));
    expect(md).toContain("No GLBs found");
  });
});
