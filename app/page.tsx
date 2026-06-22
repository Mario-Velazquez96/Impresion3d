import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tower Layers</h1>
        <p className="text-muted-foreground">
          Internal 3D-printing management portal — foundation is ready.
        </p>
      </div>
      <Button>Get started</Button>
    </main>
  );
}
