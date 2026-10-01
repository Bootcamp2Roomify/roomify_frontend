"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_IMAGE_FORMATS_LABEL,
  ERROR_MESSAGES,
  MAX_UPLOAD_FILE_SIZE_LABEL,
  USER_ERROR_MESSAGES,
} from "../../constants/upload";
import {
  decodeImageDimensions,
  ImageDimensions,
  validateImageSignature,
  validateRoomFile,
} from "../../utils/fileValidation";
import { createProject, uploadRoomImage } from "../../services/api";
import { saveProjectContext } from "../../features/room/projectContext";
import { RoomImagePreview } from "./RoomImagePreview";
import { RoomImage } from "../../types/room";

function isUrlApiSupported(): boolean {
  if (typeof window !== "undefined") {
    if (
      typeof window.URL === "undefined" ||
      typeof window.URL.createObjectURL !== "function" ||
      typeof window.URL.revokeObjectURL !== "function"
    ) {
      return false;
    }
  }
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return false;
  }
  return true;
}

function safeRevokeUrl(url?: string | null): void {
  if (!url) return;
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.URL !== "undefined" &&
      typeof window.URL.revokeObjectURL === "function"
    ) {
      window.URL.revokeObjectURL(url);
    } else if (
      typeof URL !== "undefined" &&
      typeof URL.revokeObjectURL === "function"
    ) {
      URL.revokeObjectURL(url);
    }
  } catch {
    // Ignore revocation errors
  }
}

export function RoomUpload() {
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retainedProjectId, setRetainedProjectId] = useState<string | null>(
    null
  );
  const [uploadFailed, setUploadFailed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDecodingPending, setIsDecodingPending] = useState<boolean>(false);
  const [uploadSucceeded, setUploadSucceeded] = useState<boolean>(false);
  const [navigationFailed, setNavigationFailed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const isDecodingPendingRef = useRef<boolean>(false);
  const uploadSucceededRef = useRef<boolean>(false);
  const isTransferredRef = useRef<boolean>(false);
  const previewUrlRef = useRef<string | null>(null);
  const selectionTokenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync state previewUrl to ref
  previewUrlRef.current = previewUrl;

  // Cleanup untransferred local preview URL on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (previewUrlRef.current && !isTransferredRef.current) {
        safeRevokeUrl(previewUrlRef.current);
      }
    };
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file) return;

      // Handle unsupported URL environment before decode with curated recovery
      if (!isUrlApiSupported()) {
        setErrorMessage(USER_ERROR_MESSAGES.BROWSER_UNSUPPORTED);
        return;
      }

      // If upload already succeeded and navigating, do not allow replacing image
      if (uploadSucceededRef.current) {
        return;
      }

      // Increment selection-request token BEFORE async decode to track latest user selection
      const currentToken = ++selectionTokenRef.current;

      // Synchronously set decodingPending ref + state before any await
      isDecodingPendingRef.current = true;
      setIsDecodingPending(true);
      setErrorMessage(null);

      try {
        // 1. Basic file validation (size, MIME type, extension)
        const validationError = validateRoomFile(file);
        if (validationError) {
          if (!isMountedRef.current || selectionTokenRef.current !== currentToken) {
            return;
          }
          setErrorMessage(validationError);
          // Keep current valid image when replacement is invalid
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          return;
        }

        // 2. Real signature byte verification (before any browser decode)
        const signatureError = await validateImageSignature(file);
        if (signatureError) {
          if (!isMountedRef.current || selectionTokenRef.current !== currentToken) {
            return;
          }
          setErrorMessage(signatureError);
          // Keep current valid image when replacement has invalid bytes
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          return;
        }

        // 3. Decode image dimensions & reject corrupt/unreadable files
        let decodedDims: ImageDimensions;
        try {
          decodedDims = await decodeImageDimensions(file);
        } catch (err: unknown) {
          // If unmounted or selection token changed during async decode, discard result
          if (
            !isMountedRef.current ||
            selectionTokenRef.current !== currentToken
          ) {
            return;
          }
          const errorText =
            err instanceof Error ? err.message : ERROR_MESSAGES.CORRUPT_IMAGE;
          setErrorMessage(errorText);
          // Keep current valid image when replacement is corrupt
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          return;
        }

        // Check mounted and token again before mutating preview state
        if (!isMountedRef.current || selectionTokenRef.current !== currentToken) {
          return;
        }

        // 4. Abort any pending upload request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        // 5. Revoke previous untransferred preview URL if replacing
        if (previewUrlRef.current && !isTransferredRef.current) {
          safeRevokeUrl(previewUrlRef.current);
        }

        // 6. Create new preview object URL
        let newPreviewUrl = "";
        try {
          if (
            typeof window !== "undefined" &&
            typeof window.URL !== "undefined" &&
            typeof window.URL.createObjectURL === "function"
          ) {
            newPreviewUrl = window.URL.createObjectURL(file);
          } else if (
            typeof URL !== "undefined" &&
            typeof URL.createObjectURL === "function"
          ) {
            newPreviewUrl = URL.createObjectURL(file);
          }
        } catch {
          setErrorMessage(USER_ERROR_MESSAGES.BROWSER_UNSUPPORTED);
          return;
        }

        if (!newPreviewUrl) {
          setErrorMessage(USER_ERROR_MESSAGES.BROWSER_UNSUPPORTED);
          return;
        }

        // Guard: if unmounted or replaced while creating object URL, clean up immediately
        if (!isMountedRef.current || selectionTokenRef.current !== currentToken) {
          safeRevokeUrl(newPreviewUrl);
          return;
        }

        previewUrlRef.current = newPreviewUrl;
        isTransferredRef.current = false;

        // 7. Update state: clear previous errors & failure state
        setErrorMessage(null);
        setUploadFailed(false);
        setNavigationFailed(false);
        setRetainedProjectId(null);
        setSelectedFile(file);
        setPreviewUrl(newPreviewUrl);
        setDimensions(decodedDims);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } finally {
        // Latest-token finally clears decodingPending
        if (isMountedRef.current && selectionTokenRef.current === currentToken) {
          isDecodingPendingRef.current = false;
          setIsDecodingPending(false);
        }
      }
    },
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const isInputDisabled = isSubmitting || isDecodingPending || uploadSucceeded;
  const isActionDisabled =
    isSubmitting || isDecodingPending || (uploadSucceeded && !navigationFailed);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInputDisabled) {
      setIsDragging(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isInputDisabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isInputDisabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const triggerFileInput = () => {
    if (isInputDisabled) return;
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      triggerFileInput();
    }
  };

  const handleSubmit = async () => {
    // Immediate ref guard to prevent double-click / race conditions before state updates
    if (isSubmittingRef.current || isDecodingPendingRef.current) return;

    // Terminal upload succeeded: retry navigation ONLY (never another upload)
    if (uploadSucceededRef.current) {
      if (!retainedProjectId) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        router.push(
          `/projects/${encodeURIComponent(retainedProjectId)}/analyze`
        );
        setNavigationFailed(false);
      } catch {
        if (isMountedRef.current) {
          setNavigationFailed(true);
          setErrorMessage(USER_ERROR_MESSAGES.NAVIGATION_FAILED);
        }
      } finally {
        if (isMountedRef.current) {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
        }
      }
      return;
    }

    if (!selectedFile || !previewUrl || !dimensions) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    const currentToken = selectionTokenRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let projectId = retainedProjectId;

    try {
      // Step 1: Create project (only if not retained from prior upload failure)
      if (!projectId) {
        try {
          const project = await createProject(controller.signal);
          if (
            !isMountedRef.current ||
            selectionTokenRef.current !== currentToken
          ) {
            return;
          }
          projectId = project.id;
          setRetainedProjectId(projectId);
        } catch {
          if (
            !isMountedRef.current ||
            selectionTokenRef.current !== currentToken
          ) {
            return;
          }
          setErrorMessage(USER_ERROR_MESSAGES.CREATE_FAILED);
          return;
        }
      }

      // Step 2: Upload room image to project
      let uploadedImage: RoomImage;
      try {
        uploadedImage = await uploadRoomImage(
          projectId,
          selectedFile,
          controller.signal
        );
        if (
          !isMountedRef.current ||
          selectionTokenRef.current !== currentToken
        ) {
          return;
        }
        setUploadFailed(false);
      } catch {
        if (
          !isMountedRef.current ||
          selectionTokenRef.current !== currentToken
        ) {
          return;
        }
        setUploadFailed(true);
        setErrorMessage(USER_ERROR_MESSAGES.UPLOAD_FAILED);
        return;
      }

      // Step 3: Save project context with orientation-corrected dimensions & previewUrl
      const finalImage: RoomImage = {
        ...uploadedImage,
        width: uploadedImage.width ?? dimensions.width,
        height: uploadedImage.height ?? dimensions.height,
      };

      try {
        saveProjectContext({
          projectId,
          image: finalImage,
          previewUrl,
        });
        // Transfer URL ownership so unmount doesn't revoke it
        isTransferredRef.current = true;
        uploadSucceededRef.current = true;
        setUploadSucceeded(true);
        setUploadFailed(false);
      } catch {
        if (
          !isMountedRef.current ||
          selectionTokenRef.current !== currentToken
        ) {
          return;
        }
        setErrorMessage(USER_ERROR_MESSAGES.SAVE_CONTEXT_FAILED);
        return;
      }

      // Step 4: Navigate safely to analysis route
      try {
        router.push(`/projects/${encodeURIComponent(projectId)}/analyze`);
      } catch {
        if (
          !isMountedRef.current ||
          selectionTokenRef.current !== currentToken
        ) {
          return;
        }
        setNavigationFailed(true);
        setErrorMessage(USER_ERROR_MESSAGES.NAVIGATION_FAILED);
        return;
      }
    } finally {
      if (isMountedRef.current) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Upload Room Photo
        </h1>
        <p className="mt-2 text-sm text-gray-600 sm:text-base">
          Upload a clear photo of your room to detect furniture and explore
          redesign ideas.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {/* Hidden Accessible File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="room-photo-file-input"
          accept="image/jpeg,image/png"
          onChange={handleInputChange}
          disabled={isInputDisabled}
          className="sr-only"
          aria-label="Select room photo file"
        />

        {/* Upload Dropzone or Image Preview */}
        {!previewUrl || !selectedFile ? (
          <div
            tabIndex={isInputDisabled ? -1 : 0}
            role="button"
            aria-label="Upload room image. Drop file here or press Enter or Space to choose a file."
            onClick={triggerFileInput}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isDragging
                ? "border-blue-500 bg-blue-50/50"
                : "border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50"
            } ${
              isInputDisabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                />
              </svg>
            </div>

            <p className="mt-4 text-sm font-medium text-gray-900">
              <label
                htmlFor="room-photo-file-input"
                className="cursor-pointer text-blue-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerFileInput();
                }}
              >
                Click to upload
              </label>{" "}
              or drag and drop
            </p>

            <p className="mt-1 text-xs text-gray-500">
              {ALLOWED_IMAGE_FORMATS_LABEL} up to {MAX_UPLOAD_FILE_SIZE_LABEL}
            </p>
          </div>
        ) : (
          <RoomImagePreview
            previewUrl={previewUrl}
            file={selectedFile}
            dimensions={dimensions}
            onReplace={triggerFileInput}
            disabled={isInputDisabled}
          />
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            data-testid="upload-error"
            className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        {/* Primary Action Button */}
        {selectedFile && previewUrl && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isActionDisabled}
              data-testid="submit-upload-btn"
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Processing..."
                : navigationFailed
                ? "Retry Navigation"
                : uploadFailed
                ? "Retry Upload"
                : "Upload and Analyze Room"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
