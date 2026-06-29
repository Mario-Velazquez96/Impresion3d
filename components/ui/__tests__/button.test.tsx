import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children as a button element", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
  });

  it("applies variant and size classes via cn()", () => {
    render(
      <Button variant="outline" size="sm">
        Outlined
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Outlined" });
    expect(button.className).toContain("border");
    expect(button.className).toContain("h-9");
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/home">Home</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Home" });
    expect(link).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
