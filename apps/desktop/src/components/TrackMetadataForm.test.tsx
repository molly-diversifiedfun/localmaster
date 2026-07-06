import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TrackMetadataForm,
  isTrackMetadataValid,
  EMPTY_TRACK_METADATA,
} from "./TrackMetadataForm";
import type { TrackMetadata } from "@shared/types";

vi.mock("../lib/tauri", () => ({
  pickImageFile: vi.fn(),
}));

import { pickImageFile } from "../lib/tauri";

const filled: TrackMetadata = {
  title: "Night Drive",
  artist: "Molly S",
  isrc: "US-ABC-26-00001",
  primaryGenre: "House",
  secondaryGenre: "Deep House",
  explicit: false,
  artworkPath: "/art/cover.png",
  recordLabel: "Outli.ne Records",
  releaseDate: "2026-08-01",
};

describe("TrackMetadataForm", () => {
  beforeEach(() => {
    vi.mocked(pickImageFile).mockReset();
  });

  it("renders all fields with their current values", () => {
    render(<TrackMetadataForm metadata={filled} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Title")).toHaveValue("Night Drive");
    expect(screen.getByLabelText("Artist")).toHaveValue("Molly S");
    expect(screen.getByLabelText("ISRC")).toHaveValue("US-ABC-26-00001");
    expect(screen.getByLabelText("Primary genre")).toHaveValue("House");
    expect(screen.getByLabelText("Secondary genre")).toHaveValue("Deep House");
    expect(screen.getByLabelText("Explicit")).not.toBeChecked();
    expect(screen.getByLabelText("Record label")).toHaveValue(
      "Outli.ne Records",
    );
    expect(screen.getByLabelText("Release date")).toHaveValue("2026-08-01");
    expect(screen.getByTitle("/art/cover.png")).toHaveTextContent("cover.png");
  });

  it("edits title and calls onChange with an updated copy", async () => {
    const onChange = vi.fn();
    render(<TrackMetadataForm metadata={filled} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Title"), "!");

    expect(onChange).toHaveBeenLastCalledWith({
      ...filled,
      title: "Night Drive!",
    });
  });

  it("toggles explicit", async () => {
    const onChange = vi.fn();
    render(<TrackMetadataForm metadata={filled} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("Explicit"));

    expect(onChange).toHaveBeenCalledWith({ ...filled, explicit: true });
  });

  it("picks artwork via the image dialog and stores the path", async () => {
    vi.mocked(pickImageFile).mockResolvedValue("/art/new-cover.jpg");
    const onChange = vi.fn();
    render(
      <TrackMetadataForm metadata={EMPTY_TRACK_METADATA} onChange={onChange} />,
    );

    await userEvent.click(screen.getByText("Choose artwork…"));

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_TRACK_METADATA,
      artworkPath: "/art/new-cover.jpg",
    });
  });

  it("a cancelled artwork dialog (null) is a no-op", async () => {
    vi.mocked(pickImageFile).mockResolvedValue(null);
    const onChange = vi.fn();
    render(
      <TrackMetadataForm metadata={EMPTY_TRACK_METADATA} onChange={onChange} />,
    );

    await userEvent.click(screen.getByText("Choose artwork…"));

    expect(onChange).not.toHaveBeenCalled();
  });

  describe("isTrackMetadataValid", () => {
    it("is invalid when required fields are blank", () => {
      expect(isTrackMetadataValid(EMPTY_TRACK_METADATA)).toBe(false);
    });

    it("is invalid when only some required fields are filled", () => {
      expect(
        isTrackMetadataValid({
          ...EMPTY_TRACK_METADATA,
          title: "Night Drive",
          artist: "Molly S",
        }),
      ).toBe(false);
    });

    it("is valid once title, artist, primaryGenre, and artworkPath are set", () => {
      expect(
        isTrackMetadataValid({
          ...EMPTY_TRACK_METADATA,
          title: "Night Drive",
          artist: "Molly S",
          primaryGenre: "House",
          artworkPath: "/art/cover.png",
        }),
      ).toBe(true);
    });

    it("treats whitespace-only required fields as blank", () => {
      expect(
        isTrackMetadataValid({
          ...EMPTY_TRACK_METADATA,
          title: "   ",
          artist: "Molly S",
          primaryGenre: "House",
          artworkPath: "/art/cover.png",
        }),
      ).toBe(false);
    });
  });
});
