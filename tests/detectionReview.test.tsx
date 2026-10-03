import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { DetectionReview } from "../src/features/room/DetectionReview";
import { NormalizedDetection } from "../src/types/room";
import * as api from "../src/services/api";

vi.mock("../src/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/api")>();
  return {
    ...actual,
    updateFurnitureDecision: vi.fn(),
  };
});

describe("DetectionReview Component (ROOM-81)", () => {
  const defaultDetection: NormalizedDetection = {
    id: "chair-1",
    label: "chair",
    confidence: 0.83,
    box: {
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    },
    decision: "UNSURE",
  };

  const defaultProps = {
    projectId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    imageUrl: "https://example.com/room.jpg",
    imageWidth: 1200,
    imageHeight: 800,
    detections: [defaultDetection],
    onRetry: vi.fn(),
    onContinue: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function triggerImageLoad(
    img: HTMLElement,
    naturalWidth = 1200,
    naturalHeight = 800
  ) {
    Object.defineProperty(img, "naturalWidth", {
      value: naturalWidth,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "naturalHeight", {
      value: naturalHeight,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "complete", {
      value: true,
      configurable: true,
      writable: true,
    });
    fireEvent.load(img);
  }

  function triggerImageError(img: HTMLElement) {
    Object.defineProperty(img, "naturalWidth", {
      value: 0,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "naturalHeight", {
      value: 0,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(img, "complete", {
      value: true,
      configurable: true,
      writable: true,
    });
    fireEvent.error(img);
  }

  it("displays detection in list with formatted 'chair · 83%'", () => {
    render(<DetectionReview {...defaultProps} />);

    // Check list item contains "chair · 83%"
    const listItem = screen.getByRole("button", { name: /chair · 83%/i });
    expect(listItem).toBeInTheDocument();
  });

  it("clicking list item selects chair box and list item", () => {
    render(<DetectionReview {...defaultProps} />);
    triggerImageLoad(screen.getByRole("img", { name: /room/i }), 1200, 800);

    const listItem = screen.getByRole("button", { name: /chair · 83%/i });
    const box = screen.getByTestId("detection-box-chair-1");

    expect(listItem).toHaveAttribute("aria-pressed", "false");
    expect(box).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(listItem);

    expect(listItem).toHaveAttribute("aria-pressed", "true");
    expect(box).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking box selects matching list item and box", () => {
    render(<DetectionReview {...defaultProps} />);
    triggerImageLoad(screen.getByRole("img", { name: /room/i }), 1200, 800);

    const listItem = screen.getByRole("button", { name: /chair · 83%/i });
    const box = screen.getByTestId("detection-box-chair-1");

    fireEvent.click(box);

    expect(listItem).toHaveAttribute("aria-pressed", "true");
    expect(box).toHaveAttribute("aria-pressed", "true");
  });
  it("selection controls are native keyboard-accessible buttons with visible focus", () => {
    render(<DetectionReview {...defaultProps} />);
    triggerImageLoad(screen.getByRole("img", { name: /room/i }), 1200, 800);

    const listItem = screen.getByRole("button", { name: /chair · 83%/i });
    const box = screen.getByTestId("detection-box-chair-1");

    expect(listItem.tagName).toBe("BUTTON");
    expect(box.tagName).toBe("BUTTON");

    expect(listItem.className).toMatch(/focus(-visible)?:/);
    expect(box.className).toMatch(/focus(-visible)?:/);

    listItem.focus();
    expect(listItem).toHaveFocus();

    fireEvent.click(listItem);
    expect(listItem).toHaveAttribute("aria-pressed", "true");
    expect(box).toHaveAttribute("aria-pressed", "true");

    box.focus();
    expect(box).toHaveFocus();

    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-pressed", "false");
    expect(listItem).toHaveAttribute("aria-pressed", "false");
  });

  it("hover/selection exposes label and confidence badge on overlay", () => {
    render(<DetectionReview {...defaultProps} />);
    triggerImageLoad(screen.getByRole("img", { name: /room/i }), 1200, 800);

    const box = screen.getByTestId("detection-box-chair-1");

    // Initially not hovered/selected
    expect(screen.queryByTestId("box-badge-chair-1")).not.toBeInTheDocument();

    // Hover reveals badge
    fireEvent.mouseEnter(box);
    expect(screen.getByTestId("box-badge-chair-1")).toBeInTheDocument();
    expect(screen.getByTestId("box-badge-chair-1")).toHaveTextContent("chair · 83%");

    // Mouse leave removes badge when unselected
    fireEvent.mouseLeave(box);
    expect(screen.queryByTestId("box-badge-chair-1")).not.toBeInTheDocument();

    // Selecting box keeps badge visible even after mouse leave
    fireEvent.click(box);
    expect(screen.getByTestId("box-badge-chair-1")).toBeInTheDocument();
    fireEvent.mouseLeave(box);
    expect(screen.getByTestId("box-badge-chair-1")).toBeInTheDocument();
  });

  it("empty array shows useful success empty state and Retry button", () => {
    const onRetry = vi.fn();
    render(<DetectionReview {...defaultProps} detections={[]} onRetry={onRetry} />);

    expect(screen.getByText(/no objects detected/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("Continue invokes onContinue if provided; absent callback never creates a dead link", () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <DetectionReview {...defaultProps} onContinue={onContinue} />
    );

    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeInTheDocument();
    fireEvent.click(continueBtn);
    expect(onContinue).toHaveBeenCalledTimes(1);

    // Re-render without onContinue
    rerender(<DetectionReview {...defaultProps} onContinue={undefined} />);

    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
    // Verify no dead links exist
    const deadLinks = screen.queryAllByRole("link");
    expect(deadLinks).toHaveLength(0);
    // Truthful next step unavailable text is shown
    expect(screen.getByText(/next step unavailable/i)).toBeInTheDocument();
  });

  it("image or results change clears stale selection", () => {
    const { rerender } = render(<DetectionReview {...defaultProps} />);

    const listItem = screen.getByRole("button", { name: /chair · 83%/i });
    fireEvent.click(listItem);
    expect(listItem).toHaveAttribute("aria-pressed", "true");

    // Change image URL
    rerender(
      <DetectionReview
        {...defaultProps}
        imageUrl="https://example.com/another-room.jpg"
      />
    );

    const updatedListItem = screen.getByRole("button", { name: /chair · 83%/i });
    expect(updatedListItem).toHaveAttribute("aria-pressed", "false");

    // Select again
    fireEvent.click(updatedListItem);
    expect(updatedListItem).toHaveAttribute("aria-pressed", "true");

    // Change detections list
    const newDetection: NormalizedDetection = {
      id: "table-1",
      label: "table",
      confidence: 0.91,
      box: { x: 0.2, y: 0.3, width: 0.4, height: 0.3 },
      decision: "UNSURE",
    };

    rerender(
      <DetectionReview
        {...defaultProps}
        imageUrl="https://example.com/another-room.jpg"
        detections={[newDetection]}
      />
    );

    const tableItem = screen.getByRole("button", { name: /table · 91%/i });
    expect(tableItem).toHaveAttribute("aria-pressed", "false");
  });

  it("invalid geometry or confidence is a visible result error, not zero-detection success", () => {
    const invalidDetections: NormalizedDetection[] = [
      {
        id: "chair-invalid",
        label: "chair",
        confidence: 1.5, // Invalid confidence > 1
        box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        decision: "UNSURE",
      },
    ];

    const onRetry = vi.fn();
    render(
      <DetectionReview
        {...defaultProps}
        detections={invalidDetections}
        onRetry={onRetry}
      />
    );

    // Must show result error
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/invalid detection results|detection error/i)).toBeInTheDocument();
    // Must NOT show zero-detection success
    expect(screen.queryByText(/no objects detected/i)).not.toBeInTheDocument();

    // Error view provides retry
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("invalid bounding box geometry (out of bounds or negative) is a visible result error", () => {
    const outOfBoundsDetections: NormalizedDetection[] = [
      {
        id: "chair-oob",
        label: "chair",
        confidence: 0.85,
        box: { x: 0.8, y: 0.5, width: 0.4, height: 0.3 }, // 0.8 + 0.4 = 1.2 > 1
        decision: "UNSURE",
      },
    ];

    render(
      <DetectionReview
        {...defaultProps}
        detections={outOfBoundsDetections}
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/no objects detected/i)).not.toBeInTheDocument();
  });

  it("strictly enforces > 1 bounds: rejects out-of-bounds (e.g. x=0.8, width=0.20005) vs exact boundary accepted (e.g. x=0.8, width=0.2)", () => {
    // 1. Out-of-bounds (0.8 + 0.20005 = 1.00005 > 1) must be rejected with visible result error
    const outOfBounds: NormalizedDetection[] = [
      {
        id: "chair-oob-subpixel",
        label: "chair",
        confidence: 0.85,
        box: { x: 0.8, y: 0.2, width: 0.20005, height: 0.3 },
        decision: "UNSURE",
      },
    ];

    const { rerender } = render(
      <DetectionReview
        {...defaultProps}
        detections={outOfBounds}
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/geometry exceeds unit bounds/i)).toBeInTheDocument();

    // 2. Exact boundary (0.8 + 0.2 = 1.0) must be accepted without error
    const exactBoundary: NormalizedDetection[] = [
      {
        id: "chair-exact-edge",
        label: "chair",
        confidence: 0.85,
        box: { x: 0.8, y: 0.2, width: 0.2, height: 0.3 },
        decision: "UNSURE",
      },
    ];

    rerender(
      <DetectionReview
        {...defaultProps}
        detections={exactBoundary}
      />
    );
    triggerImageLoad(screen.getByRole("img", { name: /room/i }), 1200, 800);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("detection-box-chair-exact-edge")).toBeInTheDocument();
  });

  it("invalid image dimensions (<= 0 or non-finite) is a visible result error", () => {
    render(
      <DetectionReview
        {...defaultProps}
        imageWidth={0}
        imageHeight={800}
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("Retry and Continue callbacks do not create network requests in this component", () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const onRetry = vi.fn();
    const onContinue = vi.fn();

    render(
      <DetectionReview
        {...defaultProps}
        onRetry={onRetry}
        onContinue={onContinue}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Trigger retry
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("Finding 5 Regressions: Image Load & Recovery Lifecycle", () => {
    it("boxes are hidden until successful actual image load", () => {
      render(<DetectionReview {...defaultProps} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Before image load completes: boxes must be suppressed / hidden
      expect(screen.queryByTestId("detection-box-chair-1")).not.toBeInTheDocument();

      // Successful load event with matching declared dimensions
      triggerImageLoad(img, 1200, 800);

      // After load: boxes are visible and interactive
      expect(screen.getByTestId("detection-box-chair-1")).toBeInTheDocument();
    });

    it("populated review image error hides boxes and shows readable image-specific recovery action", () => {
      render(<DetectionReview {...defaultProps} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Trigger load error
      triggerImageError(img);

      // Boxes must be suppressed over broken image
      expect(screen.queryByTestId("detection-box-chair-1")).not.toBeInTheDocument();

      // Readable image-specific recovery action must be visible
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Unable to load room image", { exact: true })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry image|reload image|try again/i })
      ).toBeInTheDocument();
    });

    it("empty review image error shows readable image-specific recovery action", () => {
      render(<DetectionReview {...defaultProps} detections={[]} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Trigger load error
      triggerImageError(img);

      // Empty review must not silently ignore broken image; shows image recovery
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Unable to load room image", { exact: true })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry image|reload image|try again/i })
      ).toBeInTheDocument();
    });

    it("nonpositive intrinsic dimensions (naturalWidth <= 0 or naturalHeight <= 0) trigger recovery and hide boxes", () => {
      render(<DetectionReview {...defaultProps} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Load event fires but intrinsic dimensions are nonpositive (e.g. 404 response in browser)
      triggerImageLoad(img, 0, 0);

      // Boxes must remain hidden
      expect(screen.queryByTestId("detection-box-chair-1")).not.toBeInTheDocument();

      // Readable recovery action must be visible
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Unable to load room image", { exact: true })).toBeInTheDocument();
    });

    it("natural aspect mismatch triggers recovery and hides boxes", () => {
      // Declared dimensions 1200x800 (aspect 1.5)
      render(<DetectionReview {...defaultProps} imageWidth={1200} imageHeight={800} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Natural image dimensions 800x1200 (aspect 0.667 != 1.5)
      triggerImageLoad(img, 800, 1200);

      // Boxes must remain hidden to prevent misaligned bounding boxes over cropped image
      expect(screen.queryByTestId("detection-box-chair-1")).not.toBeInTheDocument();

      // Recovery indicating aspect ratio mismatch
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Image dimensions mismatch: aspect ratio mismatch", { exact: true })).toBeInTheDocument();
    });

    it("subtle 2% aspect mismatch is rejected by tight floating tolerance and hides boxes", () => {
      // Declared dimensions 1200x800 (aspect 1.5)
      render(<DetectionReview {...defaultProps} imageWidth={1200} imageHeight={800} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Subtle ~2% aspect mismatch: 1200x816 (aspect 1.4705, diff ~1.96%)
      triggerImageLoad(img, 1200, 816);

      expect(screen.queryByTestId("detection-box-chair-1")).not.toBeInTheDocument();
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Image dimensions mismatch: aspect ratio mismatch", { exact: true })).toBeInTheDocument();
    });

    it("immediate/cached image load renders boxes without being reset to loading", () => {
      render(<DetectionReview {...defaultProps} />);
      const img = screen.getByRole("img", { name: /room/i });

      // Immediate load
      triggerImageLoad(img, 1200, 800);

      expect(screen.getByTestId("detection-box-chair-1")).toBeInTheDocument();
      expect(screen.queryByTestId("image-loading")).not.toBeInTheDocument();
    });

    it("URL change resets loading state and ignores stale callbacks from previous URL", () => {
      const { rerender } = render(
        <DetectionReview {...defaultProps} imageUrl="https://example.com/image-1.jpg" />
      );
      const img1 = screen.getByRole("img", { name: /room/i });
      triggerImageLoad(img1, 1200, 800);
      expect(screen.getByTestId("detection-box-chair-1")).toBeInTheDocument();

      // Switch to new URL
      rerender(
        <DetectionReview {...defaultProps} imageUrl="https://example.com/image-2.jpg" />
      );

      // Loading state resets: boxes must be suppressed for new image until it loads
      expect(screen.queryByTestId("detection-box-chair-1")).not.toBeInTheDocument();

      // A stale error from previous image element must be ignored
      triggerImageError(img1);
      expect(screen.queryByText(/unable to load room image|image failed to load/i)).not.toBeInTheDocument();

      // When new image loads, boxes appear
      const img2 = screen.getByRole("img", { name: /room/i });
      triggerImageLoad(img2, 1200, 800);
      expect(screen.getByTestId("detection-box-chair-1")).toBeInTheDocument();
    });
  });

  it("shows an error and restores the previous decision when saving fails", async () => {
    vi.mocked(api.updateFurnitureDecision).mockRejectedValueOnce(
      new Error("500 Internal Server Error")
    );

    render(<DetectionReview {...defaultProps} />);

    fireEvent.click(screen.getByRole("radio", { name: /keep/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not save the furniture decision. Your previous choice was restored."
      );
    });
    expect(screen.getByRole("radio", { name: /unsure/i })).toBeChecked();
  });
});
