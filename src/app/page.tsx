import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center text-center space-y-4">
        <Link href="socket/1">
          <Button>Room 1</Button>
        </Link>
        <Button>Hello</Button>
      </div>
    </div>
  );
}
