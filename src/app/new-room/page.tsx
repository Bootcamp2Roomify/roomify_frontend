import { RoomStudio } from "../../components/studio/RoomStudio";
import { NewRoomFlow } from "../../features/projects/NewRoomFlow";

export const metadata = {
  title: "New Room - Roomify",
  description: "Create a room project and upload a photo to detect items and design your space.",
};

export default function NewRoomPage() {
  return (
    <RoomStudio>
      <NewRoomFlow />
    </RoomStudio>
  );
}
