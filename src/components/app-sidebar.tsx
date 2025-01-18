import * as React from "react";
import { GalleryVerticalEnd } from "lucide-react";

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
  return (
    <Sidebar variant="floating" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Documentation</span>
                  <span className="">v1.0.0</span>
                </div>
              </a>
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
