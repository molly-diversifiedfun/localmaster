# Examples

`generated/` (gitignored) holds synthetic test audio — pink noise at known
LUFS, sines, a −90 dBFS dither-test ramp, a transient-rich "songlike" synth,
and a 5-track album set spanning −28…−12 LUFS.

Regenerate any time:

```bash
make fixtures
# or: cd apps/audio-engine && uv run python tools/gen_synthetic.py
```

Everything is synthesized with fixed seeds (deterministic) — no copyrighted
audio exists anywhere in this repository. To try the real flow, use any WAV
you exported from your own Suno projects.
