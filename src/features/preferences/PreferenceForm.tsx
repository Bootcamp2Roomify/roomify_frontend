"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError } from "../../services/api";
import { getPreferences, getPreferenceLimit, savePreferences } from "../../services/preferences";
import { emptyDraft, label, preferenceSchema, PreferenceDraft, PreferenceErrors, SavedPreferences, STYLES, PURPOSES, toDraft } from "./schema";

export default function PreferenceForm({ projectId }: { projectId: string }) {
  const [draft, setDraft] = useState<PreferenceDraft>({ ...emptyDraft });
  const [errors, setErrors] = useState<PreferenceErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxBudget, setMaxBudget] = useState(0);
  const [saved, setSaved] = useState<SavedPreferences | null>(null);
  const [attempt, setAttempt] = useState(0);
  const saveAbort = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    saveAbort.current?.abort();
    savingRef.current = false;
    setSaving(false); setLoading(true); setMessage(""); setSaved(null); setErrors({});
    setDraft({ ...emptyDraft }); setMaxBudget(0);
    Promise.all([getPreferences(projectId, controller.signal), getPreferenceLimit(projectId, controller.signal)])
      .then(([existing, limit]) => {
        if (controller.signal.aborted) return;
        setMaxBudget(limit);
        if (existing) setDraft(toDraft(existing));
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("Could not load preferences. Please retry."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); saveAbort.current?.abort(); };
  }, [projectId, attempt]);

  function change<K extends keyof PreferenceDraft>(field: K, value: PreferenceDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || loading || maxBudget <= 0) return;
    const parsed = preferenceSchema.safeParse(draft, maxBudget);
    if (!parsed.success) { setErrors(parsed.errors); return; }
    savingRef.current = true; setSaving(true); setMessage(""); setErrors({});
    const controller = new AbortController(); saveAbort.current = controller;
    try {
      const result = await savePreferences(projectId, parsed.data, controller.signal);
      if (!controller.signal.aborted) { setSaved(result); setDraft(toDraft(result)); }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.details && typeof error.details === "object" && "fieldErrors" in error.details) {
        setErrors((error.details as { fieldErrors: PreferenceErrors }).fieldErrors);
      }
      setMessage(error instanceof Error ? error.message : "Could not save preferences. Please retry.");
    } finally {
      if (!controller.signal.aborted) { savingRef.current = false; setSaving(false); }
    }
  }
  const fieldError = (field: keyof PreferenceErrors) => errors[field] ? <p id={`${field}-error`} className="mt-1 text-sm text-red-700" role="alert">{errors[field]}</p> : null;
  const inputClass = "mt-1 w-full rounded-md border border-gray-300 p-3 focus:outline-indigo-600";
  if (loading) return <p role="status">Loading preferences…</p>;
  if (maxBudget <= 0) return <div role="alert"><p>{message}</p><button className="mt-3 rounded border p-2" onClick={() => setAttempt(a => a + 1)}>Retry loading preferences</button></div>;
  if (saved) return <section aria-labelledby="review-title" className="space-y-4 rounded-lg border bg-white p-6">
    <h2 id="review-title" className="text-xl font-semibold" tabIndex={-1} ref={node => node?.focus()}>Review your preferences</h2>
    <p role="status">Preferences saved. Review them before generation.</p>
    <dl className="grid gap-3 sm:grid-cols-2">
      <div><dt className="font-semibold">Style</dt><dd>{label(saved.style)}</dd></div>
      <div><dt className="font-semibold">Budget</dt><dd>{saved.budgetAmount.toLocaleString()} {saved.currency}</dd></div>
      <div><dt className="font-semibold">Preferred colors</dt><dd>{saved.preferredColors.join(", ") || "No preference"}</dd></div>
      <div><dt className="font-semibold">Room purpose</dt><dd>{label(saved.roomPurpose)}</dd></div>
      <div><dt className="font-semibold">Rental-friendly</dt><dd>{saved.rentalFriendly ? "Yes" : "No"}</dd></div>
      <div><dt className="font-semibold">Special requirements</dt><dd className="whitespace-pre-wrap break-words">{saved.specialRequirements || "None"}</dd></div>
    </dl>
    <button className="rounded-md border px-4 py-2" onClick={() => setSaved(null)}>Edit preferences</button>
  </section>;
  return <form onSubmit={submit} noValidate className="space-y-5 rounded-lg border bg-white p-6">
    {message && <p role="alert" className="text-red-700">{message}</p>}
    <fieldset disabled={saving} className="space-y-5">
      <legend className="sr-only">Redesign preferences</legend>
      <div><label htmlFor="style" className="font-medium">Style (required)</label>
        <select id="style" className={inputClass} value={draft.style} onChange={e => change("style", e.target.value)} aria-invalid={!!errors.style} aria-describedby={errors.style ? "style-error" : undefined}>
          <option value="">Choose a style</option>{STYLES.map(style => <option key={style} value={style}>{label(style)}</option>)}
        </select>{fieldError("style")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="budgetAmount" className="font-medium">Budget (required)</label>
          <input id="budgetAmount" className={inputClass} inputMode="decimal" value={draft.budgetAmount} onChange={e => change("budgetAmount", e.target.value)} aria-invalid={!!errors.budgetAmount} aria-describedby={`budget-help${errors.budgetAmount ? " budgetAmount-error" : ""}`} />
          <p id="budget-help" className="text-sm text-gray-600">Greater than zero, up to {maxBudget.toLocaleString()} in your selected currency.</p>{fieldError("budgetAmount")}</div>
        <div><label htmlFor="currency" className="font-medium">Currency</label><select id="currency" className={inputClass} value={draft.currency} onChange={e => change("currency", e.target.value as "TWD" | "USD")}><option>TWD</option><option>USD</option></select>{fieldError("currency")}</div>
      </div>
      <div><label htmlFor="preferredColors" className="font-medium">Preferred colors</label><input id="preferredColors" className={inputClass} value={draft.preferredColors} onChange={e => change("preferredColors", e.target.value)} aria-invalid={!!errors.preferredColors} aria-describedby={`color-help${errors.preferredColors ? " preferredColors-error" : ""}`} /><p id="color-help" className="text-sm text-gray-600">Separate colors with commas, for example: sage green, cream.</p>{fieldError("preferredColors")}</div>
      <div><label htmlFor="roomPurpose" className="font-medium">Room purpose</label><select id="roomPurpose" className={inputClass} value={draft.roomPurpose} onChange={e => change("roomPurpose", e.target.value)}>{PURPOSES.map(purpose => <option key={purpose} value={purpose}>{label(purpose)}</option>)}</select>{fieldError("roomPurpose")}</div>
      <label className="flex items-center gap-3"><input type="checkbox" checked={draft.rentalFriendly} onChange={e => change("rentalFriendly", e.target.checked)} className="h-5 w-5" />Rental-friendly changes only</label>
      <div><label htmlFor="specialRequirements" className="font-medium">Special requirements</label><textarea id="specialRequirements" rows={4} className={inputClass} value={draft.specialRequirements} onChange={e => change("specialRequirements", e.target.value)} aria-invalid={!!errors.specialRequirements} aria-describedby={errors.specialRequirements ? "specialRequirements-error" : undefined} /><p className="text-sm text-gray-600">{draft.specialRequirements.length}/1,000 characters</p>{fieldError("specialRequirements")}</div>
    </fieldset>
    <button type="submit" disabled={saving} className="w-full rounded-md bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{saving ? "Saving…" : "Save and continue"}</button>
  </form>;
}
