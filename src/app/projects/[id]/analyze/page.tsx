"use client";

import React, { use, useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { loadProjectContext, saveProjectContext } from "@/features/room/projectContext";
import { AnalysisPanel } from "@/features/room/AnalysisPanel";
import { getActiveRoomImage } from "@/services/api";
import { isRenderReadyImage, ProjectContext } from "@/types/room";

interface PageProps {
  params: Promise<{ id: string }>;
}

function AnalyzeContent({ params }: PageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const loadedContext = loadProjectContext(projectId);

    if (
      loadedContext &&
      isRenderReadyImage(loadedContext.image, loadedContext.previewUrl)
    ) {
      setContext(loadedContext);
      setIsLoaded(true);
      return;
    }

    // After a refresh the in-memory upload preview is gone: restore the
    // active room image from the backend instead.
    const controller = new AbortController();

    getActiveRoomImage(projectId, controller.signal)
      .then((image) => {
        const restored: ProjectContext = { projectId, image };
        saveProjectContext(restored);
        setContext(restored);
      })
      .catch(() => {
        if (!controller.signal.aborted) setContext(loadedContext);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoaded(true);
      });

    return () => controller.abort();
  }, [projectId]);
  const handleContinue = () => {
    router.push(`/rooms/${encodeURIComponent(projectId)}`);
  };

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
        onContinue={handleContinue}
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
