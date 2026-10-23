export const STYLES = ["SCANDINAVIAN", "COZY_MINIMALIST", "MINIMALIST", "MODERN", "INDUSTRIAL", "NO_PREFERENCE"] as const;
export const PURPOSES = ["STUDY_AND_SLEEP", "STUDY", "SLEEP", "LIVING", "MULTIPURPOSE"] as const;
export type Preferences = {
  style: string; budgetAmount: number; currency: "TWD" | "USD";
  preferredColors: string[]; roomPurpose: string; rentalFriendly: boolean;
  specialRequirements: string;
};
export type SavedPreferences = Preferences & { projectId: string; maxBudgetAmount: number };
export type PreferenceErrors = Partial<Record<keyof Preferences, string>>;
export type PreferenceDraft = Omit<Preferences, "budgetAmount" | "preferredColors"> & {
  budgetAmount: string; preferredColors: string;
};
export const emptyDraft: PreferenceDraft = {
  style: "", budgetAmount: "", currency: "TWD", preferredColors: "",
  roomPurpose: "MULTIPURPOSE", rentalFriendly: false, specialRequirements: "",
};
export const label = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, c => c.toUpperCase());

// Shared form schema; the backend independently enforces the same field rules.
export const preferenceSchema = {
  safeParse(draft: PreferenceDraft, maxBudget: number):
    { success: true; data: Preferences } | { success: false; errors: PreferenceErrors } {
    const errors: PreferenceErrors = {};
    if (!STYLES.includes(draft.style as typeof STYLES[number])) errors.style = "Choose a style.";
    const amount = Number(draft.budgetAmount);
    if (!/^\d+(\.\d{1,2})?$/.test(draft.budgetAmount.trim()) || !Number.isFinite(amount) || amount <= 0) {
      errors.budgetAmount = "Enter a positive budget with at most two decimal places.";
    } else if (amount > maxBudget) errors.budgetAmount = `Budget must be at most ${maxBudget.toLocaleString()}.`;
    if (!["TWD", "USD"].includes(draft.currency)) errors.currency = "Choose TWD or USD.";
    const colors = [...new Set(draft.preferredColors.split(",").map(c => c.trim()).filter(Boolean))];
    if (colors.length > 8 || colors.some(c => c.length > 32)) errors.preferredColors = "Use up to 8 colors, each at most 32 characters.";
    if (!PURPOSES.includes(draft.roomPurpose as typeof PURPOSES[number])) errors.roomPurpose = "Choose a room purpose.";
    if (draft.specialRequirements.length > 1000) errors.specialRequirements = "Use at most 1,000 characters.";
    if (Object.keys(errors).length) return { success: false, errors };
    return { success: true, data: { ...draft, budgetAmount: amount, preferredColors: colors, specialRequirements: draft.specialRequirements.trim() } };
  },
};
export function toDraft(saved: Preferences): PreferenceDraft {
  return { ...saved, budgetAmount: String(saved.budgetAmount), preferredColors: saved.preferredColors.join(", ") };
}
