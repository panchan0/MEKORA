# MEKORA v1.2.0 Changelog

## Added
- Quick placeholder implementation for the starter mecha **AXIOM** using the user-provided red-and-black concept art.
- New external asset files under `public/assets/mechas/` for the starter mecha visual.
- Visual verification targets for menu and garage previews.

## Changed
- The starter mecha now uses the placeholder artwork in the **main menu** and **garage / hangar**.
- AXIOM palette updated to a red / black identity so gameplay rendering better matches the new placeholder.
- Menu stage label changed from a hardcoded `VANGUARD` reference to the more generic `ACTIVE UNIT`.
- Verification scripts and project metadata updated to **v1.2.0**.

## Polished
- Garage preview image scaling tuned for the new placeholder artwork.
- Low-quality mode rules updated so image-based mecha previews also respect reduced effects.
- Project package, docs and release metadata aligned for a clean upgrade path.

## Verified
- Menu renders the new starter mecha placeholder correctly.
- Garage / hangar preview renders the new starter mecha placeholder correctly.
- JavaScript syntax checks pass.
- The project archive remains valid after extraction.
