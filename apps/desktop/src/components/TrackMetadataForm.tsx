import type { ChangeEvent } from "react";
import type { TrackMetadata } from "@shared/types";
import { pickImageFile } from "../lib/tauri";
import { basename } from "../lib/format";

export const EMPTY_TRACK_METADATA: TrackMetadata = {
  title: "",
  artist: "",
  isrc: "",
  primaryGenre: "",
  secondaryGenre: "",
  explicit: false,
  artworkPath: "",
  recordLabel: "",
  releaseDate: "",
};

/** Required-for-distribution fields (ADR 003 TrackMetadata contract). */
export function isTrackMetadataValid(metadata: TrackMetadata): boolean {
  return (
    metadata.title.trim() !== "" &&
    metadata.artist.trim() !== "" &&
    metadata.primaryGenre.trim() !== "" &&
    metadata.artworkPath.trim() !== ""
  );
}

interface TrackMetadataFormProps {
  metadata: TrackMetadata;
  onChange: (metadata: TrackMetadata) => void;
}

/**
 * Distribution metadata form shown for a release-profile export (ADR 003).
 * Emits a full updated TrackMetadata copy on every change — immutable,
 * matching the rest of the app's controlled-input pattern.
 */
export function TrackMetadataForm({
  metadata,
  onChange,
}: TrackMetadataFormProps) {
  function field(key: keyof TrackMetadata) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...metadata, [key]: e.target.value });
  }

  async function handlePickArtwork() {
    const path = await pickImageFile();
    if (path) onChange({ ...metadata, artworkPath: path });
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 text-sm"
      data-testid="track-metadata-form"
    >
      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">Title</span>
        <input
          value={metadata.title}
          onChange={field("title")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">Artist</span>
        <input
          value={metadata.artist}
          onChange={field("artist")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">ISRC</span>
        <input
          value={metadata.isrc ?? ""}
          onChange={field("isrc")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">Primary genre</span>
        <input
          value={metadata.primaryGenre}
          onChange={field("primaryGenre")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">Secondary genre</span>
        <input
          value={metadata.secondaryGenre ?? ""}
          onChange={field("secondaryGenre")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">Record label</span>
        <input
          value={metadata.recordLabel ?? ""}
          onChange={field("recordLabel")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-text-secondary">Release date</span>
        <input
          type="date"
          value={metadata.releaseDate ?? ""}
          onChange={field("releaseDate")}
          className="rounded-md border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={metadata.explicit}
          onChange={(e) =>
            onChange({ ...metadata, explicit: e.target.checked })
          }
        />
        <span className="text-text-secondary">Explicit</span>
      </label>

      <div className="col-span-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePickArtwork}
          className="w-fit rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text"
        >
          Choose artwork…
        </button>
        {metadata.artworkPath && (
          <span
            title={metadata.artworkPath}
            className="truncate font-mono text-xs text-text-secondary"
          >
            {basename(metadata.artworkPath)}
          </span>
        )}
      </div>
    </div>
  );
}
