import { describe, expect, it } from "vitest";
import {
  basename,
  dirname,
  formatBitRate,
  formatDb,
  formatDbtp,
  formatDuration,
  formatLufs,
  matrixStampValues,
  previewExportFilename,
  stripExtension,
} from "./format";
import type { AnalysisReport } from "@shared/types";

describe("basename", () => {
  it("extracts the filename from a POSIX path", () => {
    expect(basename("/Users/molly/tracks/song.wav")).toBe("song.wav");
  });

  it("extracts the filename from a Windows-style path", () => {
    expect(basename("C:\\Users\\molly\\song.wav")).toBe("song.wav");
  });

  it("returns the input unchanged when there is no separator", () => {
    expect(basename("song.wav")).toBe("song.wav");
  });
});

describe("stripExtension", () => {
  it("removes a simple extension", () => {
    expect(stripExtension("song.wav")).toBe("song");
  });

  it("leaves a leading dot (dotfile) untouched", () => {
    expect(stripExtension(".env")).toBe(".env");
  });

  it("returns the input unchanged when there is no extension", () => {
    expect(stripExtension("song")).toBe("song");
  });
});

describe("formatLufs / formatDbtp / formatDb", () => {
  it("formats LUFS with one decimal and unit", () => {
    expect(formatLufs(-9)).toBe("-9.0 LUFS");
  });

  it("formats dBTP with one decimal and unit", () => {
    expect(formatDbtp(-1.02)).toBe("-1.0 dBTP");
  });

  it("adds a plus sign for positive dB values", () => {
    expect(formatDb(2.5)).toBe("+2.5 dB");
  });

  it("does not add a sign for negative dB values", () => {
    expect(formatDb(-2.5)).toBe("-2.5 dB");
  });

  it("falls back to '--' for null/undefined/NaN", () => {
    expect(formatLufs(null)).toBe("--");
    expect(formatDbtp(undefined)).toBe("--");
    expect(formatDb(NaN)).toBe("--");
  });
});

describe("formatDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("pads seconds under 10", () => {
    expect(formatDuration(9)).toBe("0:09");
  });

  it("clamps negative durations to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("dirname", () => {
  it("returns the parent directory of a POSIX path", () => {
    expect(dirname("/Users/molly/tracks/song.wav")).toBe("/Users/molly/tracks");
  });

  it("returns the input unchanged when there is no separator", () => {
    expect(dirname("song.wav")).toBe("song.wav");
  });
});

describe("formatBitRate", () => {
  it("joins bit depth and sample rate in kHz", () => {
    expect(formatBitRate(24, 48000)).toBe("24bit/48k");
  });

  it("falls back to 32-bit when bit depth is unknown", () => {
    expect(formatBitRate(null, 44100)).toBe("32bit/44k");
  });
});

describe("matrixStampValues", () => {
  it("builds the LUFS / dBTP / bit-rate triplet from an AnalysisReport", () => {
    const analysis: AnalysisReport = {
      sample_rate: 48000,
      n_channels: 2,
      duration_seconds: 30,
      bit_depth: 24,
      integrated_lufs: -9.4,
      short_term_lufs: [],
      loudness_range_lu: 6,
      true_peak_dbtp: -1.1,
      sample_peak_dbfs: -1.2,
      spectral_balance: {
        low: 0.2,
        low_mid: 0.2,
        mid: 0.2,
        high_mid: 0.2,
        high: 0.2,
      },
      dc_offset: [0, 0],
      has_dc_offset: false,
      clipped_regions: 0,
      has_clipping: false,
      has_excessive_sub_bass: false,
      has_harshness: false,
      stereo_imbalance_db: 0,
      has_stereo_imbalance: false,
      leading_silence_seconds: 0,
      trailing_silence_seconds: 0,
      waveform_overview: [],
    };
    expect(matrixStampValues(analysis)).toEqual([
      "-9.4 LUFS",
      "-1.1 dBTP",
      "24bit/48k",
    ]);
  });
});

describe("previewExportFilename", () => {
  it("builds the engine's naming scheme for display", () => {
    const name = previewExportFilename(
      "my_song.wav",
      "clean_dj",
      -9,
      44100,
      24,
    );
    expect(name).toBe(
      "my_song__LocalMaster__clean_dj__-9.0LUFS__44100Hz__24bit.wav",
    );
  });

  it("strips directories from the original filename first", () => {
    const name = previewExportFilename(
      "/tracks/my_song.wav",
      "loud_club",
      -7,
      48000,
      16,
    );
    expect(name).toBe(
      "my_song__LocalMaster__loud_club__-7.0LUFS__48000Hz__16bit.wav",
    );
  });
});
