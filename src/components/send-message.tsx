"use client";

import { useState } from "react";
import { Input } from "./ui/input";
import { SendHorizonal } from "lucide-react";
import { cn } from "@/lib/utils";

const SendMessage = () => {
  const [message, setMessage] = useState("");

  return (
    <div className="flex items-center gap-2">
      <Input
        type="text"
        placeholder="Send a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="flex-grow"
      />
      <button
        className={cn(
          "p-2 rounded-full",
          message ? "text-blue-500" : "text-gray-500"
        )}
        onClick={() => {
          if (message) {
            setMessage("");
          }
        }}
      >
        <SendHorizonal />
      </button>
    </div>
  );
};

export default SendMessage;
