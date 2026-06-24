import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Planning Client-island tests (07_weekly_planning): the picker persists, the mode
 * toggle switches the list, the filtered inventory shows missing-color badges and
 * assigns, the day column moves/removes, and swatches render from hex (R3–R11). The
 * server actions are mocked so we test the islands' wiring + the client-side matcher
 * re-derivation, not the DB.
 */

const {
  setWeekColorsActionMock,
  assignItemActionMock,
  moveItemActionMock,
  removeItemActionMock,
} = vi.hoisted(() => ({
  setWeekColorsActionMock: vi.fn((..._a: unknown[]) =>
    Promise.resolve({ ok: true }),
  ),
  assignItemActionMock: vi.fn((..._a: unknown[]) =>
    Promise.resolve({ ok: true }),
  ),
  moveItemActionMock: vi.fn((..._a: unknown[]) =>
    Promise.resolve({ ok: true }),
  ),
  removeItemActionMock: vi.fn((..._a: unknown[]) =>
    Promise.resolve({ ok: true }),
  ),
}));
vi.mock("@/actions/planning", () => ({
  setWeekColorsAction: (...a: unknown[]) => setWeekColorsActionMock(...a),
  assignItemAction: (...a: unknown[]) => assignItemActionMock(...a),
  moveItemAction: (...a: unknown[]) => moveItemActionMock(...a),
  removeItemAction: (...a: unknown[]) => removeItemActionMock(...a),
}));

import { WeekPlanner } from "@/components/planning/WeekPlanner";
import { ColorPicker } from "@/components/planning/ColorPicker";
import {
  MatchModeToggle,
  type MatchMode,
} from "@/components/planning/MatchModeToggle";
import type { ColorView, ItemView, PrintView } from "@/components/planning/types";
import { useState } from "react";

const PIEL: ColorView = { id: "piel", name: "Piel", hex: "#eecda3" };
const VERDE: ColorView = { id: "verde", name: "Verde", hex: "#00aa00" };
const ROJO: ColorView = { id: "rojo", name: "Rojo", hex: "#cc0000" };

const allColors = [PIEL, VERDE, ROJO];

const prints: PrintView[] = [
  { id: "p-piel", name: "Piel Print", colors: [PIEL] },
  { id: "p-piel-verde", name: "Piel Verde Print", colors: [PIEL, VERDE] },
  { id: "p-rojo", name: "Rojo Print", colors: [ROJO] },
];

const WEEK = "2026-06-22";

describe("MatchModeToggle (R4/R5 — switches mode)", () => {
  function Harness() {
    const [mode, setMode] = useState<MatchMode>("full");
    return (
      <>
        <span data-testid="mode">{mode}</span>
        <MatchModeToggle mode={mode} onChange={setMode} />
      </>
    );
  }

  it("starts in full and switches to partial on click", () => {
    render(<Harness />);
    expect(screen.getByTestId("mode")).toHaveTextContent("full");
    fireEvent.click(screen.getByRole("button", { name: /partial match/i }));
    expect(screen.getByTestId("mode")).toHaveTextContent("partial");
  });
});

describe("ColorPicker (R3 — persists via setWeekColors)", () => {
  function Harness() {
    const [selected, setSelected] = useState<Set<string>>(new Set([PIEL.id]));
    return (
      <ColorPicker
        weekStartDate={WEEK}
        allColors={allColors}
        selectedIds={selected}
        onToggle={(id, checked) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          })
        }
      />
    );
  }

  it("toggles a color and submits the selected set to the action", async () => {
    render(<Harness />);
    // Add Verde, then save.
    fireEvent.click(screen.getByLabelText("Verde"));
    fireEvent.click(screen.getByRole("button", { name: /save colors/i }));
    await screen.findByText("Saved.");
    expect(setWeekColorsActionMock).toHaveBeenCalledTimes(1);
  });

  it("renders a swatch for each color (R11)", () => {
    render(<Harness />);
    const swatches = Array.from(
      document.querySelectorAll('span[aria-hidden="true"]'),
    ) as HTMLElement[];
    const colors = swatches.map((s) => s.style.backgroundColor);
    expect(colors).toContain("rgb(238, 205, 163)"); // Piel
    expect(colors).toContain("rgb(0, 170, 0)"); // Verde
  });
});

describe("WeekPlanner (R4–R6 — client-side matcher re-derivation)", () => {
  it("full mode (default) lists only fully-producible prints (worked example)", () => {
    render(
      <WeekPlanner
        weekStartDate={WEEK}
        allColors={allColors}
        initialAvailableColorIds={[PIEL.id]}
        prints={prints}
        items={[]}
      />,
    );
    const inventory = screen.getByRole("heading", {
      name: /producible prints/i,
    }).parentElement!.parentElement!;
    expect(within(inventory).getByText("Piel Print")).toBeInTheDocument();
    expect(within(inventory).queryByText("Piel Verde Print")).toBeNull();
    expect(within(inventory).queryByText("Rojo Print")).toBeNull();
  });

  it("toggling partial adds the partial print and shows its missing colors (R5)", () => {
    render(
      <WeekPlanner
        weekStartDate={WEEK}
        allColors={allColors}
        initialAvailableColorIds={[PIEL.id]}
        prints={prints}
        items={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /partial match/i }));
    expect(screen.getByText("Piel Verde Print")).toBeInTheDocument();
    // Rojo shares no color → still absent.
    expect(screen.queryByText("Rojo Print")).toBeNull();
    // Missing-colors badge surfaces Verde.
    expect(screen.getByText("Missing colors")).toBeInTheDocument();
  });

  it("empty available set ⇒ both modes empty with an informative message (R6)", () => {
    render(
      <WeekPlanner
        weekStartDate={WEEK}
        allColors={allColors}
        initialAvailableColorIds={[]}
        prints={prints}
        items={[]}
      />,
    );
    expect(
      screen.getByText(/select the colors to dry this week/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /partial match/i }));
    expect(
      screen.getByText(/select the colors to dry this week/i),
    ).toBeInTheDocument();
  });

  it("assigns a print to a day via the Select fallback (R7)", () => {
    render(
      <WeekPlanner
        weekStartDate={WEEK}
        allColors={allColors}
        initialAvailableColorIds={[PIEL.id]}
        prints={prints}
        items={[]}
      />,
    );
    const select = screen.getByLabelText(/assign to day/i);
    fireEvent.change(select, { target: { value: "WED" } });
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    expect(assignItemActionMock).toHaveBeenCalledTimes(1);
  });
});

describe("WeekGrid via WeekPlanner (R8, R9, R11 — grid, move/remove, drying)", () => {
  const items: ItemView[] = [
    {
      id: "it-1",
      printId: "p-piel",
      printName: "Piel Print",
      dayOfWeek: "TUE",
      position: 0,
      colors: [PIEL],
    },
    {
      id: "it-2",
      printId: "p-rojo",
      printName: "Rojo Print",
      dayOfWeek: "MON",
      position: 0,
      colors: [ROJO],
    },
  ];

  function renderGrid() {
    render(
      <WeekPlanner
        weekStartDate={WEEK}
        allColors={allColors}
        initialAvailableColorIds={[PIEL.id]}
        prints={prints}
        items={items}
      />,
    );
  }

  it("shows the planned prints in their day columns", () => {
    renderGrid();
    expect(screen.getAllByText("Piel Print").length).toBeGreaterThan(0);
    expect(screen.getByText("Rojo Print")).toBeInTheDocument();
  });

  it("shows the 'dry the previous Sunday' panel for Monday's prints (R9 MON edge)", () => {
    renderGrid();
    expect(
      screen.getByText(/dry the previous sunday/i),
    ).toBeInTheDocument();
  });

  it("removing a planned print calls removeItem (R8)", () => {
    renderGrid();
    fireEvent.click(
      screen.getByRole("button", { name: /remove piel print/i }),
    );
    expect(removeItemActionMock).toHaveBeenCalledTimes(1);
  });

  it("moving a planned print to another day calls moveItem (R8)", () => {
    renderGrid();
    const moveSelect = screen.getByLabelText(/move piel print to a day/i);
    fireEvent.change(moveSelect, { target: { value: "FRI" } });
    expect(moveItemActionMock).toHaveBeenCalledTimes(1);
  });
});
