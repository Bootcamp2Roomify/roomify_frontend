import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "../src/features/projects/Dashboard";
import { ProjectDetailsForm } from "../src/features/projects/ProjectDetailsForm";
import { nextStep, prefersRentalFriendly } from "../src/services/projects";
import { createProject } from "../src/services/api";

afterEach(() => { vi.unstubAllGlobals(); });

const project = (id: string, name: string, status: string, hasImage = false) => ({
  id, name, status, hasImage, hasDesign: status === "DESIGN_READY", roomType: "BEDROOM", rentalStatus: "RENTAL",
  createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-21T10:00:00Z",
});
const page = (projects: unknown[], pageNo = 1, hasNext = false) => Response.json({ projects, page: pageNo, pageSize: 12, hasNext });

describe("Dashboard (MVP Feature 11)", () => {
  it("lists saved rooms with thumbnails and a resume link per status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([
      project("a0000000-0000-4000-8000-000000000001", "Dorm room", "DESIGN_READY", true),
      project("a0000000-0000-4000-8000-000000000002", "Study", "CREATED"),
    ])));
    render(<Dashboard />);
    expect(await screen.findByRole("heading", { name: "Dorm room" })).toBeInTheDocument();
    expect(screen.getByAltText("Photo of Dorm room")).toHaveAttribute("src", "/api/projects/a0000000-0000-4000-8000-000000000001/image/content");
    expect(screen.getByRole("link", { name: /Open redesign/ })).toHaveAttribute("href", "/projects/a0000000-0000-4000-8000-000000000001/design");
    expect(screen.getByRole("link", { name: /Add a photo/ })).toHaveAttribute("href", "/projects/a0000000-0000-4000-8000-000000000002/upload");
  });

  it("shows an empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([])));
    render(<Dashboard />);
    expect(await screen.findByText("No rooms yet")).toBeInTheDocument();
  });

  it("recovers from a failed load and pages further", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "Room service unavailable. Try again." }, { status: 502 }))
      .mockResolvedValueOnce(page([project("a0000000-0000-4000-8000-000000000003", "Living", "ANALYZED")], 1, true))
      .mockResolvedValueOnce(page([project("a0000000-0000-4000-8000-000000000004", "Older", "ANALYZED")], 2, false));
    vi.stubGlobal("fetch", fetchSpy);
    render(<Dashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Room service unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Living" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("heading", { name: "Older" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Living" })).toBeInTheDocument();
    expect(String(fetchSpy.mock.calls[2][0])).toContain("page=2");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("maps every project status to a next step", () => {
    const id = "a0000000-0000-4000-8000-000000000005";
    expect(nextStep({ id, status: "IMAGE_UPLOADED" }).href).toBe(`/projects/${id}/analyze`);
    expect(nextStep({ id, status: "ANALYSIS_FAILED" }).href).toBe(`/projects/${id}/analyze`);
    expect(nextStep({ id, status: "PREFERENCES_READY" }).href).toBe(`/projects/${id}/design`);
    expect(prefersRentalFriendly("DORMITORY")).toBe(true);
    expect(prefersRentalFriendly("OWNED")).toBe(false);
  });
});

describe("Create project (MVP Feature 2)", () => {
  it("requires a name and submits trimmed details", () => {
    const onSubmit = vi.fn();
    render(<ProjectDetailsForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue to photo upload/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give your room a name.");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "  My dorm  " } });
    fireEvent.change(screen.getByLabelText("Room type"), { target: { value: "DORM_ROOM" } });
    fireEvent.click(screen.getByLabelText("Dormitory"));
    fireEvent.click(screen.getByRole("button", { name: /Continue to photo upload/ }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "My dorm", roomType: "DORM_ROOM", rentalStatus: "DORMITORY" });
  });

  it("sends the details as the create body", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ id: "a0000000-0000-4000-8000-000000000006", status: "CREATED" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchSpy);
    await createProject({ name: " Den ", roomType: "STUDY", rentalStatus: "OWNED" });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ name: "Den", roomType: "STUDY", rentalStatus: "OWNED" });
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });
});
