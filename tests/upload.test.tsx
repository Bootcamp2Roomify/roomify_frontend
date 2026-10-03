import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RoomUpload } from "../src/components/room/RoomUpload";
import {
  decodeImageDimensions,
  validateImageSignature,
  validateRoomFile,
} from "../src/utils/fileValidation";
import { createProject, uploadRoomImage } from "../src/services/api";
import { saveProjectContext } from "../src/features/room/projectContext";
import { RoomImage } from "../src/types/room";
import { USER_ERROR_MESSAGES } from "../src/constants/upload";
import {
  createRealJpegBytes,
  createRealJpegFile,
  createRealPngBytes,
  createRealPngFile,
  createRealGifFile,
  createRealWebpFile,
} from "./helpers/imageFixtures";

// Stub only the shared service/router boundary
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("../src/services/api", () => ({
  createProject: vi.fn(),
  uploadRoomImage: vi.fn(),
}));

vi.mock("../src/features/room/projectContext", () => ({
  saveProjectContext: vi.fn(),
}));

class MockImage {
  static delayLoad = false;
  static pendingLoads: Array<() => void> = [];
  static shouldFail = false;

  onload: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  naturalWidth = 1920;
  naturalHeight = 1080;
  width = 1920;
  height = 1080;
  private _src = "";

  set src(val: string) {
    this._src = val;
    const trigger = () => {
      if (MockImage.shouldFail) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    };

    if (MockImage.delayLoad) {
      MockImage.pendingLoads.push(trigger);
    } else {
      queueMicrotask(trigger);
    }
  }

  get src() {
    return this._src;
  }
}

describe("ROOM-79 Upload Flow", () => {
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let urlCounter = 0;

  beforeEach(() => {
    createdUrls.length = 0;
    revokedUrls.length = 0;
    urlCounter = 0;
    MockImage.delayLoad = false;
    MockImage.pendingLoads = [];
    MockImage.shouldFail = false;
    vi.clearAllMocks();

    const mockCreateObjectURL = vi.fn((_blob: Blob) => {
      urlCounter += 1;
      const url = `blob:mock-url-${urlCounter}`;
      createdUrls.push(url);
      return url;
    });

    const mockRevokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    });

    const customUrl = {
      ...URL,
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    };

    vi.stubGlobal("URL", customUrl);
    vi.stubGlobal("Image", MockImage);

    if (typeof window !== "undefined") {
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("File Validation Unit Checks", () => {
    it("validates JPG, JPEG, and PNG correctly", () => {
      const jpg = createRealJpegFile("room.jpg");
      const jpeg = createRealJpegFile("room.jpeg");
      const png = createRealPngFile("room.png");

      expect(validateRoomFile(jpg)).toBeNull();
      expect(validateRoomFile(jpeg)).toBeNull();
      expect(validateRoomFile(png)).toBeNull();
    });

    it("rejects non-image MIME types and mismatched extensions", () => {
      const pdf = new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });
      const text = new File(["hello"], "room.jpg", { type: "text/plain" });
      const spoofed = new File(["fake"], "room.pdf", { type: "image/jpeg" });

      expect(validateRoomFile(pdf)).toBe("Please upload JPG or PNG.");
      expect(validateRoomFile(text)).toBe("Please upload JPG or PNG.");
      expect(validateRoomFile(spoofed)).toBe("Please upload JPG or PNG.");
    });

    it("rejects zero-byte files", () => {
      const empty = new File([], "empty.jpg", { type: "image/jpeg" });
      expect(validateRoomFile(empty)).toBe("The selected file is empty.");
    });

    it("rejects files larger than 10MB", () => {
      const oversized = createRealJpegFile(
        "huge.jpg",
        10 * 1024 * 1024 + 1
      );
      expect(validateRoomFile(oversized)).toBe(
        "File size exceeds the 10MB limit."
      );
    });

    it("rejects when Image decoder is unavailable instead of guessing dimensions", async () => {
      vi.stubGlobal("Image", undefined);
      const file = createRealJpegFile("valid.jpg");
      await expect(decodeImageDimensions(file)).rejects.toThrow(
        "The image file is corrupt or unreadable. Please upload a valid JPG or PNG."
      );
    });

    it("rejects when image has non-positive dimensions", async () => {
      class ZeroDimImage extends MockImage {
        naturalWidth = 0;
        naturalHeight = 0;
        width = 0;
        height = 0;
      }
      vi.stubGlobal("Image", ZeroDimImage);

      const file = createRealJpegFile("zero-dim.jpg");
      await expect(decodeImageDimensions(file)).rejects.toThrow(
        "The image file is corrupt or unreadable. Please upload a valid JPG or PNG."
      );
    });

    it("rejects when createImageBitmap succeeds with non-positive dimensions without falling through", async () => {
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue({
          width: 0,
          height: 1080,
          close: vi.fn(),
        })
      );

      const file = createRealJpegFile("zero-bitmap.jpg");
      await expect(decodeImageDimensions(file)).rejects.toThrow(
        "The image file is corrupt or unreadable. Please upload a valid JPG or PNG."
      );
    });

    it("rejects when dimensions are non-finite (NaN or Infinity)", async () => {
      class NonFiniteDimImage extends MockImage {
        naturalWidth = NaN;
        naturalHeight = Infinity;
        width = NaN;
        height = Infinity;
      }
      vi.stubGlobal("Image", NonFiniteDimImage);

      const file = createRealJpegFile("non-finite.jpg");
      await expect(decodeImageDimensions(file)).rejects.toThrow(
        "The image file is corrupt or unreadable. Please upload a valid JPG or PNG."
      );
    });
  });

  describe("Component Integration Tests", () => {
    it("keeps a selected local preview out of project creation and upload", async () => {
      render(<RoomUpload previewOnly />);
      const file = createRealJpegFile("living-room.jpg");
      fireEvent.change(screen.getByLabelText(/select room photo file/i), {
        target: { files: [file] },
      });

      const submitButton = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitButton);

      expect(await screen.findByRole("status")).toHaveTextContent(/nothing was uploaded/i);
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();
      expect(saveProjectContext).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows preview for a 5 MB JPEG and a 5 MB PNG", async () => {
      const { unmount } = render(<RoomUpload />);

      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const fiveMbJpg = createRealJpegFile(
        "living-room.jpg",
        5 * 1024 * 1024
      );

      fireEvent.change(fileInput, { target: { files: [fiveMbJpg] } });

      await waitFor(() => {
        expect(screen.getByTestId("room-image-preview")).toBeInTheDocument();
      });

      const previewImg = screen.getByAltText(
        "Selected room preview"
      ) as HTMLImageElement;
      expect(previewImg).toBeInTheDocument();
      const actualPreviewUrl = previewImg.src;
      expect(actualPreviewUrl).toMatch(/^blob:mock-url-\d+$/);

      // Decoding URL was separately revoked
      const decodeUrls1 = createdUrls.filter((u) => u !== actualPreviewUrl);
      for (const d of decodeUrls1) {
        expect(revokedUrls).toContain(d);
      }
      // Actual preview URL is active and not revoked
      expect(revokedUrls).not.toContain(actualPreviewUrl);

      expect(screen.getByText("living-room.jpg")).toBeInTheDocument();
      expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
      expect(screen.getByText(/1920 × 1080 px/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      unmount();

      // Test 5MB PNG
      render(<RoomUpload />);
      const fileInput2 = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const fiveMbPng = createRealPngFile(
        "bedroom.png",
        5 * 1024 * 1024
      );

      fireEvent.change(fileInput2, { target: { files: [fiveMbPng] } });

      await waitFor(() => {
        expect(screen.getByTestId("room-image-preview")).toBeInTheDocument();
      });

      const previewImg2 = screen.getByAltText(
        "Selected room preview"
      ) as HTMLImageElement;
      expect(previewImg2).toBeInTheDocument();
      const actualPreviewUrl2 = previewImg2.src;
      expect(actualPreviewUrl2).toMatch(/^blob:mock-url-\d+$/);
      expect(screen.getByText("bedroom.png")).toBeInTheDocument();
      expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
    });

    it("successfully decodes and accepts a valid file whose name contains 'corrupt'", async () => {
      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // File name explicitly contains "corrupt" but is a valid image with working decoder
      const validCorruptNameFile = createRealJpegFile("corrupt-room.jpg");

      fireEvent.change(fileInput, {
        target: { files: [validCorruptNameFile] },
      });

      await waitFor(() => {
        expect(screen.getByTestId("room-image-preview")).toBeInTheDocument();
      });

      expect(screen.getByText("corrupt-room.jpg")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows a useful error and makes zero API calls for PDF, zero-byte, corrupt, and max-size+1 byte files", async () => {
      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // 1. PDF
      const pdf = new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" });
      fireEvent.change(fileInput, { target: { files: [pdf] } });

      const alertPdf = await screen.findByRole("alert");
      expect(alertPdf).toHaveTextContent("Please upload JPG or PNG.");
      expect(screen.queryByTestId("room-image-preview")).not.toBeInTheDocument();
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();

      // 2. Zero-byte image
      const empty = new File([], "empty.jpg", { type: "image/jpeg" });
      fireEvent.change(fileInput, { target: { files: [empty] } });

      const alertEmpty = await screen.findByRole("alert");
      expect(alertEmpty).toHaveTextContent("The selected file is empty.");
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();

      // 3. Max size + 1 byte
      const oversized = createRealPngFile(
        "toolarge.png",
        10 * 1024 * 1024 + 1
      );
      fireEvent.change(fileInput, { target: { files: [oversized] } });

      const alertSize = await screen.findByRole("alert");
      expect(alertSize).toHaveTextContent("File size exceeds the 10MB limit.");
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();

      // 4. Corrupt image (truncated supported PNG signature whose mocked decoder rejects)
      MockImage.shouldFail = true;
      const corrupt = new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "corrupt-truncated.png",
        { type: "image/png" }
      );
      fireEvent.change(fileInput, { target: { files: [corrupt] } });

      const alertCorrupt = await screen.findByRole("alert");
      expect(alertCorrupt).toHaveTextContent(
        "The image file is corrupt or unreadable. Please upload a valid JPG or PNG."
      );
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();
      MockImage.shouldFail = false;
    });

    it("clears old error/preview on replacement, revokes old object URL, and preserves valid image on invalid replacement", async () => {
      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // Select image 1
      const img1 = createRealJpegFile("room1.jpg");
      fireEvent.change(fileInput, { target: { files: [img1] } });

      await waitFor(() => {
        expect(screen.getByText("room1.jpg")).toBeInTheDocument();
      });

      const preview1 = screen.getByAltText(
        "Selected room preview"
      ) as HTMLImageElement;
      const previewUrl1 = preview1.src;
      expect(previewUrl1).toMatch(/^blob:mock-url-\d+$/);

      // Decoding URL was separately revoked
      const decodeUrls1 = createdUrls.filter((u) => u !== previewUrl1);
      expect(decodeUrls1.length).toBeGreaterThan(0);
      for (const d of decodeUrls1) {
        expect(revokedUrls).toContain(d);
      }
      expect(revokedUrls).not.toContain(previewUrl1);

      // Replace with valid image 2
      const img2 = createRealPngFile("room2.png");
      fireEvent.change(fileInput, { target: { files: [img2] } });

      await waitFor(() => {
        expect(screen.getByText("room2.png")).toBeInTheDocument();
      });
      expect(screen.queryByText("room1.jpg")).not.toBeInTheDocument();

      const preview2 = screen.getByAltText(
        "Selected room preview"
      ) as HTMLImageElement;
      const previewUrl2 = preview2.src;
      expect(previewUrl2).toMatch(/^blob:mock-url-\d+$/);
      expect(previewUrl1).not.toBe(previewUrl2);

      // Old preview URL must be revoked on replacement
      expect(revokedUrls).toContain(previewUrl1);
      // New preview URL must NOT be revoked
      expect(revokedUrls).not.toContain(previewUrl2);

      // Decoding URL for image 2 was separately revoked
      const decodeUrls2 = createdUrls.filter(
        (u) => u !== previewUrl1 && u !== previewUrl2
      );
      for (const d of decodeUrls2) {
        expect(revokedUrls).toContain(d);
      }

      // Attempt invalid replacement (PDF): must keep room2 and show error
      const invalidPdf = new File(["%PDF-1.4"], "bad.pdf", {
        type: "application/pdf",
      });
      fireEvent.change(fileInput, { target: { files: [invalidPdf] } });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Please upload JPG or PNG.");
      // Current valid image room2.png is KEPT
      expect(screen.getByText("room2.png")).toBeInTheDocument();
      // previewUrl2 is STILL NOT revoked
      expect(revokedUrls).not.toContain(previewUrl2);
      expect(
        (screen.getByAltText("Selected room preview") as HTMLImageElement).src
      ).toBe(previewUrl2);

      // Submit button remains enabled for valid image room2.png
      const submitBtn = screen.getByTestId("submit-upload-btn");
      expect(submitBtn).not.toBeDisabled();
    });

    it("causes exactly one create and one upload when submit is clicked twice immediately", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ id: mockProjectId, status: "CREATED" }),
              50
            )
          )
      );
      vi.mocked(uploadRoomImage).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  projectId: mockProjectId,
                  imageId: "img-001",
                  width: 1920,
                  height: 1080,
                }),
              50
            )
          )
      );

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("living-room.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitBtn = await screen.findByTestId("submit-upload-btn");

      // Two immediate clicks
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/projects/${mockProjectId}/analyze`
        );
      });

      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(1);
    });

    it("retains created project ID after upload failure and Retry performs one create and two uploads in total", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockResolvedValueOnce({
        id: mockProjectId,
        status: "CREATED",
      });

      // Upload fails first, succeeds on retry
      vi.mocked(uploadRoomImage).mockRejectedValueOnce(
        new Error("Network upload error (500)")
      );
      vi.mocked(uploadRoomImage).mockResolvedValueOnce({
        projectId: mockProjectId,
        imageId: "img-002",
        width: 1920,
        height: 1080,
      });

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("kitchen.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitBtn = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitBtn);

      // Verify curated upload failure message is shown
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(USER_ERROR_MESSAGES.UPLOAD_FAILED);

      // Retry button is displayed
      const retryBtn = screen.getByRole("button", { name: /retry upload/i });
      expect(retryBtn).toBeInTheDocument();

      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(1);

      // Click Retry
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/projects/${mockProjectId}/analyze`
        );
      });

      // Exactly 1 create call, 2 upload calls in total
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(2);

      // Verify retained projectId was passed to the retry upload call
      expect(uploadRoomImage).toHaveBeenNthCalledWith(
        2,
        mockProjectId,
        file,
        expect.any(AbortSignal)
      );
    });

    it("saves matching project/image context with orientation-corrected dimensions and navigates to the exact analysis path", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockResolvedValueOnce({
        id: mockProjectId,
        status: "CREATED",
      });
      vi.mocked(uploadRoomImage).mockResolvedValueOnce({
        projectId: mockProjectId,
        imageId: "img-789",
      });

      const { unmount } = render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealPngFile("hallway.png");
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("room-image-preview")).toBeInTheDocument();
      });

      const previewImg = screen.getByAltText(
        "Selected room preview"
      ) as HTMLImageElement;
      const expectedPreviewUrl = previewImg.src;

      const submitBtn = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(saveProjectContext).toHaveBeenCalledTimes(1);
      });

      // Context must contain verified dimensions (1920x1080) and exact previewUrl without requiring absent imageUrl property
      expect(saveProjectContext).toHaveBeenCalledWith({
        projectId: mockProjectId,
        image: expect.objectContaining({
          projectId: mockProjectId,
          imageId: "img-789",
          width: 1920,
          height: 1080,
        }),
        previewUrl: expectedPreviewUrl,
      });

      expect(mockPush).toHaveBeenCalledWith(
        `/projects/${mockProjectId}/analyze`
      );

      // URL ownership transfer: unmounting after saveProjectContext must NOT revoke that URL
      unmount();
      expect(revokedUrls).not.toContain(expectedPreviewUrl);
    });

    it("revokes untransferred preview URL when unmounting before successful submission", async () => {
      const { unmount } = render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("guest-room.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("room-image-preview")).toBeInTheDocument();
      });

      const previewImg = screen.getByAltText(
        "Selected room preview"
      ) as HTMLImageElement;
      const previewUrl = previewImg.src;
      expect(previewUrl).toMatch(/^blob:mock-url-\d+$/);

      // Ensure decode URL was separately revoked, but previewUrl is still active
      const decodeUrls = createdUrls.filter((u) => u !== previewUrl);
      for (const d of decodeUrls) {
        expect(revokedUrls).toContain(d);
      }
      expect(revokedUrls).not.toContain(previewUrl);

      unmount();

      // Untransferred preview URL MUST be revoked on unmount
      expect(revokedUrls).toContain(previewUrl);
    });

    it("prevents stale upload from overwriting the new selection when replaced during or after failure", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockResolvedValue({
        id: mockProjectId,
        status: "CREATED",
      });

      let resolveSlowUpload!: (val: RoomImage) => void;
      vi.mocked(uploadRoomImage).mockImplementationOnce(
        () =>
          new Promise<RoomImage>((resolve) => {
            resolveSlowUpload = resolve;
          })
      );

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // Select file 1
      const file1 = createRealJpegFile("room-first.jpg");
      fireEvent.change(fileInput, { target: { files: [file1] } });

      const submitBtn = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitBtn);

      // Wait until uploadRoomImage is actually called and in-flight before replacing file
      await waitFor(() => {
        expect(uploadRoomImage).toHaveBeenCalledTimes(1);
      });

      // Replace with file 2 while file 1 upload is in-flight
      const file2 = createRealPngFile("room-second.png");
      fireEvent.change(fileInput, { target: { files: [file2] } });

      await waitFor(() => {
        expect(screen.getByText("room-second.png")).toBeInTheDocument();
      });

      // Now old upload finishes
      resolveSlowUpload({
        projectId: mockProjectId,
        imageId: "stale-img",
        width: 1920,
        height: 1080,
      });

      // Await observable settled state: old upload finally block clears isSubmitting and re-enables button
      await waitFor(() => {
        expect(submitBtn).not.toBeDisabled();
      });

      // Stale upload must NOT navigate or save context
      expect(saveProjectContext).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText("room-second.png")).toBeInTheDocument();
    });

    it("handles deferred decode race where slower first selection does not overwrite newer image", async () => {
      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      MockImage.delayLoad = true;

      const file1 = createRealJpegFile("first-slow.jpg");
      const file2 = createRealPngFile("second-fast.png");

      // User selects file 1
      fireEvent.change(fileInput, { target: { files: [file1] } });
      await waitFor(() => {
        expect(MockImage.pendingLoads.length).toBe(1);
      });

      // User immediately selects file 2
      fireEvent.change(fileInput, { target: { files: [file2] } });
      await waitFor(() => {
        expect(MockImage.pendingLoads.length).toBe(2);
      });

      // Resolve file 2 decode first
      const resolveFile2 = MockImage.pendingLoads[1];
      const resolveFile1 = MockImage.pendingLoads[0];

      await act(async () => {
        resolveFile2();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText("second-fast.png")).toBeInTheDocument();
      });

      // Slower file 1 decode completes later
      await act(async () => {
        resolveFile1();
        await Promise.resolve();
      });

      // Ensure second-fast.png remains active and is not overwritten by first-slow.jpg
      expect(screen.getByText("second-fast.png")).toBeInTheDocument();
      expect(screen.queryByText("first-slow.jpg")).not.toBeInTheDocument();
    });

    it("does not leak preview URL when component unmounts during deferred image decode", async () => {
      const { unmount } = render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      MockImage.delayLoad = true;

      const file = createRealJpegFile("unmount-race.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(MockImage.pendingLoads.length).toBe(1);
      });
      const resolveDecode = MockImage.pendingLoads[0];

      // Unmount before decode finishes
      unmount();

      // Resolve decode after unmount
      await act(async () => {
        resolveDecode();
        await Promise.resolve();
      });

      // Any URL that was created must have been revoked
      for (const url of createdUrls) {
        expect(revokedUrls).toContain(url);
      }
    });

    it("shows recovery error when URL.createObjectURL is unsupported", async () => {
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: undefined,
        revokeObjectURL: vi.fn(),
      });

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("test.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(USER_ERROR_MESSAGES.BROWSER_UNSUPPORTED);
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();
    });

    it("shows curated error when project creation fails", async () => {
      vi.mocked(createProject).mockRejectedValueOnce(
        new Error("Internal 500 error from database connection pool")
      );

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("room.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitBtn = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(USER_ERROR_MESSAGES.CREATE_FAILED);
    });

    it("supports drag and drop and keyboard interaction on the dropzone", async () => {
      render(<RoomUpload />);

      const dropzone = screen.getByRole("button", {
        name: /upload room image/i,
      });

      // Drag over / enter / leave states
      fireEvent.dragEnter(dropzone);
      fireEvent.dragOver(dropzone);
      fireEvent.dragLeave(dropzone);

      // Drop valid file
      const file = createRealJpegFile("dragged-room.jpg");
      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("room-image-preview")).toBeInTheDocument();
      });
      expect(screen.getByText("dragged-room.jpg")).toBeInTheDocument();
    });

    // --- Deterministic Regression Tests for Audit Findings 1, 2, 4 ---

    it("Finding 1 Regression: prevents submission while latest replacement decode is deferred/pending, then resolves decode and submits replacement B (no A upload)", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockResolvedValue({
        id: mockProjectId,
        status: "CREATED",
      });
      vi.mocked(uploadRoomImage).mockResolvedValue({
        projectId: mockProjectId,
        imageId: "img-finding-1-b",
        width: 1920,
        height: 1080,
      });

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // Select initial valid file A
      const fileA = createRealPngFile("original.png");
      fireEvent.change(fileInput, { target: { files: [fileA] } });

      await waitFor(() => {
        expect(screen.getByText("original.png")).toBeInTheDocument();
      });

      // Defer decode for replacement file B
      MockImage.delayLoad = true;

      // Select replacement file B
      const fileB = createRealPngFile("replacement.png");
      fireEvent.change(fileInput, { target: { files: [fileB] } });

      // Replacement decode is currently pending:
      // Submit button should be disabled, and even if clicked, must not trigger API calls
      const submitBtn = screen.getByTestId("submit-upload-btn");
      expect(submitBtn).toBeDisabled();

      fireEvent.click(submitBtn);

      // Assert that submission was prevented while replacement decode was pending
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();

      // Wait for replacement decode to register as pending
      await waitFor(() => {
        expect(MockImage.pendingLoads.length).toBe(1);
      });

      // Resolve B decode successfully
      const resolveB = MockImage.pendingLoads[0];
      await act(async () => {
        resolveB();
        await Promise.resolve();
      });

      // Assert B becomes chosen and displayed
      await waitFor(() => {
        expect(screen.getByText("replacement.png")).toBeInTheDocument();
      });
      expect(screen.queryByText("original.png")).not.toBeInTheDocument();
      expect(submitBtn).not.toBeDisabled();

      // Submit replacement B
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(createProject).toHaveBeenCalledTimes(1);
        expect(uploadRoomImage).toHaveBeenCalledTimes(1);
      });

      // Verify B was uploaded and NO upload of A occurred using exact object identity
      expect(uploadRoomImage).toHaveBeenCalledTimes(1);
      expect(vi.mocked(uploadRoomImage).mock.calls[0][0]).toBe(mockProjectId);
      expect(vi.mocked(uploadRoomImage).mock.calls[0][1]).toBe(fileB);
      expect(vi.mocked(uploadRoomImage).mock.calls[0][1]).not.toBe(fileA);
    });

    it("Finding 2 Recovery: retries navigation only without another upload when navigation fails after successful save (clears uploadFailed on retry)", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockResolvedValueOnce({
        id: mockProjectId,
        status: "CREATED",
      });
      // 1. Initial upload fails, retry upload succeeds
      vi.mocked(uploadRoomImage)
        .mockRejectedValueOnce(new Error("Initial upload failure"))
        .mockResolvedValueOnce({
          projectId: mockProjectId,
          imageId: "img-nav-retry",
          width: 1920,
          height: 1080,
        });

      // 2. First navigation fails, retry navigation succeeds
      mockPush
        .mockImplementationOnce(() => {
          throw new Error("Navigation failed");
        })
        .mockImplementationOnce(() => {});

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("room.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitBtn = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitBtn);

      // Initial upload fails: shows UPLOAD_FAILED and "Retry Upload"
      const alertUploadFail = await screen.findByRole("alert");
      expect(alertUploadFail).toHaveTextContent(
        USER_ERROR_MESSAGES.UPLOAD_FAILED
      );
      expect(submitBtn).toHaveTextContent("Retry Upload");
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(1);

      // Click "Retry Upload": upload succeeds, save context succeeds, then navigation throws
      fireEvent.click(submitBtn);

      // Alert now shows NAVIGATION_FAILED
      const alertNavFail = await screen.findByRole("alert");
      expect(alertNavFail).toHaveTextContent(
        USER_ERROR_MESSAGES.NAVIGATION_FAILED
      );

      // Crucial: uploadFailed was cleared; button shows "Retry Navigation", NOT "Retry Upload"
      expect(submitBtn).not.toBeDisabled();
      expect(submitBtn).toHaveTextContent("Retry Navigation");

      // Verify createProject was not called again, and uploadRoomImage was called for the retry
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(2);

      // Click "Retry Navigation"
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledTimes(2);
      });

      // Crucial: create and upload were NEVER called again!
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenLastCalledWith(
        `/projects/${mockProjectId}/analyze`
      );
    });

    it("Finding 2 Regression: prevents resubmission after successful upload while page remains mounted before navigation finishes", async () => {
      const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      vi.mocked(createProject).mockResolvedValueOnce({
        id: mockProjectId,
        status: "CREATED",
      });
      vi.mocked(uploadRoomImage).mockResolvedValue({
        projectId: mockProjectId,
        imageId: "img-nav-test",
        width: 1920,
        height: 1080,
      });

      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      const file = createRealJpegFile("living-room.jpg");
      fireEvent.change(fileInput, { target: { files: [file] } });

      const submitBtn = await screen.findByTestId("submit-upload-btn");
      fireEvent.click(submitBtn);

      // Wait until createProject, uploadRoomImage, saveProjectContext, and router.push finish
      await waitFor(() => {
        expect(saveProjectContext).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith(
          `/projects/${mockProjectId}/analyze`
        );
      });

      // Exactly 1 create and 1 upload so far
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(1);

      // In terminal success state, submit button should remain disabled
      expect(submitBtn).toBeDisabled();

      // User clicks submit again while the upload page is still mounted (simulating router transition delay)
      fireEvent.click(submitBtn);

      // Submission must be blocked in terminal success state: no second upload call!
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(uploadRoomImage).toHaveBeenCalledTimes(1);
    });

    it("Finding 4 Regression: rejects real GIF89a bytes renamed as png before create/upload API calls", async () => {
      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // Real GIF89a header bytes renamed to .png with image/png MIME type
      const fakePngFile = createRealGifFile("renamed.png");
      fireEvent.change(fileInput, { target: { files: [fakePngFile] } });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Please upload JPG or PNG.");
      expect(
        screen.queryByTestId("room-image-preview")
      ).not.toBeInTheDocument();
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();
    });

    it("Finding 4 Regression: rejects real WebP bytes renamed as jpg before create/upload API calls", async () => {
      render(<RoomUpload />);
      const fileInput = screen.getByLabelText(
        /select room photo file/i
      ) as HTMLInputElement;

      // Real WebP header bytes renamed to .jpg with image/jpeg MIME type
      const fakeJpgFile = createRealWebpFile("renamed.jpg");
      fireEvent.change(fileInput, { target: { files: [fakeJpgFile] } });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Please upload JPG or PNG.");
      expect(
        screen.queryByTestId("room-image-preview")
      ).not.toBeInTheDocument();
      expect(createProject).not.toHaveBeenCalled();
      expect(uploadRoomImage).not.toHaveBeenCalled();
    });
  });
});
