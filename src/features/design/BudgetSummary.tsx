import React from "react";
import { RecommendationSet } from "../../types/design";
import { formatMoney } from "../../services/design";

/**
 * MVP Feature 10. Saved suggestions always fit the budget they were generated for; the person may
 * have lowered it since, so the total is compared with the budget saved now.
 */
export function BudgetSummary({ set, currentBudget, currentCurrency }: { set: RecommendationSet; currentBudget: number | null; currentCurrency: string | null }) {
  const budget = currentBudget !== null && currentCurrency === set.currency ? currentBudget : set.budget;
  const cheapestTotal = set.items.reduce((sum, item) => sum + (item.cheaperAlternative?.estimatedPrice ?? item.estimatedPrice), 0);
  const savings = set.estimatedTotal - cheapestTotal;
  const over = set.estimatedTotal > budget;
  const currencyChanged = currentCurrency !== null && currentCurrency !== set.currency;
  return (
    <section aria-label="Budget summary" className={`rounded-xl border p-4 ${over ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
      <h3 className="font-semibold text-gray-900">Budget summary</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-gray-600">Your budget</dt><dd className="text-lg font-semibold tabular-nums">{formatMoney(budget, set.currency)}</dd></div>
        <div><dt className="text-gray-600">Suggested items</dt><dd className="text-lg font-semibold tabular-nums">{formatMoney(set.estimatedTotal, set.currency)}</dd></div>
        <div><dt className="text-gray-600">{over ? "Over budget by" : "Left over"}</dt><dd className={`text-lg font-semibold tabular-nums ${over ? "text-red-700" : "text-emerald-700"}`}>{formatMoney(Math.abs(budget - set.estimatedTotal), set.currency)}</dd></div>
        <div><dt className="text-gray-600">With all cheaper options</dt><dd className="text-lg font-semibold tabular-nums">{formatMoney(cheapestTotal, set.currency)}</dd></div>
      </dl>
      {over && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-800">
          These suggestions now exceed your budget.{" "}
          {savings > 0 ? `Choosing the cheaper options saves about ${formatMoney(savings, set.currency)}` : "Consider keeping more of your furniture"}
          {cheapestTotal <= budget && savings > 0 ? " and brings you back within budget." : "; you can also try the DIY options or regenerate suggestions."}
        </p>
      )}
      {currencyChanged && <p className="mt-3 text-sm text-gray-700">Your budget is now in {currentCurrency}; regenerate the suggestions to compare in that currency.</p>}
      <p className="mt-3 text-xs text-gray-600">All prices are estimates, not live store prices, and may vary by store, location, tax and delivery.</p>
    </section>
  );
}
