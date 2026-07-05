# Distribution landscape — DistroKid / LANDR / aggregator APIs

Verified 2026-07-05 (web sources cited inline). Context for the "release-ready
export" feature and any future "Distribute" ambition.

## The model

Spotify/Apple/etc. don't accept uploads from individuals — only from approved
distributors delivering releases in DDEX format with metadata, artwork, and
rights info ("aggregators"). DistroKid: flat yearly subscription, unlimited
uploads, artist keeps royalties. LANDR: bundles distribution into the same
subscription funnel as its mastering — master a track, then "release" without
leaving their site. The bundling is deliberate: mastering is the on-ramp,
distribution is the recurring revenue. That is exactly the seam LocalMaster
sits on.

## Direct answer: DistroKid has NO public API

No official developer program. The only artifact is an unofficial wrapper
reverse-engineered from their iOS app (https://github.com/sowahq/distrogo) —
ToS-violating and fragile; LocalMaster must not build on it. LANDR likewise
keeps distribution inside its own platform. Artist-facing products are walled
gardens on purpose.

## API-driven distribution exists one tier up (B2B infrastructure)

- **LabelGrid** — developer API for automated delivery + royalty reporting
  (https://labelgrid.com/for-developers/ · https://labelgrid.com/compare/)
- **limbo/** — REST API + MCP server, built to be the backend of someone
  else's music product (https://www.limbomusic.com/api-music-distribution)
- **Move Music** — white-label REST (https://www.movemusic.io/services.html)
- Enterprise (sales-gated): Revelator, SonoSuite, FUGA

Integrating any of these makes LocalMaster's operator the **distributor of
record** — rev-share terms, content/rights vetting, tax forms. A business,
not a feature.

## Two honest paths

1. **Now (chosen, on roadmap): "Release-ready export."** Destination-aware
   export profile: DistroKid/streaming checklist instead of the DJ checklist,
   16/24-bit WAV at accepted specs, −14 LUFS streaming variant alongside the
   −9 club master, metadata sidecar covering the upload form's fields, then
   open the upload page. All friction removed short of the upload click; zero
   fragile APIs.
2. **Later, only if LocalMaster becomes a product:** aggregator API
   integration (LabelGrid or limbo look most developer-friendly) for a true
   master→distribute flow. Requires a decision brief first — it changes what
   LocalMaster *is*.

Sources: https://distrokid.com/ · https://github.com/sowahq/distrogo ·
https://labelgrid.com/for-developers/ · https://labelgrid.com/compare/ ·
https://www.limbomusic.com/api-music-distribution ·
https://www.movemusic.io/services.html
