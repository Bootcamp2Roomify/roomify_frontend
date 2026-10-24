import { DesignWorkspace } from "@/features/design/DesignWorkspace";

export const metadata = { title: "Redesign - Roomify" };

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignWorkspace projectId={id} />;
}
