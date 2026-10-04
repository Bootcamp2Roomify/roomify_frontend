import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createProject,
  uploadRoomImage,
  analyzeRoom,
  getActiveRoomImage,
  normalizeDetections,
  ApiError,
  ContractBlockedError,
  RawVisionDetection,
  isValidUuid,
} from "../src/services/api";
import {
  saveProjectContext,
  loadProjectContext,
  clearProjectContext,
} from "../src/features/room/projectContext";
import { ProjectContext } from "../src/types/room";

describe("Shared API & Adapters", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("getActiveRoomImage", () => {
    const projectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

    it("returns the image URL and dimensions for the project", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            imageId: 7,
            projectId,
            contentType: "image/jpeg",
            width: 1200,
            height: 800,
            imageUrl: `http://localhost:8080/api/projects/${projectId}/image/content`,
          }),
      });

      await expect(getActiveRoomImage(projectId)).resolves.toEqual({
        projectId,
        imageId: "7",
        imageUrl: `http://localhost:8080/api/projects/${projectId}/image/content`,
        width: 1200,
        height: 800,
      });
    });

    it("rejects a response without dimensions", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            imageId: 7,
            projectId,
            imageUrl: "http://localhost:8080/x",
            width: null,
            height: null,
          }),
      });

      await expect(getActiveRoomImage(projectId)).rejects.toThrow(
        "Malformed room image response"
      );
    });

    it("rejects a response for a different project", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            imageId: 7,
            projectId: "00000000-0000-0000-0000-000000000000",
            imageUrl: "http://localhost:8080/x",
            width: 10,
            height: 10,
          }),
      });

      await expect(getActiveRoomImage(projectId)).rejects.toThrow(
        "projectId mismatch"
      );
    });
  });

  describe("createProject validation and failure safety", () => {
    it("fails safely when server returns malformed response missing id", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "CREATED" }),
      });

      await expect(createProject()).rejects.toThrow(
        "Malformed createProject response: project id must be a valid UUID string"
      );
    });

    it("rejects numeric project id, accepting UUID string only", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 12345, status: "CREATED" }),
      });

      await expect(createProject()).rejects.toThrow(
        "Malformed createProject response: project id must be a valid UUID string"
      );
    });

    it("rejects invalid non-UUID string id", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "not-a-uuid", status: "CREATED" }),
      });

      await expect(createProject()).rejects.toThrow(
        "Malformed createProject response: project id must be a valid UUID string"
      );
    });

    it("fails safely when server returns malformed response missing status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
      });

      await expect(createProject()).rejects.toThrow(
        "Malformed createProject response: missing or invalid project status"
      );
    });

    it("fails safely on non-JSON HTTP error body and preserves text", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway: upstream down",
      });

      try {
        await createProject();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.details).toBe("Bad Gateway: upstream down");
      }
    });

    it("succeeds with valid UUID string id and status", async () => {
      const validUuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      expect(isValidUuid(validUuid)).toBe(true);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: validUuid,
            status: "CREATED",
          }),
      });

      const result = await createProject();
      expect(result).toEqual({
        id: validUuid,
        status: "CREATED",
      });
    });
  });

  describe("uploadRoomImage validation and identity checks", () => {
    it("fails safely when response lacks imageId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ projectId: "proj-123" }),
      });

      const dummyFile = new File(["test-content"], "room.jpg", { type: "image/jpeg" });
      await expect(uploadRoomImage("proj-123", dummyFile)).rejects.toThrow(
        "Malformed uploadRoomImage response: missing or invalid imageId"
      );
    });

    it("fails when response lacks mandatory projectId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            imageId: "img-456",
            // missing projectId
          }),
      });

      const dummyFile = new File(["test-content"], "room.jpg", { type: "image/jpeg" });
      await expect(uploadRoomImage("proj-123", dummyFile)).rejects.toThrow(
        "Malformed uploadRoomImage response: missing required projectId"
      );
    });

    it("fails when response projectId mismatches requested projectId", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            imageId: "img-456",
            projectId: "proj-999", // Mismatch with proj-123
          }),
      });

      const dummyFile = new File(["test-content"], "room.jpg", { type: "image/jpeg" });
      await expect(uploadRoomImage("proj-123", dummyFile)).rejects.toThrow(
        /uploadRoomImage response projectId mismatch/
      );
    });

    it("succeeds when response matches identity", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            imageId: 101,
            projectId: "proj-123",
            width: 1200,
            height: 800,
          }),
      });

      const dummyFile = new File(["test-content"], "room.jpg", { type: "image/jpeg" });
      const result = await uploadRoomImage("proj-123", dummyFile);
      expect(result).toEqual({
        projectId: "proj-123",
        imageId: "101",
        imageUrl: undefined,
        width: 1200,
        height: 800,
      });
    });
  });

  describe("analyzeRoom validation and status mapping", () => {
    it("maps 409 Conflict (invalid state / no active image) safely", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            code: "INVALID_STATE_TRANSITION",
            message: "Cannot transition state",
          }),
      });

      await expect(analyzeRoom("proj-123")).rejects.toThrow(
        "Invalid project state or missing active image for analysis (409 Conflict)."
      );
    });

    it("maps 503 Service Unavailable (vision failure) safely", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () =>
          JSON.stringify({
            code: "ANALYSIS_FAILED",
            message: "Analysis could not be completed. Please retry.",
          }),
      });

      await expect(analyzeRoom("proj-123")).rejects.toThrow(
        "Vision service unavailable (503). Analysis could not be completed; please retry."
      );
    });

    it("accepts 'completed' status case-insensitively (e.g. COMPLETED)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "COMPLETED", // Uppercase COMPLETED
            imageId: "img-1",
            detections: [],
          }),
      });

      const result = await analyzeRoom("proj-123");
      expect(result).toEqual({
        projectId: "proj-123",
        imageId: "img-1",
        detections: [],
      });
    });

    it("fails when status is not completed (e.g. PENDING or IN_PROGRESS)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "IN_PROGRESS",
            imageId: "img-1",
            detections: [],
          }),
      });

      await expect(analyzeRoom("proj-123")).rejects.toThrow(
        /Unexpected analysis status: expected "completed" \(case-insensitive\)/
      );
    });

    it("fails when detections is not an array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "completed",
            imageId: "img-1",
            detections: "not-an-array",
          }),
      });

      await expect(analyzeRoom("proj-123")).rejects.toThrow(
        "Malformed analyzeRoom response: detections must be an array"
      );
    });

    it("fails when imageId cannot be verified (never invents synthetic 'img-0')", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "completed",
            // missing imageId, and no projectContext loaded
            detections: [],
          }),
      });

      await expect(analyzeRoom("proj-123")).rejects.toThrow(
        /Cannot resolve verified imageId for project/
      );
    });

    it("fails on imageId mismatch with projectContext", async () => {
      saveProjectContext({
        projectId: "proj-123",
        image: {
          projectId: "proj-123",
          imageId: "img-saved-1",
          width: 800,
          height: 600,
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "completed",
            imageId: "img-different-2", // Mismatched imageId
            detections: [],
          }),
      });

      await expect(analyzeRoom("proj-123")).rejects.toThrow(
        /analyzeRoom response imageId mismatch/
      );
    });

    describe("Finding 6: Paired dimension selection & rejection", () => {
      beforeEach(() => {
        clearProjectContext("proj-123");
      });

      afterEach(() => {
        clearProjectContext("proj-123");
      });

      it("rejects partial response dimensions when width=320 and height is omitted", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            width: 640,
            height: 480,
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              width: 320,
              // height omitted
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 160, y: 120, width: 160, height: 120 },
                },
              ],
            }),
        });

        await expect(analyzeRoom("proj-123")).rejects.toThrow(ContractBlockedError);
        await expect(analyzeRoom("proj-123")).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof ContractBlockedError &&
            err.code === "MISSING_IMAGE_DIMENSIONS"
        );
      });

      it("rejects converse partial response dimensions when height is provided and width is omitted", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            width: 640,
            height: 480,
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              // width omitted
              height: 240,
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 160, y: 120, width: 160, height: 120 },
                },
              ],
            }),
        });

        await expect(analyzeRoom("proj-123")).rejects.toThrow(ContractBlockedError);
        await expect(analyzeRoom("proj-123")).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof ContractBlockedError &&
            err.code === "MISSING_IMAGE_DIMENSIONS"
        );
      });

      it("rejects invalid supplied response dimension pair even with complete context", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            width: 640,
            height: 480,
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              width: -320,
              height: 480,
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 160, y: 120, width: 160, height: 120 },
                },
              ],
            }),
        });

        await expect(analyzeRoom("proj-123")).rejects.toThrow(ContractBlockedError);
        await expect(analyzeRoom("proj-123")).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof ContractBlockedError &&
            err.code === "MISSING_IMAGE_DIMENSIONS"
        );
      });

      it("rejects response dimension with null or non-finite values as typed ContractBlockedError MISSING_IMAGE_DIMENSIONS", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            width: 640,
            height: 480,
          },
        });

        // 1. null width
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              width: null,
              height: 480,
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 10, y: 10, width: 20, height: 20 },
                },
              ],
            }),
        });

        await expect(analyzeRoom("proj-123")).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof ContractBlockedError &&
            err.code === "MISSING_IMAGE_DIMENSIONS"
        );

        // 2. zero width
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              width: 0,
              height: 480,
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 10, y: 10, width: 20, height: 20 },
                },
              ],
            }),
        });

        await expect(analyzeRoom("proj-123")).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof ContractBlockedError &&
            err.code === "MISSING_IMAGE_DIMENSIONS"
        );
      });

      it("uses complete verified context dimensions when response dimension pair is absent", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            width: 640,
            height: 480,
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              // width and height both absent
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 160, y: 120, width: 160, height: 120 },
                },
              ],
            }),
        });

        const result = await analyzeRoom("proj-123");
        expect(result.detections).toHaveLength(1);
        expect(result.detections[0].box).toEqual({
          x: 0.25,
          y: 0.25,
          width: 0.25,
          height: 0.25,
        });
      });

      it("rejects when both response dimensions are absent AND context has no dimensions", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            // missing width and height
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 160, y: 120, width: 160, height: 120 },
                },
              ],
            }),
        });

        await expect(analyzeRoom("proj-123")).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof ContractBlockedError &&
            err.code === "MISSING_IMAGE_DIMENSIONS"
        );
      });

      it("uses valid complete response dimension pair instead of context", async () => {
        saveProjectContext({
          projectId: "proj-123",
          image: {
            projectId: "proj-123",
            imageId: "img-1",
            width: 640,
            height: 480,
          },
        });

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "completed",
              imageId: "img-1",
              width: 1280,
              height: 960,
              detections: [
                {
                  id: "det-1",
                  label: "chair",
                  confidence: 0.9,
                  bounding_box: { x: 320, y: 240, width: 320, height: 240 },
                },
              ],
            }),
        });

        const result = await analyzeRoom("proj-123");
        expect(result.detections).toHaveLength(1);
        expect(result.detections[0].box).toEqual({
          x: 0.25,
          y: 0.25,
          width: 0.25,
          height: 0.25,
        });
      });
    });
  });

  describe("Detection normalization & coordinate units", () => {
    const dimensions = { width: 1000, height: 500 };

    it("converts pixel units to normalized [0, 1] coordinates", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "chair-1",
          label: "chair",
          confidence: 0.83,
          bounding_box: { x: 100, y: 50, width: 200, height: 100 },
        },
      ];

      const result = normalizeDetections(raw, dimensions, "pixel");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "chair-1",
        label: "chair",
        confidence: 0.83,
        box: {
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
        },
        decision: "UNSURE",
      });
    });

    it("rejects non-numeric confidence (e.g. null coerced by Number)", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "chair-1",
          label: "chair",
          confidence: null as unknown as number,
          bounding_box: { x: 10, y: 10, width: 50, height: 50 },
        },
      ];

      expect(() => normalizeDetections(raw, dimensions, "pixel")).toThrow(
        ContractBlockedError
      );
      expect(() => normalizeDetections(raw, dimensions, "pixel")).toThrow(
        /has invalid confidence/
      );
    });

    it("rejects duplicate stable IDs within an analysis result", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "chair-1",
          label: "chair",
          confidence: 0.8,
          bounding_box: { x: 10, y: 10, width: 50, height: 50 },
        },
        {
          id: "chair-1", // duplicate ID
          label: "chair two",
          confidence: 0.9,
          bounding_box: { x: 100, y: 100, width: 50, height: 50 },
        },
      ];

      expect(() => normalizeDetections(raw, dimensions, "pixel")).toThrow(
        ContractBlockedError
      );
      expect(() => normalizeDetections(raw, dimensions, "pixel")).toThrow(
        /Duplicate detection ID found/
      );
    });

    it("rejects boxes that exceed image boundaries (x+width > imgW)", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "chair-1",
          label: "chair",
          confidence: 0.85,
          bounding_box: { x: 900, y: 100, width: 200, height: 100 }, // 900 + 200 = 1100 > 1000
        },
      ];

      expect(() => normalizeDetections(raw, dimensions, "pixel")).toThrow(
        ContractBlockedError
      );
      expect(() => normalizeDetections(raw, dimensions, "pixel")).toThrow(
        /exceeds image bounds/
      );
    });

    it("fails explicitly when stable detection IDs are unavailable", () => {
      const missingId: RawVisionDetection[] = [
        {
          label: "chair",
          confidence: 0.85,
          bounding_box: { x: 50, y: 50, width: 100, height: 100 },
        },
      ];

      expect(() => normalizeDetections(missingId, dimensions, "pixel")).toThrow(
        ContractBlockedError
      );
      expect(() => normalizeDetections(missingId, dimensions, "pixel")).toThrow(
        /lacks a stable detection ID/
      );
    });

    it("empty detections array returns empty detections success", () => {
      const result = normalizeDetections([], dimensions, "pixel");
      expect(result).toEqual([]);
    });

    it("normalizes edge-aligned pixel box (640x480, box x=5 y=0 w=635 h=480) preserving positive geometry and sum <= 1", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "edge-box-1",
          label: "chair",
          confidence: 0.9,
          bounding_box: { x: 5, y: 0, width: 635, height: 480 },
        },
      ];

      const result = normalizeDetections(raw, { width: 640, height: 480 }, "pixel");
      expect(result).toHaveLength(1);
      const box = result[0].box;
      expect(box.x).toBe(0.0078125);
      expect(box.width).toBe(0.9921875);
      expect(box.y).toBe(0);
      expect(box.height).toBe(1);
      expect(box.x).toBeGreaterThan(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeLessThanOrEqual(1);
      expect(box.y).toBeLessThanOrEqual(1);
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.height).toBeLessThanOrEqual(1);
      expect(box.x + box.width).toBe(1);
      expect(box.y + box.height).toBe(1);
    });

    it("preserves source precision in normalized mode without independent toFixed rounding", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "high-precision-1",
          label: "lamp",
          confidence: 0.92,
          bounding_box: {
            x: 0.12345678,
            y: 0.23456789,
            width: 0.34567891,
            height: 0.45678912,
          },
        },
      ];

      const result = normalizeDetections(raw, dimensions, "normalized");
      expect(result).toHaveLength(1);
      expect(result[0].box).toEqual({
        x: 0.12345678,
        y: 0.23456789,
        width: 0.34567891,
        height: 0.45678912,
      });
    });

    it("rejects box when pixel geometry exceeds bounds width by 1 pixel", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "exceed-w-1",
          label: "chair",
          confidence: 0.85,
          bounding_box: { x: 5, y: 0, width: 636, height: 480 }, // 5 + 636 = 641 > 640
        },
      ];

      expect(() =>
        normalizeDetections(raw, { width: 640, height: 480 }, "pixel")
      ).toThrow(ContractBlockedError);
      expect(() =>
        normalizeDetections(raw, { width: 640, height: 480 }, "pixel")
      ).toThrow(/exceeds image bounds/);
    });

    it("rejects box when pixel geometry exceeds bounds height by 1 pixel", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "exceed-h-1",
          label: "chair",
          confidence: 0.85,
          bounding_box: { x: 0, y: 1, width: 640, height: 480 }, // 1 + 480 = 481 > 480
        },
      ];

      expect(() =>
        normalizeDetections(raw, { width: 640, height: 480 }, "pixel")
      ).toThrow(ContractBlockedError);
      expect(() =>
        normalizeDetections(raw, { width: 640, height: 480 }, "pixel")
      ).toThrow(/exceeds image bounds/);
    });

    it("rejects box in normalized mode when x + width exceeds 1", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "norm-exceed-w",
          label: "table",
          confidence: 0.9,
          bounding_box: { x: 0.6, y: 0.1, width: 0.400001, height: 0.5 },
        },
      ];

      expect(() =>
        normalizeDetections(raw, dimensions, "normalized")
      ).toThrow(ContractBlockedError);
      expect(() =>
        normalizeDetections(raw, dimensions, "normalized")
      ).toThrow(/normalized box exceeds \[0, 1\] unit bounds/);
    });

    it("rejects box in normalized mode when y + height exceeds 1", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "norm-exceed-h",
          label: "table",
          confidence: 0.9,
          bounding_box: { x: 0.1, y: 0.8, width: 0.5, height: 0.200001 },
        },
      ];

      expect(() =>
        normalizeDetections(raw, dimensions, "normalized")
      ).toThrow(ContractBlockedError);
      expect(() =>
        normalizeDetections(raw, dimensions, "normalized")
      ).toThrow(/normalized box exceeds \[0, 1\] unit bounds/);
    });

    it("accepts normalized box that touches unit boundaries exactly (x+width = 1, y+height = 1)", () => {
      const raw: RawVisionDetection[] = [
        {
          id: "norm-touch-edge",
          label: "rug",
          confidence: 0.9,
          bounding_box: { x: 0.25, y: 0.1, width: 0.75, height: 0.9 },
        },
      ];

      const result = normalizeDetections(raw, dimensions, "normalized");
      expect(result).toHaveLength(1);
      expect(result[0].box).toEqual({
        x: 0.25,
        y: 0.1,
        width: 0.75,
        height: 0.9,
      });
    });

    it("rejects box with negative coordinate or non-positive width/height in normalized mode", () => {
      const negativeX: RawVisionDetection[] = [
        {
          id: "neg-x",
          label: "chair",
          confidence: 0.8,
          bounding_box: { x: -0.01, y: 0, width: 0.5, height: 0.5 },
        },
      ];
      expect(() =>
        normalizeDetections(negativeX, dimensions, "normalized")
      ).toThrow(ContractBlockedError);

      const zeroWidth: RawVisionDetection[] = [
        {
          id: "zero-w",
          label: "chair",
          confidence: 0.8,
          bounding_box: { x: 0, y: 0, width: 0, height: 0.5 },
        },
      ];
      expect(() =>
        normalizeDetections(zeroWidth, dimensions, "normalized")
      ).toThrow(ContractBlockedError);
    });

    it("normalizes edge-aligned pixel box via analyzeRoom real adapter preserving positive geometry and sum <= 1", async () => {
      saveProjectContext({
        projectId: "proj-123",
        image: {
          projectId: "proj-123",
          imageId: "img-1",
          width: 640,
          height: 480,
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "completed",
            imageId: "img-1",
            width: 640,
            height: 480,
            detections: [
              {
                id: "edge-box-1",
                label: "chair",
                confidence: 0.9,
                bounding_box: { x: 5, y: 0, width: 635, height: 480 },
              },
            ],
          }),
      });

      const result = await analyzeRoom("proj-123");
      expect(result.detections).toHaveLength(1);
      const box = result.detections[0].box;
      expect(box.x).toBe(0.0078125);
      expect(box.width).toBe(0.9921875);
      expect(box.y).toBe(0);
      expect(box.height).toBe(1);
      expect(box.x).toBeGreaterThan(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeLessThanOrEqual(1);
      expect(box.y).toBeLessThanOrEqual(1);
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.height).toBeLessThanOrEqual(1);
      expect(box.x + box.width).toBe(1);
      expect(box.y + box.height).toBe(1);

      clearProjectContext("proj-123");
    });
  });
});

describe("Project Context Lifecycle & Storage Safety", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearProjectContext("proj-1");
    clearProjectContext("proj-2");
    vi.restoreAllMocks();
  });

  const sampleContext: ProjectContext = {
    projectId: "proj-1",
    image: {
      projectId: "proj-1",
      imageId: "img-1",
      imageUrl: "https://example.com/room.jpg",
      width: 1920,
      height: 1080,
    },
    previewUrl: "blob:http://localhost:3000/preview-1",
  };

  it("saves and loads project context matching identity", () => {
    saveProjectContext(sampleContext);
    const loaded = loadProjectContext("proj-1");

    expect(loaded).not.toBeNull();
    expect(loaded?.projectId).toBe("proj-1");
    expect(loaded?.image.imageId).toBe("img-1");
    expect(loaded?.image.width).toBe(1920);
    expect(loaded?.previewUrl).toBe("blob:http://localhost:3000/preview-1");
  });

  it("wrong-project context is NOT returned", () => {
    saveProjectContext(sampleContext);

    const wrongProject = loadProjectContext("proj-2");
    expect(wrongProject).toBeNull();
  });

  it("rejects invalid save identity and nested metadata before ownership transfer", () => {
    const revokeSpy = vi.fn();
    global.URL.revokeObjectURL = revokeSpy;

    // 1. Image projectId mismatch
    expect(() =>
      saveProjectContext({
        projectId: "proj-1",
        image: {
          projectId: "proj-different-2",
          imageId: "img-1",
        },
        previewUrl: "blob:http://localhost:3000/new-preview",
      })
    ).toThrow(/must match context projectId/);

    // 2. Missing imageId
    expect(() =>
      saveProjectContext({
        projectId: "proj-1",
        image: {
          projectId: "proj-1",
          imageId: "",
        },
        previewUrl: "blob:http://localhost:3000/new-preview",
      })
    ).toThrow(/Valid non-empty imageId is required/);

    // 3. No URL revocation occurred because validation failed before mutation
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(loadProjectContext("proj-1")).toBeNull();
  });

  it("replacement without preview revokes and clears prior preview", () => {
    const revokeSpy = vi.fn();
    global.URL.revokeObjectURL = revokeSpy;

    // 1. Initial save with preview
    saveProjectContext(sampleContext);
    expect(revokeSpy).not.toHaveBeenCalled();

    // 2. Replacement context without previewUrl
    const replacementWithoutPreview: ProjectContext = {
      projectId: "proj-1",
      image: {
        projectId: "proj-1",
        imageId: "img-replaced-2",
        width: 1200,
        height: 900,
      },
      previewUrl: undefined,
    };
    saveProjectContext(replacementWithoutPreview);

    // Prior preview must be revoked
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:3000/preview-1");

    // Loaded context has updated image but NO previewUrl
    const loaded = loadProjectContext("proj-1");
    expect(loaded?.image.imageId).toBe("img-replaced-2");
    expect(loaded?.previewUrl).toBeUndefined();
  });

  it("prefers memory metadata when storage replacement fails so old stored image cannot pair with new preview", () => {
    saveProjectContext(sampleContext);

    const initialStored = sessionStorage.getItem("roomify_project_context_proj-1");
    expect(initialStored).toContain('"img-1"');

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError: storage full");
    });

    const replacementContext: ProjectContext = {
      projectId: "proj-1",
      image: {
        projectId: "proj-1",
        imageId: "img-replacement-2",
        width: 800,
        height: 600,
      },
      previewUrl: "blob:http://localhost:3000/preview-2",
    };

    saveProjectContext(replacementContext);

    const loaded = loadProjectContext("proj-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.image.imageId).toBe("img-replacement-2");
    expect(loaded?.image.width).toBe(800);
    expect(loaded?.previewUrl).toBe("blob:http://localhost:3000/preview-2");
  });

  it("storage failure does not crash save or load", () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    expect(() => saveProjectContext(sampleContext)).not.toThrow();

    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(() => loadProjectContext("proj-1")).not.toThrow();

    setItemSpy.mockRestore();
    getItemSpy.mockRestore();
  });

  it("corrupted storage data does not crash loadProjectContext", () => {
    sessionStorage.setItem("roomify_project_context_proj-1", "invalid json {{");

    const loaded = loadProjectContext("proj-1");
    expect(loaded).toBeNull();
  });

  it("transfers previewUrl ownership and revokes on replacement or clear", () => {
    const revokeSpy = vi.fn();
    global.URL.revokeObjectURL = revokeSpy;

    saveProjectContext(sampleContext);
    expect(revokeSpy).not.toHaveBeenCalled();

    const updatedContext: ProjectContext = {
      ...sampleContext,
      previewUrl: "blob:http://localhost:3000/preview-2",
    };
    saveProjectContext(updatedContext);
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:3000/preview-1");

    clearProjectContext("proj-1");
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:3000/preview-2");
  });

  it("does not persist blob URL or raw binary bytes to sessionStorage", () => {
    saveProjectContext(sampleContext);

    const storedRaw = sessionStorage.getItem("roomify_project_context_proj-1");
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!);

    expect(stored.previewUrl).toBeUndefined();
    expect(stored.projectId).toBe("proj-1");
    expect(stored.image.width).toBe(1920);
  });
});
