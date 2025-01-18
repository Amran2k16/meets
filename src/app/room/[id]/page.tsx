import { PAGE_LAYOUT_HEIGHT } from "@/consts/constants";
import SelectLanguage from "./_components/select-language";

export default function Page() {
  return (
    <div
      className="flex flex-col px-2 md:px-4 pt-2 md:pt-4"
      style={{ minHeight: PAGE_LAYOUT_HEIGHT }}
    >
      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="grid auto-rows-min gap-4 md:grid-cols-4">
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
        </div>
      </div>

      {/* Bottom Section */}
      <SelectLanguage />
    </div>
  );
}
