import { RoomUpload } from "../../components/room/RoomUpload";

export const metadata = {
  title: "New Room - Roomify",
  description: "Upload your room photo to detect items and design your space.",
};

export default function NewRoomPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <RoomUpload />
      </div>
    </main>
  );
}
