"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getProjectSnapshot, ProjectSnapshot } from "../../services/projects";
import { getPreferences } from "../../services/preferences";
import { SavedPreferences } from "../preferences/schema";
import {
  friendlyError, generateDesign, generatePrototype, generateRecommendations, getLatestDesign, getRecommendations, prototypeImageUrl,
} from "../../services/design";
import { RecommendationSet, StoredDesign } from "../../types/design";
import { PlanView } from "./PlanView";
import { PrototypeView } from "./PrototypeView";
import { RecommendationsView } from "./RecommendationsView";

type Busy = "plan" | "prototype" | "recommendations" | null;

const sectionClass = "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm";
const primary = "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60";

function Working({ text }: { text: string }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-gray-700">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" aria-hidden="true" />{text}
    </p>
  );
}

/** One page for MVP Features 6-10; everything shown is persisted, so revisiting restores it (Feature 11). */
export function DesignWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [preferences, setPreferences] = useState<SavedPreferences | null>(null);
  const [design, setDesign] = useState<StoredDesign | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [errors, setErrors] = useState<Partial<Record<Exclude<Busy, null>, string>>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getProjectSnapshot(projectId, controller.signal),
      getPreferences(projectId, controller.signal),
      getLatestDesign(projectId, controller.signal),
      getRecommendations(projectId, controller.signal),
    ]).then(([snapshot, saved, latest, set]) => {
      setProject(snapshot); setPreferences(saved); setDesign(latest); setRecommendations(set);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(friendlyError(error, "Could not load this room. Please retry."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, attempt]);

  const run = useCallback(async (kind: Exclude<Busy, null>, action: () => Promise<void>, fallback: string) => {
    setBusy(kind);
    setErrors(current => ({ ...current, [kind]: undefined }));
    try {
      await action();
    } catch (error) {
      setErrors(current => ({ ...current, [kind]: friendlyError(error, fallback) }));
      // A failed plan attempt is persisted too; reload so the page shows the real latest state.
      if (kind === "plan") setDesign(await getLatestDesign(projectId).catch(() => null));
    } finally {
      setBusy(null);
    }
  }, [projectId]);

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-10"><Working text="Loading your room…" /></main>;
  if (loadError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          <p>{loadError}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={() => setAttempt(a => a + 1)}>Retry</button>
        </div>
      </main>
    );
  }

  const plan = design?.status === "SUCCEEDED" ? design.plan : null;
  const prototypeReady = design?.status === "SUCCEEDED" && design.image?.status === "SUCCEEDED";
  const currentSet = recommendations && design && recommendations.designResultId === design.designId ? recommendations : null;
  const staleSet = recommendations && !currentSet;
  const rentalFriendly = preferences?.rentalFriendly ?? false;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-blue-700 underline">← My rooms</Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">{project?.name ?? "Your room"}</h1>
          <p className="mt-1 text-sm text-gray-600">Saved automatically to your account.</p>
        </div>
        <nav className="flex gap-4 text-sm" aria-label="Edit inputs">
          <Link className="text-blue-700 underline" href={`/projects/${encodeURIComponent(projectId)}/analyze`}>Edit furniture</Link>
          <Link className="text-blue-700 underline" href={`/rooms/${encodeURIComponent(projectId)}`}>Edit style &amp; budget</Link>
        </nav>
      </header>

      {!preferences && (
        <section className={sectionClass}>
          <h2 className="text-xl font-semibold">Choose a style and budget first</h2>
          <p className="mt-2 text-gray-600">The redesign uses your style, colors, budget and rental situation.</p>
          <Link href={`/rooms/${encodeURIComponent(projectId)}`} className={`${primary} mt-4`}>Set preferences</Link>
        </section>
      )}

      {preferences && (
        <section className={sectionClass} aria-labelledby="plan-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plan-title" className="text-xl font-semibold">1. Redesign plan</h2>
            {plan && <button type="button" className={secondary} disabled={busy !== null}
              onClick={() => void run("plan", async () => { setDesign(await generateDesign(projectId)); }, "The redesign could not be generated. Please try again.")}>Regenerate plan</button>}
          </div>
          <div className="mt-4 space-y-4">
            {busy === "plan" && <Working text="Designing your room… this usually takes 15–40 seconds." />}
            {errors.plan && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errors.plan}</p>}
            {!plan && busy !== "plan" && (
              <div>
                <p className="text-gray-700">
                  We will combine your photo, the furniture you chose to keep, replace or remove, your {preferences.style.replace(/_/g, " ").toLowerCase()} style
                  and your budget{rentalFriendly ? " — using rental-friendly changes only" : ""}.
                </p>
                <button type="button" className={`${primary} mt-4`} disabled={busy !== null}
                  onClick={() => void run("plan", async () => { setDesign(await generateDesign(projectId)); }, "The redesign could not be generated. Please try again.")}>
                  {design?.status === "FAILED" ? "Try again" : "Generate redesign"}
                </button>
              </div>
            )}
            {plan && <PlanView plan={plan} budget={preferences.currency === plan.currency ? preferences.budgetAmount : null} rentalFriendly={rentalFriendly}
              demo={design?.source === "demo"} />}
          </div>
        </section>
      )}

      {plan && design && (
        <section className={sectionClass} aria-labelledby="prototype-title">
          <h2 id="prototype-title" className="text-xl font-semibold">2. Visual concept</h2>
          <div className="mt-4 space-y-4">
            {busy === "prototype" && <Working text="Rendering your redesigned room… this can take up to a minute." />}
            {errors.prototype && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errors.prototype}</p>}
            {prototypeReady
              ? <PrototypeView beforeUrl={`/api/projects/${encodeURIComponent(projectId)}/image/content`} afterUrl={prototypeImageUrl(projectId, design.designId)}
                demo={design.image?.source === "demo"} />
              : busy !== "prototype" && (
                <button type="button" className={primary} disabled={busy !== null}
                  onClick={() => void run("prototype", async () => {
                    const image = await generatePrototype(projectId, design.designId);
                    setDesign(current => current ? { ...current, image } : current);
                  }, "The visual concept could not be generated. Please try again.")}>See it in my room</button>
              )}
          </div>
        </section>
      )}

      {plan && design && (
        <section className={sectionClass} aria-labelledby="recommendations-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="recommendations-title" className="text-xl font-semibold">3. Shopping &amp; DIY suggestions</h2>
            {currentSet && <button type="button" className={secondary} disabled={busy !== null}
              onClick={() => void run("recommendations", async () => { setRecommendations(await generateRecommendations(projectId)); }, "Suggestions could not be generated. Please try again.")}>Refresh suggestions</button>}
          </div>
          <div className="mt-4 space-y-4">
            {busy === "recommendations" && <Working text="Finding affordable pieces and DIY options…" />}
            {errors.recommendations && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errors.recommendations}</p>}
            {currentSet
              ? <RecommendationsView projectId={projectId} set={currentSet} currentBudget={preferences?.budgetAmount ?? null}
                  currentCurrency={preferences?.currency ?? null} rentalFriendly={rentalFriendly} />
              : busy !== "recommendations" && (
                <div>
                  {staleSet && <p className="mb-3 text-sm text-gray-600">Your previous suggestions were for an earlier plan.</p>}
                  <button type="button" className={primary} disabled={busy !== null}
                    onClick={() => void run("recommendations", async () => { setRecommendations(await generateRecommendations(projectId)); }, "Suggestions could not be generated. Please try again.")}>
                    Get suggestions within my budget
                  </button>
                </div>
              )}
          </div>
        </section>
      )}
    </main>
  );
}
