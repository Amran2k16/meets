"use client";

import { useCurrentTime } from "@/hooks/use-current-time";
import {
  Mic2,
  Video,
  ScreenShare,
  PhoneOff,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useSidebar } from "./ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "./ui/breadcrumb";

export function CallControlsBar() {
  const currentTime = useCurrentTime();
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const [videoEnabled, setVideoEnabled] = useState<boolean>(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState<boolean>(false);
  const [chatEnabled, setChatEnabled] = useState<boolean>(false);
  const { toggleSidebar } = useSidebar();

  const toggleMic = () => {
    setMicEnabled((prev) => !prev);
  };

  const toggleVideo = () => {
    setVideoEnabled((prev) => !prev);
  };

  const toggleScreenShare = () => {
    setScreenShareEnabled((prev) => !prev);
  };

  const toggleChat = () => {
    toggleSidebar();
    setChatEnabled((prev) => !prev);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-t bg-background px-4">
      <div className="hidden md:flex text-sm text-muted-foreground items-center gap-2">
        <p>{currentTime}</p>

        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">Room</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>#123</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant={micEnabled ? "default" : "ghost"}
          size="icon"
          onClick={toggleMic}
        >
          <span className="sr-only">Mute</span>
          <Mic2 className={micEnabled ? "" : "text-muted-foreground"} />
        </Button>
        <Button
          variant={videoEnabled ? "default" : "ghost"}
          size="icon"
          onClick={toggleVideo}
        >
          <span className="sr-only">Video</span>
          <Video className={videoEnabled ? "" : "text-muted-foreground"} />
        </Button>
        <Button
          variant={screenShareEnabled ? "default" : "ghost"}
          size="icon"
          onClick={toggleScreenShare}
        >
          <span className="sr-only">Share Screen</span>
          <ScreenShare
            className={screenShareEnabled ? "" : "text-muted-foreground"}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={() => console.log("End call")}
        >
          <span className="sr-only">End Call</span>
          <PhoneOff />
        </Button>
      </div>

      <Button
        variant={chatEnabled ? "default" : "ghost"}
        size="icon"
        onClick={toggleChat}
      >
        <span className="sr-only">Open Chat</span>
        <MessageSquare className={chatEnabled ? "" : "text-muted-foreground"} />
      </Button>
    </nav>
  );
}
