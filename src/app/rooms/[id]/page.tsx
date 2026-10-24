import { RoomPreferences } from "../../../features/preferences/RoomPreferences";

export default async function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
    <header><h1 className="text-2xl font-bold">Redesign preferences</h1><p className="mt-2 text-gray-600">Choose a style and budget so your redesign fits your room and needs.</p></header>
    <RoomPreferences projectId={id} />
  </main>;
}
