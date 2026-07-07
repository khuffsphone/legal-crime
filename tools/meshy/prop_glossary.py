import re, os, json, glob

ROOT = r"C:\Users\KHuff\legal-crime"
tax = open(os.path.join(ROOT, "src/scenes/env/streetscapeTaxonomy.ts"), encoding="utf-8").read()
m = re.search(r"PropFamilyId\s*=([^;]+);", tax, re.S)
families = re.findall(r"'([^']+)'", m.group(1)) if m else []

# map each prop GLB (by keyword) to a PropFamilyId
prop_dir = os.path.join(ROOT, "assets/raw/meshy")
glbs = [os.path.basename(p) for p in glob.glob(os.path.join(prop_dir, "*.glb"))
        if "Merged_Animations" not in os.path.basename(p)]

# keyword -> family mapping (best fit into the locked 28)
KW = {
    "Street_Lamp": "street_lamp", "Utility_Pole": "utility_pole", "Fire_Hydrant": "fire_hydrant",
    "Manhole_Cover": "manhole_cover", "Storm_Drain": "sewer_grate", "Stop_Sign": "traffic_signal",
    "Street_Sign": "blade_sign", "Street_Clock": "statue_monument", "Telephone_Boo": "police_call_box",
    "Postal_Box": "mailbox", "Trash_Can": "trash_can", "Hitching_Post": "bollard",
    "Iron_Fence": "hedge_shrub", "Newsstand": "news_stand", "Vendor_Pushca": "vendor_cart",
    "Hand_Cart": "vendor_cart", "Park_Bench": "bench", "Street_Props": "crate_stack",
    "Alley_Door": "awning", "Building_Stoo": "planter", "Fire_Escape": "awning",
    "Steamer_Trunk": "crate_stack", "Bar_Counter": "produce_stall", "Table_and_C": "produce_stall",
}

rows = []
for g in sorted(glbs):
    fam = None
    for kw, f in KW.items():
        if kw in g:
            fam = f; break
    label = re.sub(r"^Meshy_AI_", "", g).replace("_image-to-3d-texture.glb", "").replace(".glb", "")
    rows.append({"glb": g, "label": label, "proposed_family": fam or "UNMAPPED",
                 "in_canon": (fam in families) if fam else False})

out = {"family_count": len(families), "families": families, "prop_count": len(rows), "props": rows}
os.makedirs(os.path.join(ROOT, "assets/raw/meshy/_catalog"), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, "assets/raw/meshy/_catalog/PROP_GLOSSARY.json"), "w", encoding="utf-8"), indent=2)

# markdown
md = ["# Brassmere Environmental Prop Glossary", "",
      f"{len(rows)} Meshy props mapped to the locked {len(families)} PropFamilyId vocabulary.", "",
      "| Prop (Meshy) | Proposed PropFamilyId | In canon vocab |", "|---|---|---|"]
for r in rows:
    md.append(f"| {r['label']} | `{r['proposed_family']}` | {'yes' if r['in_canon'] else 'NO'} |")
md += ["", "## The 28 canon PropFamilyIds", "", ", ".join(f"`{f}`" for f in families)]
open(os.path.join(ROOT, "assets/raw/meshy/_catalog/PROP_GLOSSARY.md"), "w", encoding="utf-8").write("\n".join(md))
print("GLOSSARY_OK props=%d families=%d unmapped=%d" % (
    len(rows), len(families), sum(1 for r in rows if r["proposed_family"] == "UNMAPPED")))
