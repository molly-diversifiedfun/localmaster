import { describe, expect, it } from "vitest";
import {
  basename,
  formatDb,
  formatDbtp,
  formatDuration,
  formatLufs,
  previewExportFilename,
  stripExtension,
} from "./format";

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
