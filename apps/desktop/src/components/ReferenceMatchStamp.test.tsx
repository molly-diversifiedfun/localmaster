import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReferenceMatchStamp } from "./ReferenceMatchStamp";
import type { ReferenceMatchStageMeta, StageMeta } from "@shared/types";

const referenceMatchMeta: ReferenceMatchStageMeta = {
  stage: "reference_match",
  strength: 0.35,
  mid_band_deltas_db: [1.2, -0.5],
  side_band_deltas_db: [-2.1, 0.8],
};

describe("ReferenceMatchStamp", () => {
  it("renders strength% and the mid/side band deltas from the reference_match stage-meta entry", () => {
    render(<ReferenceMatchStamp stageMeta={[referenceMatchMeta]} />);
    const stamp = screen.getByTestId("reference-match-stamp");
    expect(stamp).toHaveTextContent("35%");
    expect(stamp).toHaveTextContent("Mid");
    expect(stamp).toHaveTextContent("Side");
    expect(stamp).toHaveTextContent("+1.2 dB");
    expect(stamp).toHaveTextContent("-2.1 dB");
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
});
