import { PAGE_LAYOUT_HEIGHT } from "@/consts/constants";

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
      <div className="border bg-white p-4">
        <div className="flex gap-4">
          <select className="p-2 border rounded">
            <option>Current Language</option>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
            {/* Add more languages as needed */}
          </select>
          <select className="p-2 border rounded">
            <option>Translation</option>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
            {/* Add more languages as needed */}
          </select>
        </div>
        <div className="mt-4 p-2 border rounded bg-gray-100">
          <p className="text-sm">
            Lorem ipsum dolor, sit amet consectetur adipisicing elit. Rerum
            aperiam dolores dolorem eius! Iure doloremque porro minus earum
            ratione suscipit nisi illum quae dolores error! Minima ea placeat
            ipsam laborum saepe commodi aperiam nesciunt illum error nihil
            praesentium corporis quibusdam explicabo, voluptates debitis
            assumenda iusto sint ipsa sunt quo velit.
          </p>
        </div>
      </div>
    </div>
  );
}
