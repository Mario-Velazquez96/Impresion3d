import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Board — Tower Layers",
};

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight">Board</h1>
      <p className="text-muted-foreground">
        The task board arrives in a later feature.
      </p>
    </div>
  );
}
