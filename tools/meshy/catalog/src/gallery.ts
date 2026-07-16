import * as posix from "node:path/posix";
import { ARCHETYPES, DESCRIPTOR_VOCAB, type Catalog, type CatalogEntry } from "./types.js";

/** Image src for a thumbnail, relative to the gallery.md (which lives in the same _catalog dir). */
function thumbSrc(entry: CatalogEntry): string {
  return posix.basename(entry.thumbnail_path);
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderEntry(entry: CatalogEntry, rendered: Set<string> | null): string {
  const d = entry.descriptor;
  const src = thumbSrc(entry);
  const img =
    rendered && !rendered.has(entry.thumbnail_path)
      ? `> ⚠ thumbnail not rendered yet — run the catalog with Blender available (\`${entry.thumbnail_path}\`).`
      : `![${escapeCell(entry.task_id)}](${src})`;
  const val = (s: string) => (s ? `\`${escapeCell(s)}\`` : "");
  return [
    `### ${entry.task_id}`,
    "",
    img,
    "",
    "| field | value |",
    "| --- | --- |",
    `| glb | \`${escapeCell(entry.glb_path)}\` |`,
    `| notes | ${escapeCell(entry.notes)} |`,
    `| apparent_sex | ${val(d.apparent_sex)} |`,
    `| apparent_age | ${val(d.apparent_age)} |`,
    `| dress | ${val(d.dress)} |`,
    `| proposed_archetype | ${val(d.proposed_archetype)} |`,
    `| confidence | ${val(d.confidence)} |`,
    "",
  ].join("\n");
}

/**
 * Render the catalog as a single scrollable Markdown contact sheet with the
 * thumbnails embedded inline (relative paths). Pass `rendered` (the set of
 * thumbnail_path values that exist on disk) to flag any not-yet-rendered ones;
 * omit it to assume all present.
 */
export function renderGallery(catalog: Catalog, rendered?: Set<string> | null): string {
  const header = [
    "# Meshy character catalog",
    "",
    `_Generated ${catalog.generated_at}. ${catalog.count} model(s)._`,
    "",
    "Descriptors are **empty** — fill them by reading each thumbnail (each image is **front ｜ 3/4**).",
    "This is a contact sheet: view it in a Markdown previewer with the `_catalog/` folder alongside,",
    "or drop the thumbnails into a chat for a vision-LLM labeling pass, then write the results into `catalog.json`.",
    "",
    `**proposed_archetype ∈** ${ARCHETYPES.join(" · ")}`,
    "",
    "**Vocab** — " +
      [
        `sex: ${DESCRIPTOR_VOCAB.apparent_sex.join("/")}`,
        `age: ${DESCRIPTOR_VOCAB.apparent_age.join("/")}`,
        `dress: ${DESCRIPTOR_VOCAB.dress.join("/")}`,
        `confidence: ${DESCRIPTOR_VOCAB.confidence.join("/")}`,
      ].join(" · "),
    "",
    "---",
    "",
  ].join("\n");

  const body =
    catalog.entries.length === 0
      ? "_No GLBs found under the meshy root._\n"
      : catalog.entries.map((e) => renderEntry(e, rendered ?? null)).join("\n---\n\n");

  return `${header}${body}`;
}
