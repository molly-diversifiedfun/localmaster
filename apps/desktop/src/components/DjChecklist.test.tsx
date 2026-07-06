import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DjChecklist } from "./DjChecklist";
import type { ExportChecklist, ReleaseChecklist } from "@shared/types";

const djChecklist: ExportChecklist = {
  no_clipping: true,
  peak_within_ceiling: true,
  loudness_within_tolerance: true,
  valid_stereo: true,
  export_succeeded: true,
  output_is_wav: true,
};

const releaseChecklist: ReleaseChecklist = {
  ...djChecklist,
  accepted_streaming_specs: true,
};

describe("DjChecklist", () => {
  it("shows the DJ readiness heading and no streaming-specs row for a DJ checklist", () => {
    render(<DjChecklist checklist={djChecklist} />);
    expect(screen.getByTestId("checklist-heading")).toHaveTextContent(
      "DJ readiness",
    );
    expect(
      screen.queryByText(/Accepted streaming specs/i),
    ).not.toBeInTheDocument();
  });

  it("shows the Release readiness heading and the streaming-specs row for a release checklist", () => {
    render(<DjChecklist checklist={releaseChecklist} />);
    expect(screen.getByTestId("checklist-heading")).toHaveTextContent(
      "Release readiness",
    );
    expect(screen.getByText(/Accepted streaming specs/i)).toBeInTheDocument();
  });

  it("renders FAIL for accepted_streaming_specs when it's false", () => {
    render(
      <DjChecklist
        checklist={{ ...releaseChecklist, accepted_streaming_specs: false }}
      />,
    );
    const row = screen.getByText(/Accepted streaming specs/i);
    expect(row).toHaveTextContent("FAIL");
  });
});
