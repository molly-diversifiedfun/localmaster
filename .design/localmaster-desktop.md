---
surface: "localmaster-desktop"
brand: "localmaster"
mode: "dark"

concept_words:
  - "signal-chain"
  - "headroom"
  - "matrix-stamp"
  - "meter-glow"

pov_statement: "This UI is a calibrated instrument for musicians who need club-ready masters without hiring a mastering engineer."

anti_defaults:
  - "Card-grid dashboard: mastering is a linear signal path, not a collection of widgets — the layout is one continuous flow, not tiles."
  - "Indigo/purple SaaS gradient: the only saturated color is the signal green of a driven meter; decoration never gets hue."
  - "Inter-everywhere sameness: measurement data is typographically distinct (mono, stamped) from interface labels — numbers are the product."
  - "Bouncy spring motion: meters and transitions damp like analog needles; nothing overshoots."

type:
  primary_family: "IBM Plex Sans"
  primary_role: "body"
  secondary_family: "IBM Plex Mono"
  secondary_role: "mono"
  scale_ratio: 1.333
  base_size_px: 16
  named_sizes:
    xs: "12px"
    sm: "14px"
    base: "16px"
    md: "21px"
    lg: "28px"
    xl: "37px"
    2xl: "50px"
  weights:
    light: null
    regular: 400
    medium: 500
    semibold: 600
    bold: 700
  line_heights:
    tight: 1.15
    normal: 1.5
    loose: 1.7
  tracking:
    tight: "-0.015em"
    normal: "0"
    wide: "0.08em"

color:
  mode: "dark"
  roles:
    background: { hex: "#151916", hsl: [160, 8, 9] }
    surface: { hex: "#1E2420", hsl: [160, 8, 13] }
    border: { hex: "#29322D", hsl: [158, 10, 18] }
    text: { hex: "#E9EDEB", hsl: [150, 10, 92], on: "background" }
    text-secondary: { hex: "#99A49E", hsl: [147, 6, 62], on: "background" }
    brand: { hex: "#42D799", hsl: [155, 65, 55] }
    accent: { hex: "#F5A83D", hsl: [35, 90, 60] }
    success: { hex: "#34B27D", hsl: [155, 55, 45] }
    warning: { hex: "#EEAD2B", hsl: [40, 85, 55] }
    error: { hex: "#DD493C", hsl: [5, 70, 55] }
    info: { hex: "#4775D1", hsl: [220, 60, 55] }

spacing:
  base_unit: "4px"
  scale:
    "1": "4px"
    "2": "8px"
    "3": "12px"
    "4": "16px"
    "6": "24px"
    "8": "32px"
    "12": "48px"
    "16": "64px"
    "20": "80px"
    "24": "96px"
    "32": "128px"
    "40": "160px"
    "48": "192px"
    "64": "256px"

radii:
  none: "0"
  sm: "2px"
  md: "6px"
  lg: "12px"
  xl: "20px"
  full: "9999px"
  philosophy: "sharp"

shadows:
  tint_hex: "#0A120D"
  sm: "0 1px 2px 0 rgba(10, 18, 13, 0.55)"
  md: "0 3px 8px -1px rgba(10, 18, 13, 0.6)"
  lg: "0 10px 24px -4px rgba(10, 18, 13, 0.65)"
  xl: "0 20px 48px -8px rgba(10, 18, 13, 0.7)"

signature_element:
  name: "matrix-stamp"
  description: "Every measured state renders as a stamped mono block, like the matrix numbers etched into vinyl deadwax: '−9.4 LUFS · −1.1 dBTP · 24bit/48k'. Wide-tracked IBM Plex Mono, text-secondary at rest, brand green when the value is a fresh render result. It turns the engine's honesty (real measurements, deterministic DSP) into the visual identity."
  where_used:
    - "track header after analysis"
    - "A/B compare bar (both sides stamped)"
    - "export confirmation + DJ checklist"
    - "batch results table rows"
  implementation_note: "font-mono text-xs tracking-[0.08em] uppercase; values separated by '·'; color transitions text-secondary → brand on fresh data via 200ms ease-out."

layout:
  concept: "left-weighted signal rail — a fixed narrow stage rail (import → analyze → master → export) pins the left edge; content bleeds right with the layered waveform as the full-width hero. Asymmetric move: the rail never centers, and the waveform hero breaks the content column to bleed to the window edge on the right only."
  grid_columns: 12
  max_content_width: "1400px"
  page_padding_x: "clamp(1.5rem, 4vw, 3rem)"
  density: "comfortable"
  primary_pattern: "signal rail + single-flow main"

motion:
  philosophy: "purposeful"
  duration_base_ms: 200
  easing_default: "cubic-bezier(0.25, 0, 0.35, 1)"
  easing_enter: "cubic-bezier(0.2, 0, 0.3, 1)"
  easing_exit: "cubic-bezier(0.4, 0, 1, 1)"
  reduced_motion_strategy: "meters snap to final value, waveform playhead updates discretely at 4Hz, all transforms disabled; opacity-only state changes remain."
---

## Concept

A mastering chain is a straight line — signal in, signal out — and the interface should be
the same line. The four concept words each veto something concrete: *signal-chain* kills any
dashboard-grid impulse (one flow, one direction); *headroom* keeps the dark canvas mostly
empty the way a good master keeps peaks below ceiling; *matrix-stamp* makes measurement the
decoration (there is no other ornament); *meter-glow* rations color to the one place it
means something — live signal. The app should feel like an instrument you trust, which is
also the product's actual claim: deterministic DSP, real numbers, nothing hidden.

## Type Rationale

IBM Plex carries lab-equipment lineage without novelty-font risk. Plex Sans does all
interface work; Plex Mono is reserved exclusively for measured values — LUFS, dBTP, bit
depth, timestamps — so a glance separates "what the app says" from "what the engine
measured." That split is the hierarchy: numbers are the product, labels are furniture. One
superfamily, two voices, no cross-family friction. Perfect-fourth scale (1.333) gives the
few large moments (track title, the one CTA) real authority against a quiet 14–16px body.

## Color Rationale

One anchor: signal green (`#42D799`, hue 155 — a driven VU LED, not a success toast),
derived into a graphite-green neutral ramp so even the background is the same material as
the signal. Green appears only where signal is live or a result is fresh: playhead, active
meter segments, the master side of the A/B, fresh matrix stamps, the primary CTA. Amber is
the needle's warning zone — transient-guard notices, loud warnings — never decoration. The
indigo/purple SaaS default is structurally excluded (validator-enforced), and since the
palette is ~95% neutral, the design reads monochrome until the audio does something.

## Signature Element

The matrix stamp. Vinyl deadwax carries etched matrix numbers — terse, permanent,
machine-set proof of which cut you hold. Every LocalMaster measurement renders in that
register: wide-tracked mono caps, values separated by interpuncts, quiet gray at rest,
signal green for two beats when freshly measured. It appears at every stage (analysis
header, A/B bar, export confirmation, batch rows), so the identity IS the honesty: the app
never shows a vibe where it could show a number. Memorable because no dashboard template
does this — numbers there are KPI cards; here they're etchings.

## What This Design Is NOT

- Not a card-grid dashboard — no stat tiles, no widget wall; one signal path.
- Not a gradient-and-glassmorphism showcase — surfaces are flat graphite; depth comes from
  the warm-tinted shadow ramp only.
- Not a colorful app — if a screenshot looks colorful, something is wrong; green means
  signal, amber means caution, everything else is material.
- Not skeuomorphic hardware cosplay — no knob textures, no brushed metal, no fake screws;
  the instrument feel comes from damped motion and stamped numbers, not chrome.
- Not a web page in a window — no marketing hero, no footer, no breadcrumbs; it opens ready
  to receive a file.
