# AlgoLab performer-panel audit

Date: 2026-08-08

## Scope

Combined UX and screenshot-based accessibility audit of the right-side performer drawer at 1280×720. The user goal is to configure audio, find/install a patch, read diagnostics, and recover safely without losing sight of the live visual. Scene composition remains source-authoritative in the editor.

## Captured flow

1. `01-workspace.png` — Healthy. The default workspace correctly prioritizes code and canvas and keeps the drawer optional.
2. `02-panel-top.png` — At risk. Setup controls, recovery, opacity, and the fully expanded patch catalog all compete at the top of the drawer.
3. `04-panel-bottom.png` — At risk. The active scene, messages, and recovery context require substantial scrolling past available patches.
4. `05-simplified-panel.png` — Healthy. Audio and the active scene are visible first; recovery is colocated with the scene; setup-only sections are collapsed.
5. `06-compact-library.png` — Healthy. The closed library exposes its installed count; opening it shows filters and three concise category choices without an empty user category.
6. `07-patch-group.png` — Healthy. Opening one category reveals explicit Available/Install controls while keeping the other categories compact.
7. `08-current-drawer.png` — At risk. Audio, Scene, Library, Messages, History, and Project share one accordion stack; Scene duplicates the visible source while Messages and Library compete for height.
8. `09-separated-audio.png` — Healthy. Audio has a dedicated, quiet workspace with the source and analysis controls visible without unrelated content.
9. `10-separated-library.png` — Healthy. Library lifecycle guidance, the configured starter scene, filters, and categories are isolated in one task-focused workspace.
10. `11-separated-messages.png` — Healthy. Diagnostics and evaluation history are colocated and no longer compete with audio or patch browsing.
11. `12-separated-project.png` — Healthy. Recovery, project portability, performance threshold, and drawer opacity are grouped as project-level concerns.

## Findings and changes

- Replaced the long accordion with four explicit workspaces: Audio, Library, Messages, and Project.
- Removed the Scene panel. The scene array and its order remain visible and editable in the code, which is the source of truth.
- Moved Set safe and Restore into Project alongside import, export, reset, FPS threshold, and drawer opacity.
- Kept configured-example insertion in Library, where students choose and install patches.
- Kept live parameters with Library because they control installed/active patch behavior.
- Colocated diagnostics and evaluation history under Messages.
- Errors switch directly to Messages; ordinary status updates do not steal the current workspace.
- Added arrow-key, Home, and End navigation to the tab list and visible selected/focus states.
- Kept lifecycle filters and categories within Library, with the installed count visible on its tab.

## Remaining risks and limits

- Screenshot evidence cannot confirm screen-reader announcements. The tab roles and keyboard behavior are implemented, but assistive-technology testing is still needed.
- The dense desktop controls remain below a touch-oriented 44px target; AlgoLab is currently optimized for laptop performance use.
- The icon-only global toolbar remains compact and depends on tooltips and the key-command sheet. It was outside this drawer-focused pass.
