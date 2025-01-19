"use client";

import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";

export type Video = {
  id: number;
  title: string;
  thumbnail: string;
  producerId: string;
  stream: MediaStream;
};

type VideoPresentationProps = {
  userVideos: Video[];
  isPresentationMode: boolean;
  presentingVideoId: number | null;
  setPresentingVideoId: (id: number) => void;
};

export default function VideoPresentation({
  userVideos,
  isPresentationMode,
  presentingVideoId,
  setPresentingVideoId,
}: VideoPresentationProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    console.log("User Videos:", userVideos);
    if (videoRef.current && presentingVideoId !== null) {
      const currentVideo = userVideos.find((video) => video.id === presentingVideoId);
      if (currentVideo) {
        videoRef.current.srcObject = currentVideo.stream;
        videoRef.current.play();
      }
    }
  }, [presentingVideoId, userVideos]);

  return (
    <div className={cn("flex-1 flex flex-col gap-4 pb-4")}>
      {isPresentationMode ? (
        <div className="flex flex-col gap-4">
          <div className="w-full h-[50vh] bg-muted/50 rounded-xl flex items-center justify-center">
            <video ref={videoRef} className="w-full h-full" autoPlay playsInline controls />
          </div>

          <div className="flex overflow-x-auto gap-4">
            {userVideos.map((video) => (
              <div
                key={video.id}
                className={cn("aspect-video w-24 md:w-32 rounded-xl cursor-pointer flex-shrink-0", video.thumbnail, {
                  "border-4 border-primary": video.id === presentingVideoId,
                })}
                onClick={() => setPresentingVideoId(video.id)}
              >
                <span className="block text-center text-muted-foreground text-sm">{video.title}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid auto-rows-min gap-4 md:grid-cols-4">
          {userVideos.map((video) => (
            <div key={video.id} className={cn("aspect-video rounded-xl cursor-pointer", video.thumbnail)}>
              <video
                ref={(el) => {
                  if (el) {
                    el.srcObject = video.stream;
                    el.onloadedmetadata = () => {
                      el.play().catch((error) => {
                        console.error("Error attempting to play video:", error);
                      });
                    };
                  }
                }}
                className="w-full h-full"
                autoPlay
                playsInline
              />
              <span className="block text-center text-muted-foreground">{video.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
