import React, { useState, useRef, useCallback } from "react";

export type ImageLoadStatus = "loading" | "loaded" | "error" | "aspect_mismatch";

export interface UseImageLoadStateOptions {
  imageUrl?: string | null;
  expectedWidth?: number;
  expectedHeight?: number;
  aspectTolerance?: number;
}

export interface UseImageLoadStateReturn {
  status: ImageLoadStatus;
  errorMessage: string | null;
  isLoading: boolean;
  isLoaded: boolean;
  hasError: boolean;
  loadKey: string;
  handleLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  handleError: (e?: React.SyntheticEvent<HTMLImageElement>) => void;
  retry: () => void;
}

interface KeyedLoadState {
  key: string;
  status: "loaded" | "error" | "aspect_mismatch";
  errorMessage: string | null;
}

/**
 * Reusable image loading lifecycle manager.
 *
 * Guarantees:
 * 1. Gated display: Image is marked "loaded" only if intrinsic dimensions (naturalWidth/Height)
 *    are positive finite numbers and match expected aspect ratio within tolerance (1e-6).
 * 2. Identity keying: Keyed by URL, expected dimensions, and retry attempt. Load state is stored
 *    keyed by loadKey, deriving "loading" immediately when the key changes (no 1-render stale boxes,
 *    no effect-based resets that overwrite cached image onLoad events).
 * 3. Identity ref: activeKeyRef reflects the current key synchronously before event handlers fire.
 * 4. Recovery support: Provides friendly error copy without exposing internal ratios or dimensions.
 */
export function useImageLoadState({
  imageUrl,
  expectedWidth,
  expectedHeight,
  aspectTolerance = 1e-6,
}: UseImageLoadStateOptions): UseImageLoadStateReturn {
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadedState, setLoadedState] = useState<KeyedLoadState | null>(null);

  const currentKey = `${imageUrl || ""}:${expectedWidth || 0}:${expectedHeight || 0}:${reloadNonce}`;
  const activeKeyRef = useRef(currentKey);
  activeKeyRef.current = currentKey;

  const isCurrentKey = loadedState !== null && loadedState.key === currentKey;
  const status: ImageLoadStatus = isCurrentKey ? loadedState.status : "loading";
  const errorMessage: string | null = isCurrentKey ? loadedState.errorMessage : null;

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const elementKey = img.getAttribute("data-load-key");

      // Ignore stale callback if image belongs to an older loadKey or retry
      if (elementKey && elementKey !== activeKeyRef.current) {
        return;
      }

      const nw = img.naturalWidth;
      const nh = img.naturalHeight;

      // Validate positive finite intrinsic dimensions
      if (
        typeof nw !== "number" ||
        typeof nh !== "number" ||
        !Number.isFinite(nw) ||
        !Number.isFinite(nh) ||
        nw <= 0 ||
        nh <= 0
      ) {
        setLoadedState({
          key: activeKeyRef.current,
          status: "error",
          errorMessage: "Unable to load room image. The image preview may be unavailable, expired, or corrupted.",
        });
        return;
      }

      // Validate aspect ratio against expected dimensions with tight floating tolerance
      if (
        typeof expectedWidth === "number" &&
        typeof expectedHeight === "number" &&
        Number.isFinite(expectedWidth) &&
        Number.isFinite(expectedHeight) &&
        expectedWidth > 0 &&
        expectedHeight > 0
      ) {
        const expectedRatio = expectedWidth / expectedHeight;
        const naturalRatio = nw / nh;
        const relativeDiff = Math.abs(naturalRatio - expectedRatio) / expectedRatio;

        if (relativeDiff > aspectTolerance) {
          setLoadedState({
            key: activeKeyRef.current,
            status: "aspect_mismatch",
            errorMessage: "Image dimensions mismatch: the image aspect ratio does not match the room proportions.",
          });
          return;
        }
      }

      setLoadedState({
        key: activeKeyRef.current,
        status: "loaded",
        errorMessage: null,
      });
    },
    [expectedWidth, expectedHeight, aspectTolerance]
  );

  const handleError = useCallback(
    (e?: React.SyntheticEvent<HTMLImageElement>) => {
      if (e?.currentTarget) {
        const elementKey = e.currentTarget.getAttribute("data-load-key");
        if (elementKey && elementKey !== activeKeyRef.current) {
          return;
        }
      }

      setLoadedState({
        key: activeKeyRef.current,
        status: "error",
        errorMessage: "Unable to load room image. The image preview may be unavailable, expired, or corrupted.",
      });
    },
    []
  );

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  return {
    status,
    errorMessage,
    isLoading: status === "loading",
    isLoaded: status === "loaded",
    hasError: status === "error" || status === "aspect_mismatch",
    loadKey: currentKey,
    handleLoad,
    handleError,
    retry,
  };
}
