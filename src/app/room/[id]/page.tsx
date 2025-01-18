"use client";

import { useState } from "react";
import { PAGE_LAYOUT_HEIGHT } from "@/consts/constants";
import SelectLanguage from "./_components/select-language";
import VideoPresentation from "./_components/video-presentation";

const userVideos = [
  { id: 1, title: "Video 1", thumbnail: "bg-muted/50" },
  { id: 2, title: "Video 2", thumbnail: "bg-muted/50" },
  { id: 3, title: "Video 3", thumbnail: "bg-muted/50" },
  { id: 4, title: "Video 4", thumbnail: "bg-muted/50" },
];

export default function Page() {
  const [isPresentationMode, setPresentationMode] = useState(false);
  const [presentingVideoId, setPresentingVideoId] = useState<number | null>(
    null
  );

  const togglePresentationMode = () => {
    setPresentationMode((prevMode) => !prevMode);
    if (!isPresentationMode) {
      setPresentingVideoId(userVideos[0]?.id || null);
    } else {
      setPresentingVideoId(null);
    }
  };

  return (
    <div
      className="flex flex-col px-2 md:px-4 pt-2 md:pt-4"
      style={{ minHeight: PAGE_LAYOUT_HEIGHT }}
    >
      {/* Toggle Button */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={togglePresentationMode}
          className="px-4 py-2 bg-primary text-white rounded-lg shadow"
        >
          {isPresentationMode
            ? "Exit Presentation Mode"
            : "Enter Presentation Mode"}
        </button>
      </div>

      {/* Main Content */}
      <VideoPresentation
        userVideos={userVideos}
        isPresentationMode={isPresentationMode}
        presentingVideoId={presentingVideoId}
        setPresentingVideoId={setPresentingVideoId}
      />

      {/* Bottom Section */}
      <SelectLanguage />
    </div>
  );
}
