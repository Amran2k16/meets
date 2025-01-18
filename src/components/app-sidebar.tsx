"use client";

import { useState } from "react";
import { Link } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import SendMessage from "./send-message";

// This is sample data.
const messages = [
  {
    id: 1,
    avatar: "https://github.com/shadcn.png",
    alt: "User 1",
    message: "Hey, how are you?",
    time: "10:00 AM",
    bgColor: "bg-gray-200",
  },
  {
    id: 2,
    avatar: "https://github.com/shadcn.png",
    alt: "User 2",
    message: "I'm good, thanks! How about you?",
    time: "10:02 AM",
    bgColor: "bg-blue-200",
  },
  {
    id: 3,
    avatar: "https://github.com/shadcn.png",
    alt: "User 1",
    message: "Doing well, just working on a project.",
    time: "10:05 AM",
    bgColor: "bg-gray-200",
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [copied, setCopied] = useState(false);

  const handleShareLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Sidebar variant="floating" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={handleShareLink}>
              {copied ? "Link copied!" : "Share link"} <Link />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-col gap-4 p-4">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <Avatar>
                  <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                  />
                  <AvatarFallback>CN</AvatarFallback>
                </Avatar>
              </div>
              <div>
                <div className={`${msg.bgColor} p-2 rounded-lg`}>
                  <p className="text-sm">{msg.message}</p>
                </div>
                <span className="text-xs text-gray-500">{msg.time}</span>
              </div>
            </div>
          ))}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SendMessage />
      </SidebarFooter>
    </Sidebar>
  );
}
