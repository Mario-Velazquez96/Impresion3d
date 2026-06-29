import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * PrintGrid / PrintCard rendering tests (R8 empty state, R11 swatches + signed
 * image). next/image and next/link are mocked so the Server-Component cards render
 * as plain DOM in jsdom; we assert each card shows its name, type, the
 * server-generated signed photo URL, and a swatch coloured from each color's hex.
 */

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={props.src} alt={props.alt} />,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { PrintGrid } from "@/components/inventory/PrintGrid";
import type { PrintCardView } from "@/components/inventory/PrintCard";

const cards: PrintCardView[] = [
  {
    id: "p1",
    name: "Dragon",
    printTypeName: "Mini",
    signedPhotoUrl: "https://signed.example/dragon.png?token=abc",
    colors: [
      { id: "c1", name: "Red", hex: "#ff0000" },
      { id: "c2", name: "Blue", hex: "#0000ff" },
    ],
  },
  {
    id: "p2",
    name: "Castle",
    printTypeName: "Terrain",
    signedPhotoUrl: null,
    colors: [],
  },
];

describe("PrintGrid (R8 — empty state)", () => {
  it("shows an empty message when no print matches", () => {
    render(<PrintGrid prints={[]} />);
    expect(screen.getByText(/no prints match/i)).toBeInTheDocument();
  });
});

describe("PrintCard via PrintGrid (R11 — swatches + signed image)", () => {
  it("renders each print name, type, and links to its detail page", () => {
    render(<PrintGrid prints={cards} />);
    expect(screen.getByText("Dragon")).toBeInTheDocument();
    expect(screen.getByText("Mini")).toBeInTheDocument();
    expect(screen.getByText("Castle")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Dragon/ }),
    ).toHaveAttribute("href", "/inventory/p1");
  });

  it("renders the server-generated signed photo URL (never a stored URL)", () => {
    render(<PrintGrid prints={cards} />);
    const img = screen.getByAltText("Dragon") as HTMLImageElement;
    expect(img.src).toContain("https://signed.example/dragon.png");
  });

  it("falls back to a 'No photo' placeholder when there is no signed URL", () => {
    render(<PrintGrid prints={cards} />);
    // Castle has signedPhotoUrl null -> no image rendered for it, placeholder shown.
    expect(screen.queryByAltText("Castle")).toBeNull();
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });

  it("renders a color swatch coloured from each color's hex (R11)", () => {
    render(<PrintGrid prints={cards} />);
    const swatches = Array.from(
      document.querySelectorAll('span[aria-hidden="true"]'),
    ) as HTMLElement[];
    const colors = swatches.map((s) => s.style.backgroundColor);
    // jsdom normalizes hex to rgb().
    expect(colors).toContain("rgb(255, 0, 0)");
    expect(colors).toContain("rgb(0, 0, 255)");
    // Color names are present (sr-only) for accessibility.
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("shows the 'No colors' fallback for a print with an empty color set", () => {
    render(<PrintGrid prints={cards} />);
    expect(screen.getByText("No colors")).toBeInTheDocument();
  });
});
