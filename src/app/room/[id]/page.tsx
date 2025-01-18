export default function Page() {
  return (
    <div className="relative h-screen ">
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid auto-rows-min gap-4 md:grid-cols-4">
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
          <div className="aspect-video rounded-xl bg-muted/50" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white shadow-md">
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
            This is some placeholder text for the translation feature.
          </p>
        </div>
      </div>
    </div>
  );
}
