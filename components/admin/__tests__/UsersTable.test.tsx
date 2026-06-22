import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const setUserRoleMock = vi.fn();
vi.mock("@/actions/users", () => ({
  setUserRole: (...a: unknown[]) => setUserRoleMock(...a),
}));

import { UsersTable } from "@/components/admin/UsersTable";

const users = [
  { id: "u1", email: "emp@example.com", name: "Emp", role: "EMPLOYEE" as const },
  { id: "a1", email: "admin@example.com", name: "Admin", role: "ADMIN" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UsersTable (R10)", () => {
  it("renders a row per user with name, email and a role select", () => {
    render(<UsersTable users={users} />);
    expect(screen.getByText("emp@example.com")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Emp")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Admin")).toBeInTheDocument();
  });

  it("disables Save until the role changes, then calls setUserRole (R10)", async () => {
    setUserRoleMock.mockResolvedValue({ ok: true });
    render(<UsersTable users={users} />);

    const empRow = screen.getByText("Emp").closest("tr");
    expect(empRow).not.toBeNull();
    const select = screen.getByLabelText("Role for Emp") as HTMLSelectElement;
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    // The first row's Save button starts disabled (role unchanged).
    expect(saveButtons[0]).toBeDisabled();

    fireEvent.change(select, { target: { value: "ADMIN" } });
    expect(saveButtons[0]).toBeEnabled();

    fireEvent.click(saveButtons[0]);

    await waitFor(() => expect(setUserRoleMock).toHaveBeenCalledTimes(1));
    const submittedFormData = setUserRoleMock.mock.calls[0][1] as FormData;
    expect(submittedFormData.get("userId")).toBe("u1");
    expect(submittedFormData.get("role")).toBe("ADMIN");
  });

  it("reverts the select on action failure", async () => {
    setUserRoleMock.mockResolvedValue({ ok: false, error: "nope" });
    render(<UsersTable users={users} />);

    const select = screen.getByLabelText("Role for Emp") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "ADMIN" } });
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => expect(select.value).toBe("EMPLOYEE"));
    expect(screen.getByRole("alert")).toHaveTextContent("nope");
  });
});
