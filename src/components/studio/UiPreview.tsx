"use client";
import React, { useEffect, useRef, useState } from "react";
import { RoomUpload } from "../room/RoomUpload";
import { RoomStudio } from "./RoomStudio";
import { AnalysisPanel } from "../../features/room/AnalysisPanel";
import { AnalysisStatus, UseRoomAnalysisReturn } from "../../features/room/useRoomAnalysis";
import { ProjectContext, NormalizedDetection } from "../../types/room";
import { DetectionReview } from "../../features/room/DetectionReview";

const sampleContext: ProjectContext = { projectId: "local-room-preview", image: { projectId: "local-room-preview", imageId: "sample-room", imageUrl: "/room-inspiration.svg", width: 1200, height: 800 } };
const sampleObjects: NormalizedDetection[] = [
  { id: "sofa", label: "Sofa", confidence: .97, decision: "UNSURE", box: { x: .22, y: .53, width: .46, height: .3 } },
  { id: "table", label: "Coffee table", confidence: .94, decision: "UNSURE", box: { x: .46, y: .77, width: .2, height: .17 } },
  { id: "lamp", label: "Floor lamp", confidence: .91, decision: "UNSURE", box: { x: .735, y: .175, width: .1, height: .62 } },
  { id: "plant", label: "Plant", confidence: .89, decision: "UNSURE", box: { x: .84, y: .44, width: .13, height: .4 } },
];

export function UiPreview() {
  const [view, setView] = useState(0);
  const [status, setStatus] = useState<AnalysisStatus>("ready");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detectionState, setDetectionState] = useState("populated");
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [view]);
  const simulate = async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("analyzing");
    timer.current = setTimeout(() => setStatus("succeeded"), 1800);
  };
  const analysis: UseRoomAnalysisReturn = {
    status, isAnalyzing: status === "analyzing",
    error: status === "failed" ? "We could not analyze this image. Try again." : null,
    result: status === "succeeded" ? { projectId: sampleContext.projectId, imageId: sampleContext.image.imageId, detections: sampleObjects } : null,
    start: simulate, retry: simulate,
  };
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    setView(requested === "review" ? 2 : requested === "analysis" ? 1 : 0);
  }, []);
  return <RoomStudio step={view}>
    <div className="studio-preview-bar">
      <p>Local preview with sample analysis results. Selected photos stay in your browser; nothing is uploaded.</p>
      <div className="studio-preview-tabs" aria-label="Task previews">
        {["Upload · ROOM-79", "Analysis · ROOM-80", "Detections · ROOM-81"].map((label, index) =>
          <button key={label} type="button" aria-pressed={view === index} onClick={() => setView(index)}>{label}</button>)}
      </div>
      {view === 1 && <div className="studio-preview-states"><label htmlFor="analysis-preview-state">Analysis preview state</label><select id="analysis-preview-state" value={status} onChange={event => { if (timer.current) clearTimeout(timer.current); setStatus(event.target.value as AnalysisStatus); }}><option value="ready">Ready to analyze</option><option value="analyzing">Loading</option><option value="failed">Error and retry</option><option value="succeeded">Analysis complete</option></select></div>}
      {view === 2 && <div className="studio-preview-states"><label htmlFor="detection-preview-state">Detection preview state</label><select id="detection-preview-state" value={detectionState} onChange={event => setDetectionState(event.target.value)}><option value="populated">Detected furniture</option><option value="empty">No objects detected</option><option value="broken">Image unavailable</option></select></div>}
    </div>
    {view === 0 && <RoomUpload previewOnly />}
    {view === 1 && <AnalysisPanel previewOnly projectId={sampleContext.projectId} projectContext={sampleContext} analysis={analysis} />}
    {view === 2 && <DetectionReview projectId={sampleContext.projectId} previewOnly imageUrl={detectionState === "broken" ? "/missing-room.jpg" : "/room-inspiration.svg"} imageWidth={1200} imageHeight={800} detections={detectionState === "empty" ? [] : sampleObjects} onRetry={() => { setView(1); void simulate(); }} />}
  </RoomStudio>;
}
