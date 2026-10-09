import { afterEach, describe, expect, it, vi } from "vitest";
import { getPreferences, getPreferenceLimit, savePreferences } from "../src/services/preferences";
const projectId = "12345678-1234-1234-1234-123456789abc";
const saved = { projectId, style: "MODERN", budgetAmount: 100, currency: "USD" as const, preferredColors: [], roomPurpose: "STUDY", rentalFriendly: false, specialRequirements: "", maxBudgetAmount: 10000 };
afterEach(() => vi.unstubAllGlobals());
describe("preferences API", () => {
  it("accepts an empty unsaved response", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 }))); expect(await getPreferences(projectId)).toBeNull(); });
  it("rejects another project's response", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...saved, projectId: "different" }))); await expect(getPreferences(projectId)).rejects.toThrow("invalid preferences"); });
  it("sends PUT with structured data", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(saved)); vi.stubGlobal("fetch", fetch);
    await savePreferences(projectId, saved); expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/projects/${projectId}/preferences`), expect.objectContaining({ method: "PUT", body: JSON.stringify(saved) }));
  });
  it("retains server validation details", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Check budget", fieldErrors: { budgetAmount: "Too high" } }, { status: 400 }))); await expect(savePreferences(projectId, saved)).rejects.toMatchObject({ status: 400, details: { fieldErrors: { budgetAmount: "Too high" } } }); });
  it("loads the configured maximum", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ maxBudgetAmount: 10000 }))); expect(await getPreferenceLimit(projectId)).toBe(10000); });
  it("rejects invalid project IDs before making requests", async () => { const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); await expect(getPreferences("1")).rejects.toThrow("UUID"); expect(fetch).not.toHaveBeenCalled(); });
});
