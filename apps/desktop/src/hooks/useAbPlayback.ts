import { useCallback, useEffect, useRef, useState } from "react";
import { computeSideGains, type AbSide } from "../lib/ab-gain";
import { toPlayableUrl } from "../lib/tauri";

interface AbPlaybackNodes {
  context: AudioContext;
  originalEl: HTMLAudioElement;
  masterEl: HTMLAudioElement;
  originalGain: GainNode;
  masterGain: GainNode;
}

/**
 * Both original and master audio elements play in lockstep at all times;
 * toggling A/B only re-balances the two GainNodes, so switching sides never
 * loses playback position (no pause/seek/restart on toggle).
 */
export function useAbPlayback(
  originalPath: string | null,
  previewPath: string | null,
  abGainDb: number,
) {
  const [activeSide, setActiveSide] = useState<AbSide>("master");
  const [isPlaying, setIsPlaying] = useState(false);
  const nodesRef = useRef<AbPlaybackNodes | null>(null);

  useEffect(() => {
    return () => {
      nodesRef.current?.context.close().catch(() => undefined);
      nodesRef.current = null;
    };
  }, [originalPath, previewPath]);

  const ensureNodes = useCallback((): AbPlaybackNodes | null => {
    if (!originalPath || !previewPath) return null;
    if (nodesRef.current) return nodesRef.current;

    const context = new AudioContext();
    const originalEl = new Audio(toPlayableUrl(originalPath));
    const masterEl = new Audio(toPlayableUrl(previewPath));
    originalEl.crossOrigin = "anonymous";
    masterEl.crossOrigin = "anonymous";
    originalEl.loop = true;
    masterEl.loop = true;

    const originalGain = context.createGain();
    const masterGain = context.createGain();
    context
      .createMediaElementSource(originalEl)
      .connect(originalGain)
      .connect(context.destination);
    context
      .createMediaElementSource(masterEl)
      .connect(masterGain)
      .connect(context.destination);

    const nodes = { context, originalEl, masterEl, originalGain, masterGain };
    nodesRef.current = nodes;
    return nodes;
  }, [originalPath, previewPath]);

  const applyGains = useCallback(
    (side: AbSide) => {
      const nodes = nodesRef.current;
      if (!nodes) return;
      const gains = computeSideGains(side, abGainDb);
      nodes.originalGain.gain.value = gains.originalGain;
      nodes.masterGain.gain.value = gains.masterGain;
    },
    [abGainDb],
  );

  useEffect(() => {
    applyGains(activeSide);
  }, [activeSide, applyGains]);

  const play = useCallback(async () => {
    const nodes = ensureNodes();
    if (!nodes) return;
    applyGains(activeSide);
    nodes.originalEl.currentTime = nodes.masterEl.currentTime =
      nodes.originalEl.currentTime || 0;
    await Promise.all([nodes.originalEl.play(), nodes.masterEl.play()]);
    setIsPlaying(true);
  }, [ensureNodes, applyGains, activeSide]);

  const pause = useCallback(() => {
    const nodes = nodesRef.current;
    nodes?.originalEl.pause();
    nodes?.masterEl.pause();
    setIsPlaying(false);
  }, []);

  const toggleSide = useCallback(() => {
    setActiveSide((side) => (side === "original" ? "master" : "original"));
  }, []);

  return { activeSide, isPlaying, play, pause, toggleSide };
}
