import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "../../src/app/globals.css";
import { DetectionReview } from "../../src/features/room/DetectionReview";
import { NormalizedDetection } from "../../src/types/room";

const standardDetection: NormalizedDetection = {
  id: "chair-1",
  label: "chair",
  confidence: 0.83,
  box: {
    x: 0.1,
    y: 0.2,
    width: 0.3,
    height: 0.4,
  },
  decision: "UNSURE",
};

const tallDetection: NormalizedDetection = {
  id: "lamp-1",
  label: "floor lamp",
  confidence: 0.94,
  box: {
    x: 0.25,
    y: 0.15,
    width: 0.5,
    height: 0.7,
  },
  decision: "UNSURE",
};

const invalidDetection: NormalizedDetection = {
  id: "invalid-1",
  label: "invalid object",
  confidence: 1.5, // Invalid confidence > 1
  box: {
    x: 0.8,
    y: 0.5,
    width: 0.4,
    height: 0.3, // Out of bounds
  },
  decision: "UNSURE",
};

const standardImageSvg =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%22800%22%20viewBox%3D%220%200%201200%20800%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%221200%22%20height%3D%22800%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20fill%3D%22%23475569%22%20font-size%3D%2232%22%3ERoom%201200x800%3C%2Ftext%3E%3C%2Fsvg%3E";

const tallImageSvg =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%221600%22%20viewBox%3D%220%200%20800%201600%22%3E%3Crect%20fill%3D%22%2394a3b8%22%20width%3D%22800%22%20height%3D%221600%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20fill%3D%22%231e293b%22%20font-size%3D%2232%22%3ETall%20800x1600%3C%2Ftext%3E%3C%2Fsvg%3E";

export const HarnessApp: React.FC = () => {
  const [scenario, setScenario] = useState<string>("standard");
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [continueCount, setContinueCount] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("scenario");
    if (s) {
      setScenario(s);
    }
  }, []);

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
  };

  const handleContinue = () => {
    setContinueCount((c) => c + 1);
  };

  let imageUrl = standardImageSvg;
  let imageWidth = 1200;
  let imageHeight = 800;
  let detections: NormalizedDetection[] = [standardDetection];
  let onContinue: (() => void) | undefined = handleContinue;

  if (scenario === "tall") {
    imageUrl = tallImageSvg;
    imageWidth = 800;
    imageHeight = 1600;
    detections = [tallDetection];
  } else if (scenario === "empty") {
    detections = [];
    onContinue = undefined; // Test truthful next-step unavailable text
  } else if (scenario === "invalid") {
    detections = [invalidDetection];
  } else if (scenario === "delayed") {
    imageUrl = "/fixtures/room-delayed.svg?delay=500";
    imageWidth = 1200;
    imageHeight = 800;
    detections = [standardDetection];
  } else if (scenario === "image-404") {
    imageUrl = "/fixtures/non-existent-404.jpg";
    imageWidth = 1200;
    imageHeight = 800;
    detections = [standardDetection];
  } else if (scenario === "aspect-mismatch") {
    // Declared 1200x800 (aspect 1.5), but actual image is naturally tall 800x1600 (aspect 0.5)
    imageUrl = "/fixtures/room-mismatch.svg";
    imageWidth = 1200;
    imageHeight = 800;
    detections = [standardDetection];
  }

  if (overrideUrl) {
    imageUrl = overrideUrl;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              ROOM-81 Detection Review Test Harness
            </h1>
            <p className="text-xs text-slate-500">
              Current Scenario: <span className="font-semibold">{scenario}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
            <div>
              Retries: <span data-testid="retry-count">{retryCount}</span>
            </div>
            <div>
              Continues: <span data-testid="continue-count">{continueCount}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-medium text-slate-500 mr-1">Scenarios:</span>
          <button
            type="button"
            data-testid="scenario-standard-btn"
            onClick={() => {
              setScenario("standard");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "standard" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            Standard
          </button>
          <button
            type="button"
            data-testid="scenario-tall-btn"
            onClick={() => {
              setScenario("tall");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "tall" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            Tall Image
          </button>
          <button
            type="button"
            data-testid="scenario-empty-btn"
            onClick={() => {
              setScenario("empty");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "empty" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            Empty
          </button>
          <button
            type="button"
            data-testid="scenario-invalid-btn"
            onClick={() => {
              setScenario("invalid");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "invalid" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            Invalid
          </button>
          <button
            type="button"
            data-testid="scenario-delayed-btn"
            onClick={() => {
              setScenario("delayed");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "delayed" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            Delayed
          </button>
          <button
            type="button"
            data-testid="scenario-404-btn"
            onClick={() => {
              setScenario("image-404");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "image-404" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            404 Error
          </button>
          <button
            type="button"
            data-testid="scenario-mismatch-btn"
            onClick={() => {
              setScenario("aspect-mismatch");
              setOverrideUrl(null);
            }}
            className={`px-3 py-1 text-xs rounded font-medium border ${
              scenario === "aspect-mismatch" && !overrideUrl
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
            }`}
          >
            Aspect Mismatch
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-medium text-slate-500 mr-1">Dynamic URL Switch:</span>
          <button
            type="button"
            data-testid="switch-delayed-url-btn"
            onClick={() => setOverrideUrl("/fixtures/room-delayed.svg?delay=600")}
            className="px-2.5 py-1 text-xs rounded font-medium bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
          >
            Switch to Delayed URL
          </button>
          <button
            type="button"
            data-testid="switch-404-url-btn"
            onClick={() => setOverrideUrl("/fixtures/non-existent-404.jpg")}
            className="px-2.5 py-1 text-xs rounded font-medium bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100"
          >
            Switch to 404 URL
          </button>
          <button
            type="button"
            data-testid="switch-valid-url-btn"
            onClick={() => setOverrideUrl("/fixtures/room-1200x800.svg?v=2")}
            className="px-2.5 py-1 text-xs rounded font-medium bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
          >
            Switch to Valid URL
          </button>
        </div>
      </header>

      <main className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
        <DetectionReview
          projectId="1"
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          detections={detections}
          onRetry={handleRetry}
          onContinue={onContinue}
        />
      </main>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<HarnessApp />);
}
