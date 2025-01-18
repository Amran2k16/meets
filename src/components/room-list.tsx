"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const rooms = [
  {
    id: 1,
    name: "Join Room 1",
    users: [
      { id: 1, color: "bg-red-500", fallback: "U1" },
      { id: 2, color: "bg-blue-500", fallback: "U2" },
    ],
  },
  {
    id: 2,
    name: "Join Room 2",
    users: [{ id: 3, color: "bg-green-500", fallback: "U3" }],
  },
  {
    id: 3,
    name: "Join Room 3",
    users: [],
  },
];

export default function RoomList() {
  const router = useRouter();

  const handleRoomClick = (roomId: number) => {
    router.push(`/room/${roomId}`);
  };

  return (
    <div className="w-full max-w-sm space-y-4 mx-auto p-4">
      {rooms.map((room) => (
        <div key={room.id} className="relative">
          <Button
            variant="outline"
            size="xl"
            className="w-full justify-between"
            onClick={() => handleRoomClick(room.id)}
          >
            {room.name}
            <div className="flex -space-x-2">
              {room.users.map((avatar) => (
                <Avatar
                  key={avatar.id}
                  className={`border-2 border-background w-8 h-8 ${avatar.color}`}
                >
                  <AvatarFallback>{avatar.fallback}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </Button>
        </div>
      ))}
    </div>
  );
}
