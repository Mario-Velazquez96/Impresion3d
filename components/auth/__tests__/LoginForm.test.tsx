import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signInMock = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: signInMock },
  }),
}));

import { LoginForm } from "@/components/auth/LoginForm";

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("has accessible, labeled email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows an error and establishes no session on invalid credentials (R5)", async () => {
    signInMock.mockResolvedValue({ error: { message: "Invalid login" } });
    render(<LoginForm />);

    fill("user@example.com", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid email or password/i,
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("validates client-side before calling Supabase (short password)", async () => {
    render(<LoginForm />);

    fill("user@example.com", "123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 6/i);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("redirects to /board on success (R4)", async () => {
    signInMock.mockResolvedValue({ error: null });
    render(<LoginForm />);

    fill("user@example.com", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/board"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
