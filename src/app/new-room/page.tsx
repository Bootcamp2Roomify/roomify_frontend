import { RoomUpload } from "../../components/room/RoomUpload";
import { RoomStudio } from "../../components/studio/RoomStudio";

export const metadata = {
  title: "New Room - Roomify",
  description: "Upload your room photo to detect items and design your space.",
};

export default function NewRoomPage() {
  return (
    <RoomStudio>
      <RoomUpload />
    </RoomStudio>
  );
}
