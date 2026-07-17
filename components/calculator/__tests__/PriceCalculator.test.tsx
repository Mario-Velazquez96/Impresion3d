import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Calculator Client-island tests (09_price_calculator: R2–R11). The island owns all
 * state and derives the breakdown from the pure core on every keystroke — there is
 * NO Server Action and no fetch to mock, which is the point: nothing leaves the
 * browser and nothing is persisted.
 */

import { PriceCalculator } from "@/components/calculator/PriceCalculator";
import type {
  CalculatorPrintView,
  ColorView,
} from "@/components/calculator/types";

const PIEL: ColorView = { id: "piel", name: "Piel", hex: "#eecda3" };
const VERDE: ColorView = { id: "verde", name: "Verde", hex: "#00aa00" };
// A catalog color no print uses — still selectable (the catalog is the source).
const AZUL: ColorView = { id: "azul", name: "Azul", hex: "#0000cc" };

const allColors = [AZUL, PIEL, VERDE];

const twoColorPrint: CalculatorPrintView = {
  id: "p-two",
  name: "Two Color Print",
  printTimeMinutes: 90,
  filamentGrams: 50,
  colors: [PIEL, VERDE],
};

const prints = [twoColorPrint];

function renderCalculator() {
  return render(<PriceCalculator allColors={allColors} prints={prints} />);
}

const electricity = () => screen.getByTestId("electricity-cost").textContent;
const subtotal = () => screen.getByTestId("filament-subtotal").textContent;
const total = () => screen.getByTestId("total-cost").textContent;

/** Type the spec's worked example: 2.50/h, 90 min, 30 g @ 450, 20 g @ 500. */
function typeWorkedExample() {
  fireEvent.change(screen.getByLabelText(/power price per hour/i), {
    target: { value: "2.50" },
  });
  fireEvent.change(screen.getByLabelText(/print time \(minutes\)/i), {
    target: { value: "90" },
  });

  const gramInputs = screen.getAllByLabelText(/grams used/i);
  const priceInputs = screen.getAllByLabelText(/price per kg/i);
  fireEvent.change(gramInputs[0], { target: { value: "30" } });
  fireEvent.change(priceInputs[0], { target: { value: "450" } });
  fireEvent.change(gramInputs[1], { target: { value: "20" } });
  fireEvent.change(priceInputs[1], { target: { value: "500" } });
}

describe("prefill from a print (R5)", () => {
  it("fills the time, makes one row per color with grams BLANK, and shows the total-grams hint", () => {
    renderCalculator();

    fireEvent.change(screen.getByLabelText(/load from a print/i), {
      target: { value: twoColorPrint.id },
    });

    // Time prefilled from printTimeMinutes.
    expect(screen.getByLabelText(/print time \(minutes\)/i)).toHaveValue(90);

    // Exactly two rows — one per color, each preselected with the right color.
    const colorSelects = screen.getAllByLabelText(
      /^color \(row/i,
    ) as HTMLSelectElement[];
    expect(colorSelects).toHaveLength(2);
    expect(colorSelects[0]).toHaveValue(PIEL.id);
    expect(colorSelects[1]).toHaveValue(VERDE.id);

    // Grams left BLANK — no per-color split is guessed.
    const gramInputs = screen.getAllByLabelText(/grams used/i);
    expect(gramInputs).toHaveLength(2);
    expect(gramInputs[0]).toHaveValue(null);
    expect(gramInputs[1]).toHaveValue(null);

    // The print's TOTAL filamentGrams surfaces as a hint/reference.
    expect(
      screen.getByText(/50 g of filament in total/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/split it across the colors below/i),
    ).toBeInTheDocument();
  });

  it("leaves prefilled values editable: editing time + grams updates the total (R5)", () => {
    renderCalculator();
    fireEvent.change(screen.getByLabelText(/load from a print/i), {
      target: { value: twoColorPrint.id },
    });

    // Prefilled time is editable: 90 → 60 min at $2/h ⇒ electricity $2.00.
    fireEvent.change(screen.getByLabelText(/power price per hour/i), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/print time \(minutes\)/i), {
      target: { value: "60" },
    });
    expect(screen.getByLabelText(/print time \(minutes\)/i)).toHaveValue(60);
    expect(electricity()).toContain("2.00");

    // The blank prefilled grams accept the user's own split: 25 g @ 400/kg = 10.
    fireEvent.change(screen.getAllByLabelText(/grams used/i)[0], {
      target: { value: "25" },
    });
    fireEvent.change(screen.getAllByLabelText(/price per kg/i)[0], {
      target: { value: "400" },
    });
    expect(subtotal()).toContain("10.00");
    expect(total()).toContain("12.00");
  });

  it("choosing None clears the hint WITHOUT wiping the user's typed values", () => {
    renderCalculator();
    fireEvent.change(screen.getByLabelText(/load from a print/i), {
      target: { value: twoColorPrint.id },
    });
    fireEvent.change(screen.getAllByLabelText(/grams used/i)[0], {
      target: { value: "30" },
    });

    fireEvent.change(screen.getByLabelText(/load from a print/i), {
      target: { value: "" },
    });

    expect(screen.queryByText(/50 g of filament in total/i)).toBeNull();
    expect(screen.getAllByLabelText(/grams used/i)[0]).toHaveValue(30);
    expect(screen.getByLabelText(/print time \(minutes\)/i)).toHaveValue(90);
  });
});

describe("live total (R2, R3, R4)", () => {
  it("typing the worked example shows electricity 3.75, subtotal 23.50, total 27.25", () => {
    renderCalculator();
    fireEvent.change(screen.getByLabelText(/load from a print/i), {
      target: { value: twoColorPrint.id },
    });
    typeWorkedExample();

    expect(electricity()).toContain("3.75");
    expect(subtotal()).toContain("23.50");
    expect(total()).toContain("27.25");
  });

  it("updates the total on EVERY change, with no navigation or server call", () => {
    renderCalculator();
    const power = screen.getByLabelText(/power price per hour/i);

    fireEvent.change(power, { target: { value: "2.50" } });
    fireEvent.change(screen.getByLabelText(/print time \(minutes\)/i), {
      target: { value: "60" },
    });
    expect(total()).toContain("2.50");

    // A single keystroke on the time field immediately re-derives the total.
    fireEvent.change(screen.getByLabelText(/print time \(minutes\)/i), {
      target: { value: "120" },
    });
    expect(total()).toContain("5.00");
  });
});

describe("standalone mode + blank inputs (R6, R7)", () => {
  it("renders exactly one empty row by default and accepts fully manual entry", () => {
    renderCalculator();
    expect(screen.getAllByLabelText(/grams used/i)).toHaveLength(1);
    expect(screen.getByLabelText(/load from a print/i)).toHaveValue("");

    // Manual worked example: add the second row, then type it all in.
    fireEvent.click(screen.getByRole("button", { name: /add filament row/i }));
    typeWorkedExample();

    expect(electricity()).toContain("3.75");
    expect(subtotal()).toContain("23.50");
    expect(total()).toContain("27.25");
  });

  it("an untouched form shows $0.00 everywhere and never renders NaN (R7)", () => {
    const { container } = renderCalculator();

    expect(electricity()).toContain("0.00");
    expect(subtotal()).toContain("0.00");
    expect(total()).toContain("0.00");
    expect(container.textContent).not.toContain("NaN");
  });

  it("clearing a filled field returns a 0 contribution, not NaN (R7)", () => {
    const { container } = renderCalculator();
    fireEvent.change(screen.getByLabelText(/power price per hour/i), {
      target: { value: "2.50" },
    });
    fireEvent.change(screen.getByLabelText(/print time \(minutes\)/i), {
      target: { value: "90" },
    });
    expect(total()).toContain("3.75");

    fireEvent.change(screen.getByLabelText(/print time \(minutes\)/i), {
      target: { value: "" },
    });
    expect(total()).toContain("0.00");
    expect(container.textContent).not.toContain("NaN");
  });

  it("inputs refuse negatives via min=0 and a negative value contributes 0 (R8)", () => {
    renderCalculator();
    const grams = screen.getAllByLabelText(/grams used/i)[0];
    expect(grams).toHaveAttribute("min", "0");
    expect(screen.getByLabelText(/power price per hour/i)).toHaveAttribute(
      "min",
      "0",
    );

    fireEvent.change(grams, { target: { value: "-5" } });
    fireEvent.change(screen.getAllByLabelText(/price per kg/i)[0], {
      target: { value: "450" },
    });
    expect(subtotal()).toContain("0.00");
    expect(total()).toContain("0.00");
  });
});

describe("add / remove rows (R9)", () => {
  it("Add filament row appends an empty row", () => {
    renderCalculator();
    expect(screen.getAllByLabelText(/grams used/i)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /add filament row/i }));
    const gramInputs = screen.getAllByLabelText(/grams used/i);
    expect(gramInputs).toHaveLength(2);
    expect(gramInputs[1]).toHaveValue(null);
  });

  it("Remove drops the RIGHT row (keyed, not index-scrambled) and recomputes", () => {
    renderCalculator();
    // Three rows: 10 g @ 100/kg (=1), 20 g @ 100/kg (=2), 30 g @ 100/kg (=3).
    fireEvent.click(screen.getByRole("button", { name: /add filament row/i }));
    fireEvent.click(screen.getByRole("button", { name: /add filament row/i }));

    const grams = screen.getAllByLabelText(/grams used/i);
    const prices = screen.getAllByLabelText(/price per kg/i);
    [10, 20, 30].forEach((value, i) => {
      fireEvent.change(grams[i], { target: { value: String(value) } });
      fireEvent.change(prices[i], { target: { value: "100" } });
    });
    expect(subtotal()).toContain("6.00");

    // Remove the MIDDLE row → the surviving rows keep their own values (1 + 3 = 4).
    fireEvent.click(screen.getByRole("button", { name: /remove row 2/i }));

    const remaining = screen.getAllByLabelText(
      /grams used/i,
    ) as HTMLInputElement[];
    expect(remaining).toHaveLength(2);
    expect(remaining[0]).toHaveValue(10);
    expect(remaining[1]).toHaveValue(30);
    expect(subtotal()).toContain("4.00");
    expect(total()).toContain("4.00");
  });

  it("Remove is not offered at one row — at least one row always remains", () => {
    renderCalculator();
    expect(screen.queryByRole("button", { name: /remove row/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /add filament row/i }));
    expect(screen.getAllByRole("button", { name: /remove row/i })).toHaveLength(
      2,
    );

    fireEvent.click(screen.getByRole("button", { name: /remove row 2/i }));
    expect(screen.getAllByLabelText(/grams used/i)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /remove row/i })).toBeNull();
  });
});

describe("color swatches (R10)", () => {
  it("lists the full catalog and renders the selected color's hex swatch in the row", () => {
    renderCalculator();
    const select = screen.getAllByLabelText(/^color \(row/i)[0];

    // The full catalog is selectable, incl. AZUL which no print uses.
    const options = Array.from(
      select.querySelectorAll("option"),
    ) as HTMLOptionElement[];
    expect(options.map((o) => o.textContent)).toEqual([
      "— No color —",
      "Azul",
      "Piel",
      "Verde",
    ]);

    // No color chosen yet → no swatch, an explicit "No color" instead.
    expect(screen.getAllByText("No color").length).toBeGreaterThan(0);

    fireEvent.change(select, { target: { value: PIEL.id } });
    const swatchColors = Array.from(
      document.querySelectorAll('span[aria-hidden="true"]'),
    ).map((s) => (s as HTMLElement).style.backgroundColor);
    expect(swatchColors).toContain("rgb(238, 205, 163)"); // Piel
  });

  it("renders each breakdown line with its color's swatch and name", () => {
    renderCalculator();
    fireEvent.change(screen.getByLabelText(/load from a print/i), {
      target: { value: twoColorPrint.id },
    });
    typeWorkedExample();

    // Scope to the breakdown block: each line shows the color's name AND its dot.
    const lines = within(screen.getByTestId("filament-lines"));
    expect(lines.getByText("Piel")).toBeInTheDocument();
    expect(lines.getByText("Verde")).toBeInTheDocument();
    expect(lines.getByText(/13\.50/)).toBeInTheDocument();
    expect(lines.getByText(/10\.00/)).toBeInTheDocument();

    const swatchColors = Array.from(
      screen.getByTestId("filament-lines").querySelectorAll('span[aria-hidden="true"]'),
    ).map((s) => (s as HTMLElement).style.backgroundColor);
    expect(swatchColors).toContain("rgb(238, 205, 163)"); // Piel
    expect(swatchColors).toContain("rgb(0, 170, 0)"); // Verde
  });
});
