# Design QA: AlgoLab AET welcome screen

## Evidence

- Layout source visual truth: `/var/folders/sg/9nymdc8j0c54fm3t4kpc0mdw0000gn/T/codex-clipboard-d5fa7ea0-106b-4758-8a8b-7ecaf77fcff7.png`.
- Brand source visual truth: `assets/brand/aet-logo-full-color-gradient.png`.
- Layout source pixels: 4010 × 2220.
- Brand source pixels: 15526 × 4268.
- Implementation: `http://localhost:5173/`.
- Implementation screenshot: `/private/tmp/algolab-welcome.png`.
- Implementation pixels and CSS viewport: 1280 × 720 at device scale 1.
- Combined comparison: `/private/tmp/algolab-welcome-comparison.png`. The Hydra source and implementation were aspect-fit into 1280 × 720 black frames; the logo was aspect-fit into a 1280 × 720 white frame.
- State: initial startup dialog, before choosing an audio source, with the live performance canvas behind it.

## Findings

No actionable P0, P1, or P2 differences remain. The implementation keeps the reference's centered information-window composition while using the supplied AET logo's white field and sampled orange, magenta, mauve, and violet colors as its visual system.

## Full-view comparison evidence

The three-panel normalized comparison shows that the implementation retains the source layout's dark live canvas, single centered information window, strong product heading, explanatory middle, and getting-started controls. The white dialog now connects continuously to the logo asset instead of isolating the logo in a white rectangle on a dark card. Its smaller information footprint is intentional: AlgoLab needs a short orientation and an audio choice, not Hydra's long documentation page.

## Focused region comparison evidence

A separate crop was not required. At 1280 × 720, the combined comparison keeps the supplied logo, AlgoLab title, descriptive subtitle, institutional line, concept labels, keyboard command, and all three controls readable. The logo remains sharp, aspect-correct, and visually uninterrupted by a contrasting container.

## Required fidelity surfaces

- Fonts and typography: the existing AlgoLab monospace stack remains consistent with the live-coding product. The product name has the strongest hierarchy, “Audio-reactive visual live coding in the browser” is secondary, and “The University of Texas at Austin” is a compact institutional signature rather than competing display text.
- Spacing and layout rhythm: the header uses one continuous white field with a subtle divider between the AET mark and product identity. Body, concept row, reassurance, and action footer keep distinct groupings and consistent alignment. The existing responsive breakpoint stacks the header, concepts, and actions for narrow screens.
- Colors and visual tokens: the dialog is pure white; dividers and the action footer use neutral lavender-gray. Brand colors are sampled from the supplied asset: orange `#f78f27`, magenta `#ee2877`, mauve `#b154a0`, and violet `#7353a3`. The dark blurred canvas remains the backdrop.
- Image quality and asset fidelity: the exact supplied PNG is served from `assets/brand/aet-logo-full-color-gradient.png`, aspect-fit, and shown on a matching white field. No SVG, CSS drawing, placeholder, or substitute mark was introduced.
- Copy and content: the intro now explicitly identifies and links the Department of Arts and Entertainment Technologies at The University of Texas at Austin. Patch, scene, live evaluation, safe failure behavior, and the three audio entry choices remain concise and student-facing.
- Controls and accessibility: all entry actions use explicit labels. The AET logo and department name link to `https://aet.utexas.edu/`; the logo link has an explicit accessible name and visible keyboard focus ring. The magenta primary action retains its violet focus ring, semantic modal labelling, descriptive copy, and logo alt text.
- Waiting state: the silent starter scene continues advancing behind the modal, while a slow AET-colored ambient layer keeps the exposed frame visibly alive. The animation is disabled when the user requests reduced motion.

## Interaction and runtime checks

- The updated dialog, institutional line, and logo were visible in the in-app browser.
- `enter with silence` dismissed the welcome and returned to the active stage.
- The DOM accessibility snapshot exposed the named dialog and University of Texas line.
- Unit tests: 119 passed.
- Focused browser checks for the welcome and renamed export passed.

## Open questions

- None for the selected title and subtitle.

## Comparison history

1. First white-treatment comparison: no actionable P0/P1/P2 differences. The requested white dialog, exact logo field, institutional attribution, and brand-color mapping were all visible in the normalized comparison, so no correction loop was required.

## Implementation checklist

- [x] Match the dialog field to the supplied logo's white background.
- [x] Use sampled AET brand colors for hierarchy and actions.
- [x] Add The University of Texas at Austin attribution.
- [x] Preserve the centered live-instrument welcome composition.
- [x] Retain responsive behavior and explicit entry controls.
- [x] Verify the primary dismissal interaction in the in-app browser.
- [x] Apply AlgoLab consistently to visible chrome, documentation, exports, and the console namespace.
- [x] Preserve locally saved projects and imports from the former Livecode Lab, Patchlab, Patchbay, and Response product names.

## Follow-up polish

- No visual P3 item remains from the rename.

final result: passed
