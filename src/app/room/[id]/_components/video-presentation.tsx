"use client";

import { cn } from "@/lib/utils";

type Video = {
  id: number;
  title: string;
  thumbnail: string;
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
  return (
    <div className={cn("flex-1 flex flex-col gap-4 pb-4")}>
      {isPresentationMode ? (
        <div className="flex flex-col gap-4">
          <div className="w-full h-[70vh] bg-muted/50 rounded-xl flex items-center justify-center">
            <span className="text-center text-muted-foreground text-2xl">
              {
                userVideos.find((video) => video.id === presentingVideoId)
                  ?.title
              }
            </span>
          </div>

          <div className="flex overflow-x-auto gap-4">
            {userVideos.map((video) => (
              <div
                key={video.id}
                className={cn(
                  "aspect-video w-24 md:w-32 rounded-xl cursor-pointer flex-shrink-0",
                  video.thumbnail,
                  {
                    "border-4 border-primary": video.id === presentingVideoId,
                  }
                )}
                onClick={() => setPresentingVideoId(video.id)}
              >
                <span className="block text-center text-muted-foreground text-sm">
                  {video.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid auto-rows-min gap-4 md:grid-cols-4">
          {userVideos.map((video) => (
            <div
              key={video.id}
              className={cn(
                "aspect-video rounded-xl cursor-pointer",
                video.thumbnail
              )}
            >
              <span className="block text-center text-muted-foreground">
                {video.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
