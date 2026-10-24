"use client";

import React, { useState } from "react";
import { DiyGuide, RecommendationSet } from "../../types/design";
import { formatMoney, friendlyError, generateDiyGuide, getDiyGuide } from "../../services/design";
import { BudgetSummary } from "./BudgetSummary";

function DiyGuidePanel({ guide, rentalFriendly }: { guide: DiyGuide; rentalFriendly: boolean }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm" aria-label="DIY guide">
      <p className="font-semibold text-violet-900">DIY guide · {guide.difficulty} · {guide.estimatedTime} · about {formatMoney(guide.estimatedCost, guide.currency)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="font-medium">Materials</p><ul className="list-disc pl-5">{guide.materials.map(m => <li key={m}>{m}</li>)}</ul></div>
        <div><p className="font-medium">Tools</p><ul className="list-disc pl-5">{guide.tools.length ? guide.tools.map(t => <li key={t}>{t}</li>) : <li>None</li>}</ul></div>
      </div>
      <div><p className="font-medium">Steps</p><ol className="list-decimal space-y-1 pl-5">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></div>
      <div className="rounded-md bg-white/70 p-3">
        <p className="font-medium text-amber-900">Safety</p>
        <ul className="list-disc pl-5 text-amber-900">{guide.safetyNotes.map(note => <li key={note}>{note}</li>)}</ul>
        <p className="mt-2 text-xs text-gray-600">General guidance only, not professional advice. Follow product instructions and stop if a step feels unsafe.{rentalFriendly ? " Check your lease before changing anything attached to walls or floors." : ""}</p>
      </div>
    </div>
  );
}

/** MVP Features 7 and 9: suggestions with price, placement, reason, cheaper option and DIY guides. */
export function RecommendationsView({ projectId, set, currentBudget, currentCurrency, rentalFriendly }: {
  projectId: string; set: RecommendationSet; currentBudget: number | null; currentCurrency: string | null; rentalFriendly: boolean;
}) {
  const [guides, setGuides] = useState<Record<string, DiyGuide>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function openGuide(itemId: string) {
    if (guides[itemId] || busy) return;
    setBusy(itemId);
    setErrors(current => ({ ...current, [itemId]: "" }));
    try {
      const guide = (await getDiyGuide(projectId, itemId)) ?? (await generateDiyGuide(projectId, itemId));
      setGuides(current => ({ ...current, [itemId]: guide }));
    } catch (error) {
      setErrors(current => ({ ...current, [itemId]: friendlyError(error, "The DIY guide could not be generated. Please try again.") }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <BudgetSummary set={set} currentBudget={currentBudget} currentCurrency={currentCurrency} />
      <ul className="grid gap-4 md:grid-cols-2" aria-label="Suggested items">
        {set.items.map(item => (
          <li key={item.itemId} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">{item.category}</p>
                <h3 className="text-base font-semibold text-gray-900">{item.name}</h3>
              </div>
              <p className="whitespace-nowrap text-base font-semibold tabular-nums" aria-label={`Estimated price ${formatMoney(item.estimatedPrice, set.currency)}`}>
                ~{formatMoney(item.estimatedPrice, set.currency)}
              </p>
            </div>
            <p className="mt-2 text-sm text-gray-700">{item.reason}</p>
            {item.placement && <p className="mt-1 text-sm text-gray-700"><span className="font-medium">Where: </span>{item.placement}</p>}
            {item.cheaperAlternative && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <span className="font-medium">Cheaper option: </span>{item.cheaperAlternative.name} (~{formatMoney(item.cheaperAlternative.estimatedPrice, set.currency)}) — {item.cheaperAlternative.reason}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <a className="font-medium text-blue-700 underline" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.searchQuery)}`}>
                Search for “{item.searchQuery}”
              </a>
              {item.diyEligible && (
                <button type="button" onClick={() => void openGuide(item.itemId)} disabled={busy !== null || !!guides[item.itemId]}
                  className="rounded-lg border border-violet-300 px-3 py-1.5 font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-60">
                  {busy === item.itemId ? "Writing DIY guide…" : guides[item.itemId] ? "DIY guide below" : "DIY instead"}
                </button>
              )}
            </div>
            {errors[item.itemId] && <p role="alert" className="mt-2 text-sm text-red-700">{errors[item.itemId]}</p>}
            {guides[item.itemId] && <DiyGuidePanel guide={guides[item.itemId]} rentalFriendly={rentalFriendly} />}
          </li>
        ))}
      </ul>
      {rentalFriendly && <p className="text-sm text-amber-800">Rental-Friendly Mode is on: suggestions are freestanding or removable. Rental rules vary, so confirm with your lease or dorm policy.</p>}
    </div>
  );
}
