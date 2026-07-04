# DJ Export Guide

## The short version

Export **24-bit WAV at the source sample rate** with the **Clean DJ Master**
preset. That's the default for a reason: every mainstream DJ platform
(rekordbox, Serato, Traktor, Engine DJ) reads 24-bit WAV, and 24-bit keeps
~48 dB more floor than 16-bit for gain moves in the booth.

## Loudness for DJ sets, honestly

- Club/festival players gain-stage tracks themselves. A −7 LUFS "wall" master
  does not sound louder through the booth chain than a −9 LUFS master — it just
  arrives with less headroom and less punch.
- Clean DJ Master targets ≈ −9 LUFS integrated at −1.0 dBTP with a 4 dB
  transient-guard budget. On very dynamic tracks it will honestly land around
  −10 to −11 LUFS instead of crushing your transients — the report tells you
  when that happened. If you want the wall anyway, use Loud Club Master or
  raise the loudness/budget in the workspace.
- Keep true peak ≤ −1.0 dBTP. Some CDJ/converter chains clip inter-sample
  peaks above that on lossy transcodes.

## The DJ readiness checklist (in every report)

| Check | Meaning |
|---|---|
| no clipping | no ≥3-sample runs at full scale in the output |
| peak within ceiling | true peak ≤ the preset ceiling |
| loudness within tolerance | integrated LUFS within ±1 LU of target (a transient-guard miss shows here — read the warning, it may be the right tradeoff) |
| valid stereo | 1–2 channels, sane file |
| export succeeded / output is WAV | the file on disk is real and WAV |

## Format notes

- **16-bit WAV**: fine for CDJs/USB sticks; LocalMaster applies proper TPDF
  dither on the reduction. Use it when a promoter demands 16/44.1.
- **32-bit float WAV**: an archival/stems-ish format; most DJ gear accepts it
  but 24-bit is the safer default.
- **MP3**: only if an external, user-installed ffmpeg is detected — LocalMaster
  never bundles ffmpeg. Don't DJ from MP3 masters you also have as WAV.
- Leading/trailing silence trim and fades exist as options and default OFF —
  beatgridding tools generally prefer untouched intros.
