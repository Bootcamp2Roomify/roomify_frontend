import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreferenceForm from "../src/features/preferences/PreferenceForm";
import { getPreferences, getPreferenceLimit, savePreferences } from "../src/services/preferences";
import { ApiError } from "../src/services/api";
import { emptyDraft, preferenceSchema } from "../src/features/preferences/schema";
vi.mock("../src/services/preferences", () => ({ getPreferences: vi.fn(), getPreferenceLimit: vi.fn(), savePreferences: vi.fn() }));
const projectId = "12345678-1234-1234-1234-123456789abc";
const saved = { projectId, style: "SCANDINAVIAN", budgetAmount: 9000, currency: "TWD" as const, preferredColors: ["sage"], roomPurpose: "STUDY_AND_SLEEP", rentalFriendly: true, specialRequirements: "Keep the bed", maxBudgetAmount: 10000 };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getPreferences).mockResolvedValue(null); vi.mocked(getPreferenceLimit).mockResolvedValue(10000); vi.mocked(savePreferences).mockResolvedValue(saved); });
async function mount() { render(<PreferenceForm projectId={projectId} />); await screen.findByLabelText("Style (required)"); }
function fill() {
  fireEvent.change(screen.getByLabelText("Style (required)"), { target: { value: "SCANDINAVIAN" } });
  fireEvent.change(screen.getByLabelText("Budget (required)"), { target: { value: "9000" } });
}
describe("preference form", () => {
  it("requires style and positive budget without sending a request", async () => {
    await mount(); fireEvent.click(screen.getByText("Save and continue"));
    expect(screen.getByText("Choose a style.")).toBeInTheDocument();
    expect(screen.getByText(/Enter a positive budget/)).toBeInTheDocument(); expect(savePreferences).not.toHaveBeenCalled();
  });
  it("rejects budgets over the server limit inline", async () => {
    await mount(); fill(); fireEvent.change(screen.getByLabelText("Budget (required)"), { target: { value: "10001" } });
    fireEvent.click(screen.getByText("Save and continue")); expect(screen.getByText("Budget must be at most 10,000.")).toBeInTheDocument(); expect(savePreferences).not.toHaveBeenCalled();
  });
  it("submits rental-friendly and colors then shows the saved review", async () => {
    await mount(); fill(); fireEvent.click(screen.getByLabelText("Rental-friendly changes only"));
    fireEvent.change(screen.getByLabelText("Preferred colors"), { target: { value: "sage, cream" } });
    fireEvent.click(screen.getByText("Save and continue")); await screen.findByText("Review your preferences");
    expect(savePreferences).toHaveBeenCalledWith(projectId, expect.objectContaining({ rentalFriendly: true, preferredColors: ["sage", "cream"], budgetAmount: 9000 }), expect.any(AbortSignal));
    expect(screen.getByText("9,000 TWD")).toBeInTheDocument(); fireEvent.click(screen.getByText("Edit preferences")); expect(screen.getByLabelText("Budget (required)")).toHaveValue("9000");
  });
  it("reloads saved fields from the server", async () => {
    vi.mocked(getPreferences).mockResolvedValue(saved); await mount();
    expect(screen.getByLabelText("Budget (required)")).toHaveValue("9000"); expect(screen.getByLabelText("Rental-friendly changes only")).toBeChecked(); expect(screen.getByLabelText("Special requirements")).toHaveValue("Keep the bed");
  });
  it("disables continue during a save and prevents duplicate requests", async () => {
    let resolve!: (value: typeof saved) => void; vi.mocked(savePreferences).mockReturnValue(new Promise(r => { resolve = r; }));
    await mount(); fill(); fireEvent.click(screen.getByText("Save and continue"));
    expect(screen.getByText("Saving…")).toBeDisabled(); expect(screen.getByLabelText("Budget (required)")).toBeDisabled(); expect(savePreferences).toHaveBeenCalledTimes(1);
    resolve(saved); await screen.findByText("Review your preferences");
  });
  it("preserves input and shows server field validation after failure", async () => {
    vi.mocked(savePreferences).mockRejectedValue(new ApiError("Budget rejected", 400, { fieldErrors: { budgetAmount: "Budget maximum changed." } }));
    await mount(); fill(); fireEvent.click(screen.getByText("Save and continue")); await screen.findByText("Budget maximum changed.");
    expect(screen.getByLabelText("Budget (required)")).toHaveValue("9000"); expect(screen.getByText("Save and continue")).toBeEnabled();
  });
  it("provides retry when loading fails", async () => {
    vi.mocked(getPreferenceLimit).mockRejectedValueOnce(new Error("offline")); render(<PreferenceForm projectId={projectId} />);
    fireEvent.click(await screen.findByText("Retry loading preferences")); await screen.findByLabelText("Style (required)");
    await waitFor(() => expect(getPreferenceLimit).toHaveBeenCalledTimes(2));
  });
});
describe("schema", () => {
  it.each(["-1", "0", "0.001", "NaN", "1e3", "10001"])("rejects invalid budget %s", budget => {
    expect(preferenceSchema.safeParse({ ...emptyDraft, style: "MODERN", budgetAmount: budget }, 10000).success).toBe(false);
  });
  it("rejects excessive colors and requirements", () => {
    const result = preferenceSchema.safeParse({ ...emptyDraft, style: "MODERN", budgetAmount: "10", preferredColors: Array.from({length: 9}, (_,i) => `color${i}`).join(","), specialRequirements: "x".repeat(1001) }, 10000);
    expect(result.success).toBe(false);
    if (!result.success) { expect(result.errors.preferredColors).toBeDefined(); expect(result.errors.specialRequirements).toBeDefined(); }
  });
});
