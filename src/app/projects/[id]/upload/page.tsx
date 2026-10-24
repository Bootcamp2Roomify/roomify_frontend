import { RoomUpload } from "@/components/room/RoomUpload";
import { RoomStudio } from "@/components/studio/RoomStudio";

export const metadata = { title: "Add a photo - Roomify" };

export default async function ProjectUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoomStudio>
      <RoomUpload existingProjectId={id} />
    </RoomStudio>
  );
}
