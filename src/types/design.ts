/** Mirrors the backend's versioned design contract (ROOM-88) and stored responses. */
export type ActionType = "KEEP" | "KEEP_AND_REPOSITION" | "REPLACE" | "REMOVE" | "UNSURE" | "ADD";

export interface DesignAction {
  objectId: string | null;
  objectClass: string;
  decision: "KEEP" | "REPLACE" | "REMOVE" | "UNSURE" | null;
  type: ActionType;
  instruction: string;
  rationale: string;
}

export interface BudgetAllocation {
  category: string;
  item: string;
  purpose: string;
  estimatedCost: number;
}

export interface DesignPlan {
  planVersion: string;
  summary: string;
  designStyle: string;
  actions: DesignAction[];
  layoutNotes: string[];
  budgetAllocation: BudgetAllocation[];
  estimatedTotalCost: number;
  currency: string;
  warnings: string[];
  itemsNeeded: { objectId: string | null; name: string; quantity: number }[];
  rentalFriendlyWarnings: string[];
  constraints: string[];
}

export interface GeneratedAsset {
  status: "UPLOADING" | "SUCCEEDED" | "FAILED";
  errorCode: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  imageUrl: string | null;
}

export interface StoredDesign {
  designId: number;
  projectId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  errorCode: string | null;
  plan: DesignPlan | null;
  modelName: string;
  createdAt: string;
  completedAt: string | null;
  image: GeneratedAsset | null;
}

export interface CheaperAlternative {
  name: string;
  reason: string;
  searchQuery: string;
  estimatedPrice: number;
}

export interface RecommendationItem {
  itemId: string;
  name: string;
  category: string;
  reason: string;
  placement: string | null;
  estimatedPrice: number;
  cheaperAlternative: CheaperAlternative | null;
  searchQuery: string;
  diyEligible: boolean;
}

export interface RecommendationSet {
  setId: string;
  designResultId: number;
  currency: string;
  budget: number;
  estimatedTotal: number;
  remainingBudget: number;
  items: RecommendationItem[];
  createdAt: string;
}

export interface DiyGuide {
  guideId: string;
  itemId: string;
  currency: string;
  materials: string[];
  tools: string[];
  estimatedCost: number;
  difficulty: string;
  estimatedTime: string;
  steps: string[];
  safetyNotes: string[];
}
