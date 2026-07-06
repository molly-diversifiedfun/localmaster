import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportBar } from "./ExportBar";
import { EMPTY_TRACK_METADATA } from "./TrackMetadataForm";
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

const filledMetadata = {
  ...EMPTY_TRACK_METADATA,
  title: "Night Drive",
  artist: "Molly S",
  primaryGenre: "House",
  artworkPath: "/art/cover.png",
};

function baseProps() {
  return {
    outDir: "/out",
    onPickOutDir: vi.fn(),
    bitDepth: 24 as const,
    onBitDepthChange: vi.fn(),
    profile: "dj" as const,
    onProfileChange: vi.fn(),
    metadata: EMPTY_TRACK_METADATA,
    onMetadataChange: vi.fn(),
    onExport: vi.fn(),
    isExporting: false,
    progress: 0,
    stage: null,
    error: null,
    result: null,
    onReveal: vi.fn(),
    onOpenJson: vi.fn(),
    onOpenTxt: vi.fn(),
    onDistribute: vi.fn(),
    isDistributing: false,
    distributeError: null,
  };
}

describe("ExportBar — release profile", () => {
  it("does not show the metadata form for the dj profile", () => {
    render(<ExportBar {...baseProps()} />);
    expect(screen.queryByTestId("track-metadata-form")).not.toBeInTheDocument();
  });

  it("shows the metadata form once the release profile is selected", () => {
    render(<ExportBar {...baseProps()} profile="release" />);
    expect(screen.getByTestId("track-metadata-form")).toBeInTheDocument();
  });

  it("disables Export in release profile until metadata is valid", () => {
    render(
      <ExportBar
        {...baseProps()}
        profile="release"
        metadata={EMPTY_TRACK_METADATA}
      />,
    );
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });

  it("enables Export in release profile once metadata is valid", () => {
    render(
      <ExportBar
        {...baseProps()}
        profile="release"
        metadata={filledMetadata}
      />,
    );
    expect(screen.getByRole("button", { name: /Export/ })).toBeEnabled();
  });

  it("calling onProfileChange when the profile toggle changes", async () => {
    const onProfileChange = vi.fn();
    render(<ExportBar {...baseProps()} onProfileChange={onProfileChange} />);

    await userEvent.click(screen.getByRole("radio", { name: /Release/i }));

    expect(onProfileChange).toHaveBeenCalledWith("release");
  });
});

describe("ExportBar — Distribute", () => {
  it("does not show Distribute after a DJ-profile export with no metadata sidecar", () => {
    render(
      <ExportBar
        {...baseProps()}
        result={{
          out_path: "/out/track.wav",
          json_report_path: "/out/track.report.json",
          txt_report_path: "/out/track.report.txt",
          checklist: djChecklist,
          output_analysis: {} as never,
          metadata_path: null,
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Distribute/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Distribute for a release checklist with no metadata sidecar (profile and metadata are independent)", () => {
    render(
      <ExportBar
        {...baseProps()}
        result={{
          out_path: "/out/track.wav",
          json_report_path: "/out/track.report.json",
          txt_report_path: "/out/track.report.txt",
          checklist: releaseChecklist,
          output_analysis: {} as never,
          metadata_path: null,
        }}
      />,
    );
    expect(screen.queryByTestId("distribute-button")).not.toBeInTheDocument();
  });

  it("shows Distribute whenever a metadata sidecar was written, even for a DJ checklist", () => {
    render(
      <ExportBar
        {...baseProps()}
        result={{
          out_path: "/out/track.wav",
          json_report_path: "/out/track.report.json",
          txt_report_path: "/out/track.report.txt",
          checklist: djChecklist,
          output_analysis: {} as never,
          metadata_path: "/out/bundle/metadata.json",
        }}
      />,
    );
    expect(screen.getByTestId("distribute-button")).toBeInTheDocument();
  });

  it("shows Distribute after a release export with a metadata sidecar and calls onDistribute when clicked", async () => {
    const onDistribute = vi.fn();
    render(
      <ExportBar
        {...baseProps()}
        onDistribute={onDistribute}
        result={{
          out_path: "/out/track.wav",
          json_report_path: "/out/track.report.json",
          txt_report_path: "/out/track.report.txt",
          checklist: releaseChecklist,
          output_analysis: {} as never,
          metadata_path: "/out/bundle/metadata.json",
        }}
      />,
    );

    await userEvent.click(screen.getByTestId("distribute-button"));

    expect(onDistribute).toHaveBeenCalled();
  });

  it("shows a distributing indicator while isDistributing is true", () => {
    render(
      <ExportBar
        {...baseProps()}
        isDistributing
        result={{
          out_path: "/out/track.wav",
          json_report_path: "/out/track.report.json",
          txt_report_path: "/out/track.report.txt",
          checklist: releaseChecklist,
          output_analysis: {} as never,
          metadata_path: "/out/bundle/metadata.json",
        }}
      />,
    );
    const button = screen.getByTestId("distribute-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Distributing…");
  });

  it("shows a distribute error message", () => {
    render(
      <ExportBar
        {...baseProps()}
        distributeError="Plugin exited with an error"
        result={{
          out_path: "/out/track.wav",
          json_report_path: "/out/track.report.json",
          txt_report_path: "/out/track.report.txt",
          checklist: releaseChecklist,
          output_analysis: {} as never,
          metadata_path: "/out/bundle/metadata.json",
        }}
      />,
    );
    expect(screen.getByText("Plugin exited with an error")).toBeInTheDocument();
  });
});
