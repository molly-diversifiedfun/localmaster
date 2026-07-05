import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReferenceMatchStamp } from "./ReferenceMatchStamp";
import type { ReferenceMatchStageMeta, StageMeta } from "@shared/types";

// Real /master payload shape (caught by live screenshot verification — the
// engine reports band deltas as a label->dB record, not an array).
const referenceMatchMeta: ReferenceMatchStageMeta = {
  stage: "reference_match",
  strength: 0.35,
  applied: true,
  n_pieces_loudest: 1,
  reference_piece_gated_lufs: -19.99,
  reference_mid_side_ratio_db: -222.28,
  mid_band_deltas_db: {
    "32hz": -5.69,
    "63hz": -13.68,
    "126hz": -7.67,
    "251hz": -7.99,
    "502hz": -1.22,
    "1004hz": 0.81,
    "2005hz": 1.56,
    "4007hz": 1.23,
    "8007hz": 0.8,
    "16000hz": -0.5,
  },
  side_band_deltas_db: {
    "32hz": -6.6,
    "63hz": -6.6,
    "126hz": -6.6,
    "251hz": -6.6,
    "502hz": -6.6,
    "1004hz": -6.6,
    "2005hz": -6.6,
    "4007hz": -6.6,
    "8007hz": -6.6,
    "16000hz": -6.6,
  },
};

describe("ReferenceMatchStamp", () => {
  it("renders strength% and the mid/side band deltas from the reference_match stage-meta entry", () => {
    render(<ReferenceMatchStamp stageMeta={[referenceMatchMeta]} />);
    const stamp = screen.getByTestId("reference-match-stamp");
    expect(stamp).toHaveTextContent("35%");
    expect(stamp).toHaveTextContent("Mid");
    expect(stamp).toHaveTextContent("Side");
    expect(stamp).toHaveTextContent("63hz");
    expect(stamp).toHaveTextContent("-13.7 dB");
    expect(stamp).toHaveTextContent("16000hz");
    expect(stamp).toHaveTextContent("-6.6 dB");
  });

  it("renders nothing when no reference_match stage-meta entry exists", () => {
    const otherMeta: StageMeta = { stage: "loudness", iterations: 3 };
    render(<ReferenceMatchStamp stageMeta={[otherMeta]} />);
    expect(
      screen.queryByTestId("reference-match-stamp"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for an empty stage-meta array", () => {
    render(<ReferenceMatchStamp stageMeta={[]} />);
    expect(
      screen.queryByTestId("reference-match-stamp"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing (never throws) for a malformed reference_match entry", () => {
    const malformed: StageMeta = {
      stage: "reference_match",
      strength: "0.35", // wrong type
      mid_band_deltas_db: null,
      side_band_deltas_db: undefined,
    };
    expect(() =>
      render(<ReferenceMatchStamp stageMeta={[malformed]} />),
    ).not.toThrow();
    expect(
      screen.queryByTestId("reference-match-stamp"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing (never throws) when band deltas are arrays instead of the real label->dB record", () => {
    const arrayShaped: StageMeta = {
      stage: "reference_match",
      strength: 0.35,
      mid_band_deltas_db: [1.2, -0.5],
      side_band_deltas_db: [-2.1, 0.8],
    };
    expect(() =>
      render(<ReferenceMatchStamp stageMeta={[arrayShaped]} />),
    ).not.toThrow();
    expect(
      screen.queryByTestId("reference-match-stamp"),
    ).not.toBeInTheDocument();
  });

  it("tolerates extra engine fields alongside the known ones (applied, reference_piece_gated_lufs, etc.)", () => {
    render(<ReferenceMatchStamp stageMeta={[referenceMatchMeta]} />);
    expect(screen.getByTestId("reference-match-stamp")).toBeInTheDocument();
  });

  it("renders muted (not brand-green) by default", () => {
    render(<ReferenceMatchStamp stageMeta={[referenceMatchMeta]} />);
    expect(screen.getByTestId("matrix-stamp")).toHaveClass(
      "text-text-secondary",
    );
  });

  it("renders brand green when fresh, consistent with the Master stamp", () => {
    render(<ReferenceMatchStamp stageMeta={[referenceMatchMeta]} fresh />);
    const stamp = screen.getByTestId("matrix-stamp");
    expect(stamp).toHaveClass("text-brand");
    expect(stamp).not.toHaveClass("text-text-secondary");
  });
});
