"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listProjects, nextStep, ROOM_TYPE_LABELS } from "../../services/projects";
import { logout } from "../../services/session";
import { ProjectSummary } from "../../types/room";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "No photo yet", IMAGE_UPLOADED: "Photo uploaded", ANALYSIS_FAILED: "Analysis failed",
  ANALYZED: "Furniture reviewed", PREFERENCES_READY: "Preferences saved", DESIGN_READY: "Redesign ready",
};

export function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects(target, signal);
      setProjects(current => target === 1 ? result.projects : [...current, ...result.projects]);
      setPage(result.page);
      setHasNext(result.hasNext);
    } catch (failure) {
      if (signal?.aborted) return;
      setError(failure instanceof Error ? failure.message : "Could not load your rooms. Please retry.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(1, controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-lg font-semibold tracking-tight text-gray-900">Roomify</Link>
          <h1 className="mt-4 text-3xl font-semibold text-gray-900">My rooms</h1>
          <p className="mt-1 text-gray-600">Every project is saved automatically. Open one to continue where you left off.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/new-room" className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-500">Create project</Link>
          <button type="button" onClick={() => void logout()} className="min-h-11 rounded-xl border border-gray-300 px-4 text-gray-700 hover:bg-gray-50">Log out</button>
        </div>
      </header>

      {error && (
        <div role="alert" className="mt-8 rounded-xl bg-red-50 p-4 text-red-800">
          <p>{error}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={() => void load(1)}>Retry</button>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <section className="mt-10 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900">No rooms yet</h2>
          <p className="mt-2 text-gray-600">Create a project and upload one photo of your room to get started.</p>
          <Link href="/new-room" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-500">Create your first room</Link>
        </section>
      )}

      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Your room projects">
        {projects.map(project => {
          const step = nextStep(project);
          return (
            <li key={project.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="aspect-[4/3] bg-gray-100">
                {project.hasImage
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image, not optimizable
                  ? <img src={`/api/projects/${encodeURIComponent(project.id)}/image/content`} alt={`Photo of ${project.name}`} className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-sm text-gray-500">No photo yet</div>}
              </div>
              <div className="space-y-2 p-5">
                <h2 className="text-lg font-semibold text-gray-900">{project.name}</h2>
                <p className="text-sm text-gray-600">{ROOM_TYPE_LABELS[project.roomType] ?? project.roomType} · {STATUS_LABELS[project.status] ?? project.status}</p>
                <p className="text-xs text-gray-500">Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
                <Link href={step.href} className="inline-flex min-h-10 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-700">{step.label} →</Link>
              </div>
            </li>
          );
        })}
      </ul>

      {loading && <p role="status" className="mt-8 text-gray-600">Loading your rooms…</p>}
      {hasNext && !loading && (
        <button type="button" onClick={() => void load(page + 1)} className="mt-8 rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50">Load more</button>
      )}
    </main>
  );
}
