import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignWorkspace } from "../src/features/design/DesignWorkspace";
import PreferenceForm from "../src/features/preferences/PreferenceForm";

const projectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const base = `/api/projects/${projectId}`;
afterEach(() => { vi.unstubAllGlobals(); });

const preferences = (budgetAmount = 300, rentalFriendly = true) => ({ projectId, style: "SCANDINAVIAN", budgetAmount, currency: "USD",
  preferredColors: ["sage"], roomPurpose: "STUDY", rentalFriendly, specialRequirements: "", maxBudgetAmount: 1000000 });
const plan = {
  planVersion: "1", summary: "A calm study bedroom", designStyle: "SCANDINAVIAN",
  actions: [
    { objectId: "a1", objectClass: "bed", decision: "KEEP", type: "KEEP", instruction: "Keep the bed by the wall", rationale: "Good condition" },
    { objectId: "a2", objectClass: "chair", decision: "REPLACE", type: "REPLACE", instruction: "Replace the chair with an ergonomic one", rationale: "Back support" },
    { objectId: null, objectClass: "shelf", decision: null, type: "ADD", instruction: "Add a freestanding shelf", rationale: "Storage" },
  ],
  layoutNotes: ["Verify measurements before buying"],
  budgetAllocation: [{ category: "storage", item: "Freestanding shelf", purpose: "More storage", estimatedCost: 120 },
    { category: "seating", item: "Ergonomic chair", purpose: "Back support", estimatedCost: 80 }],
  estimatedTotalCost: 200, currency: "USD", warnings: [], itemsNeeded: [],
  rentalFriendlyWarnings: ["Use Command hooks"], constraints: ["No drilling"],
};
const design = (overrides: object = {}) => ({ designId: 7, projectId, status: "SUCCEEDED", errorCode: null, plan, modelName: "m",
  createdAt: "2026-10-24T00:00:00Z", completedAt: "2026-10-24T00:00:10Z", image: null, ...overrides });
const set = (overrides: object = {}) => ({ setId: "s1", designResultId: 7, currency: "USD", budget: 300, estimatedTotal: 150, remainingBudget: 150, createdAt: "x",
  items: [
    { itemId: "i1", name: "Desk lamp", category: "lighting", reason: "Task light", placement: "Left of the desk", estimatedPrice: 50,
      cheaperAlternative: { name: "Clip lamp", reason: "Simpler", searchQuery: "clip lamp", estimatedPrice: 20 }, searchQuery: "adjustable desk lamp", diyEligible: true },
    { itemId: "i2", name: "Rug", category: "decor", reason: "Warmth", placement: null, estimatedPrice: 100, cheaperAlternative: null, searchQuery: "wool rug", diyEligible: false },
  ], ...overrides });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const empty = (status: number) => new Response(null, { status });

function routes(table: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = table[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const project = { id: projectId, name: "Dorm", roomType: "DORM_ROOM", rentalStatus: "DORMITORY", status: "PREFERENCES_READY" };

describe("Design workspace (MVP Features 6-10)", () => {
  it("asks for preferences before generating", async () => {
    routes({ [`GET ${base}`]: () => json(project), [`GET ${base}/preferences`]: () => empty(204),
      [`GET ${base}/designs/latest`]: () => empty(204), [`GET ${base}/recommendations`]: () => json({ code: "RECOMMENDATION_NOT_FOUND" }, 404) });
    render(<DesignWorkspace projectId={projectId} />);
    expect(await screen.findByText("Choose a style and budget first")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set preferences" })).toHaveAttribute("href", `/rooms/${projectId}`);
  });

  it("generates and explains the plan, budget and rental notes", async () => {
    routes({ [`GET ${base}`]: () => json(project), [`GET ${base}/preferences`]: () => json(preferences()),
      [`GET ${base}/designs/latest`]: () => empty(204), [`GET ${base}/recommendations`]: () => json({}, 404),
      [`POST ${base}/designs`]: () => json(design(), 201) });
    render(<DesignWorkspace projectId={projectId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate redesign" }));
    expect(await screen.findByText("A calm study bedroom")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /Keeping/ })).getByText("Keep the bed by the wall")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Replacing" })).getByText(/ergonomic one/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Adding" })).getByText("Add a freestanding shelf")).toBeInTheDocument();
    const budget = screen.getByRole("region", { name: "Estimated budget" });
    expect(within(budget).getByText("$200.00")).toBeInTheDocument();
    expect(within(budget).getByText("Left in your budget")).toBeInTheDocument();
    const rental = screen.getByRole("region", { name: "Rental-friendly notes" });
    expect(within(rental).getByText("No drilling")).toBeInTheDocument();
    expect(within(rental).getByText(/check yours before drilling/)).toBeInTheDocument();
    expect(screen.getByText(/not a professional architectural or construction plan/)).toBeInTheDocument();
  });

  it("explains provider failures and offers a retry", async () => {
    let latest = 0;
    routes({ [`GET ${base}`]: () => json(project), [`GET ${base}/preferences`]: () => json(preferences()),
      [`GET ${base}/designs/latest`]: () => latest++ === 0 ? empty(204) : json(design({ status: "FAILED", plan: null, errorCode: "AI_PROVIDER_UNAVAILABLE" })),
      [`GET ${base}/recommendations`]: () => json({}, 404),
      [`POST ${base}/designs`]: () => json({ code: "AI_PROVIDER_UNAVAILABLE", message: "x", designId: 7 }, 503) });
    render(<DesignWorkspace projectId={projectId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate redesign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is busy");
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("restores a saved plan, renders the visual concept next to the original photo", async () => {
    routes({ [`GET ${base}`]: () => json(project), [`GET ${base}/preferences`]: () => json(preferences()),
      [`GET ${base}/designs/latest`]: () => json(design()), [`GET ${base}/recommendations`]: () => json({}, 404),
      [`POST ${base}/designs/7/prototype`]: () => json({ status: "SUCCEEDED", errorCode: null, contentType: "image/png", sizeBytes: 1, width: 1024, height: 1024, imageUrl: "x" }, 201) });
    render(<DesignWorkspace projectId={projectId} />);
    fireEvent.click(await screen.findByRole("button", { name: "See it in my room" }));
    expect(await screen.findByAltText("AI-generated redesign concept of your room")).toHaveAttribute("src", `${base}/designs/7/image/content`);
    expect(screen.getByAltText("Your room today")).toHaveAttribute("src", `${base}/image/content`);
    expect(screen.getByText(/kept furniture may not look exactly like yours/)).toBeInTheDocument();
  });

  it("shows suggestions, warns when they exceed the current budget, and loads a DIY guide", async () => {
    const guide = { guideId: "g1", itemId: "i1", currency: "USD", materials: ["fabric"], tools: ["scissors"], estimatedCost: 15,
      difficulty: "Beginner", estimatedTime: "1 hour", steps: ["Cut the fabric", "Wrap the shade"], safetyNotes: ["Unplug the lamp first"] };
    routes({ [`GET ${base}`]: () => json(project), [`GET ${base}/preferences`]: () => json(preferences(120)),
      [`GET ${base}/designs/latest`]: () => json(design()), [`GET ${base}/recommendations`]: () => json(set()),
      [`GET ${base}/recommendations/i1/diy`]: () => json({ code: "RECOMMENDATION_NOT_FOUND" }, 404),
      [`POST ${base}/recommendations/i1/diy`]: () => json(guide, 201) });
    render(<DesignWorkspace projectId={projectId} />);
    const lamp = (await screen.findByRole("heading", { name: "Desk lamp" })).closest("li")!;
    expect(within(lamp).getByText("Left of the desk")).toBeInTheDocument();
    expect(within(lamp).getByText(/Clip lamp/)).toBeInTheDocument();
    expect(within(lamp).getByRole("link", { name: /adjustable desk lamp/ })).toHaveAttribute("href", "https://www.google.com/search?tbm=shop&q=adjustable%20desk%20lamp");
    const summary = screen.getByRole("region", { name: "Budget summary" });
    expect(within(summary).getByRole("alert")).toHaveTextContent("exceed your budget");
    expect(within(summary).getByRole("alert")).toHaveTextContent("brings you back within budget");
    expect(within(summary).getByText(/estimates, not live store prices/)).toBeInTheDocument();
    fireEvent.click(within(lamp).getByRole("button", { name: "DIY instead" }));
    expect(await within(lamp).findByText("Wrap the shade")).toBeInTheDocument();
    expect(within(lamp).getByText("Unplug the lamp first")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rug" })!.closest("li")!.querySelector("button")).toBeNull();
  });

  it("does not present suggestions from an earlier plan as current", async () => {
    routes({ [`GET ${base}`]: () => json(project), [`GET ${base}/preferences`]: () => json(preferences()),
      [`GET ${base}/designs/latest`]: () => json(design({ designId: 8 })), [`GET ${base}/recommendations`]: () => json(set({ designResultId: 7 })) });
    render(<DesignWorkspace projectId={projectId} />);
    expect(await screen.findByText("Your previous suggestions were for an earlier plan.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Desk lamp" })).not.toBeInTheDocument();
  });
});

describe("Preferences hand-off", () => {
  it("starts rental-friendly when asked and links to the redesign after saving", async () => {
    routes({ [`GET ${base}/preferences`]: () => empty(204), [`GET ${base}/preferences/limits`]: () => json({ maxBudgetAmount: 10000 }),
      [`PUT ${base}/preferences`]: () => json(preferences(200, true)) });
    render(<PreferenceForm projectId={projectId} defaultRentalFriendly continueHref={`/projects/${projectId}/design`} />);
    expect(await screen.findByLabelText("Rental-friendly changes only")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Style (required)"), { target: { value: "SCANDINAVIAN" } });
    fireEvent.change(screen.getByLabelText("Budget (required)"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByRole("link", { name: /Continue to my redesign/ })).toHaveAttribute("href", `/projects/${projectId}/design`);
  });
});
