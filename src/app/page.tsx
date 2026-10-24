import Link from "next/link";
import { RoomStudio } from "../components/studio/RoomStudio";

export default function HomePage() {
  return (
    <RoomStudio>
      <div className="studio-upload mx-auto w-full text-center">
        <p className="studio-eyebrow">Begin with your space</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          See your room in a new light.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-gray-600">
          Start with one photo of your room. We will identify the furniture in it
          so you can review what is already there and explore a fresh direction.
        </p>
        <Link
          href="/new-room"
          className="studio-primary mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Create room <span className="ml-3" aria-hidden="true">→</span>
        </Link>
      </div>
    </RoomStudio>
  );
}
