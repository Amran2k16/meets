import RoomList from "@/components/room-list";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="h-screen flex items-center justify-center">
      <RoomList />
      <div className="flex flex-col items-center text-center space-y-4">
        <Link href="socket/1">
          <Button>Room 1</Button>
        </Link>
        <Button>Hello</Button>
      </div>
    </div>
  );
}
