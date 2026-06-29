import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const inviteUserMock = vi.fn();
vi.mock("@/actions/users", () => ({
  inviteUser: (...a: unknown[]) => inviteUserMock(...a),
}));

import { InviteUserDialog } from "@/components/admin/InviteUserDialog";

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement <dialog> showModal/close — stub them.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

describe("InviteUserDialog (R8)", () => {
  it("includes a temporary-password field in the invite form", () => {
    render(<InviteUserDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));

    expect(screen.getByLabelText("Temporary password")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
  });

  it("submits the form values (incl. tempPassword) to the invite action (R8)", async () => {
    inviteUserMock.mockResolvedValue({ ok: true });
    render(<InviteUserDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Temporary password"), {
      target: { value: "temp12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(inviteUserMock).toHaveBeenCalledTimes(1));
    const submitted = inviteUserMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("New User");
    expect(submitted.get("email")).toBe("new@example.com");
    expect(submitted.get("tempPassword")).toBe("temp12");
    expect(submitted.get("role")).toBe("EMPLOYEE");
  });

  it("shows the error returned by the action", async () => {
    inviteUserMock.mockResolvedValue({
      ok: false,
      error: "Password must be at least 6 characters",
    });
    render(<InviteUserDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Invite user" }));

    // Fill required fields so the form action runs; the mocked action returns
    // the server-side error we want to assert is rendered.
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Temporary password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 6/i);
  });
});
