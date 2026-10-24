import React from "react";
import { ActionType, DesignPlan } from "../../types/design";
import { formatMoney } from "../../services/design";

const ACTION_GROUPS: { types: ActionType[]; title: string; tone: string }[] = [
  { types: ["KEEP", "KEEP_AND_REPOSITION"], title: "Keeping (redesign more, buy less)", tone: "border-emerald-200 bg-emerald-50" },
  { types: ["REPLACE"], title: "Replacing", tone: "border-blue-200 bg-blue-50" },
  { types: ["ADD"], title: "Adding", tone: "border-violet-200 bg-violet-50" },
  { types: ["REMOVE"], title: "Removing", tone: "border-gray-200 bg-gray-50" },
  { types: ["UNSURE"], title: "Still to decide", tone: "border-amber-200 bg-amber-50" },
];

function humanize(value: string): string {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** MVP Features 6, 8 and 10: the redesign plan, rental notes and its budget allocation. */
export function PlanView({ plan, budget, rentalFriendly }: { plan: DesignPlan; budget: number | null; rentalFriendly: boolean }) {
  const overBudget = budget !== null && plan.estimatedTotalCost > budget;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">{humanize(plan.designStyle)} concept</p>
        <p className="mt-2 text-lg text-gray-900">{plan.summary}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ACTION_GROUPS.map(group => {
          const actions = plan.actions.filter(action => group.types.includes(action.type));
          if (actions.length === 0) return null;
          return (
            <section key={group.title} className={`rounded-xl border p-4 ${group.tone}`} aria-label={group.title}>
              <h3 className="font-semibold text-gray-900">{group.title}</h3>
              <ul className="mt-2 space-y-3">
                {actions.map((action, index) => (
                  <li key={`${action.objectId ?? "add"}-${index}`}>
                    <p className="text-sm font-medium text-gray-900">
                      {humanize(action.objectClass)}{action.type === "KEEP_AND_REPOSITION" ? " · move it" : ""}
                    </p>
                    <p className="text-sm text-gray-700">{action.instruction}</p>
                    <p className="text-xs text-gray-500">{action.rationale}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {plan.layoutNotes.length > 0 && (
        <section aria-label="Layout notes">
          <h3 className="font-semibold text-gray-900">Layout notes</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">{plan.layoutNotes.map(note => <li key={note}>{note}</li>)}</ul>
        </section>
      )}

      <section aria-label="Estimated budget" className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[480px] text-left text-sm">
          <caption className="px-4 pt-4 text-left font-semibold text-gray-900">Where the money goes (estimates)</caption>
          <thead className="text-gray-500"><tr><th className="px-4 py-2 font-medium">Item</th><th className="px-4 py-2 font-medium">Why</th><th className="px-4 py-2 text-right font-medium">Estimate</th></tr></thead>
          <tbody>
            {plan.budgetAllocation.map((line, index) => (
              <tr key={`${line.item}-${index}`} className="border-t border-gray-100">
                <td className="px-4 py-2"><span className="font-medium text-gray-900">{line.item}</span><span className="block text-xs text-gray-500">{humanize(line.category)}</span></td>
                <td className="px-4 py-2 text-gray-700">{line.purpose}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(line.estimatedCost, plan.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 font-semibold">
            <tr><td className="px-4 py-2" colSpan={2}>Estimated total</td><td className="px-4 py-2 text-right tabular-nums">{formatMoney(plan.estimatedTotalCost, plan.currency)}</td></tr>
            {budget !== null && (
              <tr className={overBudget ? "text-red-700" : "text-emerald-700"}>
                <td className="px-4 pb-3" colSpan={2}>{overBudget ? "Over your current budget by" : "Left in your budget"}</td>
                <td className="px-4 pb-3 text-right tabular-nums">{formatMoney(Math.abs(budget - plan.estimatedTotalCost), plan.currency)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </section>
      {overBudget && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          This plan was made for a higher budget than the one you have saved now. Generate it again to fit your current budget.
        </p>
      )}

      {(rentalFriendly || plan.rentalFriendlyWarnings.length > 0 || plan.constraints.length > 0) && (
        <section aria-label="Rental-friendly notes" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900">Rental-friendly notes</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {[...plan.constraints, ...plan.rentalFriendlyWarnings].map(note => <li key={note}>{note}</li>)}
          </ul>
          {rentalFriendly && <p className="mt-2 text-sm text-amber-900">Rules differ between leases and dorms — check yours before drilling, painting or mounting anything.</p>}
        </section>
      )}

      {plan.warnings.length > 0 && (
        <section aria-label="Things to check">
          <h3 className="font-semibold text-gray-900">Things to check</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">{plan.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </section>
      )}

      <p className="text-xs text-gray-500">
        This is an AI-generated design concept, not a professional architectural or construction plan. It is based only on
        what is visible in one photo; it cannot give exact measurements or guarantee that furniture will fit. All costs are estimates.
      </p>
    </div>
  );
}
