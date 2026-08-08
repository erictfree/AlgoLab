# AlgoLab performer-panel audit

Date: 2026-08-08

## Scope

Combined UX and screenshot-based accessibility audit of the right-side performer drawer at 1280×720. The user goal is to configure audio, understand the active scene, find/install a patch, and recover safely without losing sight of the live visual.

## Captured flow

1. `01-workspace.png` — Healthy. The default workspace correctly prioritizes code and canvas and keeps the drawer optional.
2. `02-panel-top.png` — At risk. Setup controls, recovery, opacity, and the fully expanded patch catalog all compete at the top of the drawer.
3. `04-panel-bottom.png` — At risk. The active scene, messages, and recovery context require substantial scrolling past available patches.
4. `05-simplified-panel.png` — Healthy. Audio and the active scene are visible first; recovery is colocated with the scene; setup-only sections are collapsed.
5. `06-compact-library.png` — Healthy. The closed library exposes its installed count; opening it shows filters and three concise category choices without an empty user category.
6. `07-patch-group.png` — Healthy. Opening one category reveals explicit Available/Install controls while keeping the other categories compact.

## Findings and changes

- Moved Set safe and Restore into the Scene section. They describe scene/project recovery, not global navigation.
- Moved Loop into Audio and drawer opacity into Project & performance.
- Reduced the permanent header to the product name and audience layout.
- Put Scene before Patch library, and collapsed Patch library and Messages by default.
- Added automatic Messages expansion for warnings and errors.
- Collapsed smoothing and auto-gain under Analysis settings.
- Added a compact installed count to the closed library.
- Converted library categories to independent disclosures and removed categories with no patches.
- Hid Parameters when the current project declares none.
- Reworded the runtime count as “running · active · installed” instead of an unexplained numeric ratio.
- Increased drawer width, disclosure-row height, button height, and keyboard focus visibility.

## Remaining risks and limits

- Screenshot evidence cannot confirm screen-reader announcements or complete keyboard order. Those need assistive-technology and keyboard-only testing.
- The 26px dense desktop button height is more usable than before but is still below a touch-oriented 44px target; AlgoLab is currently optimized for laptop performance use.
- The icon-only global toolbar remains compact and depends on tooltips and the key-command sheet. It was outside this drawer-focused pass.
