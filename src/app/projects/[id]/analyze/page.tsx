"use client";

import React, { use, useState, useEffect, Suspense } from "react";
import { loadProjectContext } from "@/features/room/projectContext";
import { AnalysisPanel } from "@/features/room/AnalysisPanel";
import { ProjectContext } from "@/types/room";

interface PageProps {
  params: Promise<{ id: string }>;
}

function AnalyzeContent({ params }: PageProps) {
  const { id: projectId } = use(params);

  const [context, setContext] = useState<ProjectContext | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const loadedContext = loadProjectContext(projectId);
    setContext(loadedContext);
    setIsLoaded(true);
  }, [projectId]);

  if (!isLoaded) {
    return (
      <main className="min-h-screen p-6 max-w-4xl mx-auto">
        <div
          role="status"
          aria-live="polite"
          className="text-sm text-gray-500"
        >
          Loading project...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <AnalysisPanel
        projectId={projectId}
        projectContext={context}
      />
    </main>
  );
}

export default function AnalyzePage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-6 max-w-4xl mx-auto">
          <div
            role="status"
            aria-live="polite"
            className="text-sm text-gray-500"
          >
            Loading project...
          </div>
        </main>
      }
    >
      <AnalyzeContent params={params} />
    </Suspense>
  );
}
