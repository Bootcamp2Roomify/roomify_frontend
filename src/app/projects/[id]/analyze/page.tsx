"use client";

import React, { use, useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { loadProjectContext } from "@/features/room/projectContext";
import { AnalysisPanel } from "@/features/room/AnalysisPanel";
import { RoomStudio } from "@/components/studio/RoomStudio";
import { ProjectContext } from "@/types/room";

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
    setContext(loadedContext);
    setIsLoaded(true);
  }, [projectId]);
  const handleContinue = () => {
    router.push(`/rooms/${encodeURIComponent(projectId)}`);
  };

  if (!isLoaded) {
    return (
      <RoomStudio step={1}>
        <div
          role="status"
          aria-live="polite"
          className="text-sm text-gray-500"
        >
          Loading project...
        </div>
      </RoomStudio>
    );
  }

  return (
    <RoomStudio step={1}>
      <AnalysisPanel
        projectId={projectId}
        projectContext={context}
        onContinue={handleContinue}
      />
    </RoomStudio>
  );
}

export default function AnalyzePage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <RoomStudio step={1}>
          <div
            role="status"
            aria-live="polite"
            className="text-sm text-gray-500"
          >
            Loading project...
          </div>
        </RoomStudio>
      }
    >
      <AnalyzeContent params={params} />
    </Suspense>
  );
}
