import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportTicketButton } from "@/components/dashboard/support-ticket-button";

describe("SupportTicketButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function openDialog() {
    render(<SupportTicketButton />);
    fireEvent.click(screen.getByRole("button", { name: "Open support ticket" }));
  }

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "Instagram connection failed" },
    });
    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "Connect succeeds, but the account never appears." },
    });
  }

  it("opens and closes an accessible dialog with user-facing categories only", () => {
    openDialog();

    expect(screen.getByRole("dialog", { name: "Contact support" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Bug" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Account access" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Billing" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Feature request" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Bot" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Max" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close support ticket" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps submit disabled until required fields are filled", () => {
    openDialog();
    const submit = screen.getByRole("button", { name: "Send support request" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fillRequiredFields();
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows loading then a successful ticket confirmation", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal(
      "fetch",
      fetchMock
    );
    openDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Send support request" }));
    expect(screen.getByRole("button", { name: "Sending support request" })).toBeTruthy();
    const submitted = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(submitted.get("category")).toBe("bug");
    expect(submitted.get("source")).toBeNull();
    expect(submitted.get("autoRepair")).toBeNull();

    resolveFetch(
      new Response(
        JSON.stringify({
          issue: {
            identifier: "MAX-101",
            url: "https://linear.app/example/issue/MAX-101",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    expect(await screen.findByText(/Created/)).toBeTruthy();
    expect(screen.getByText("MAX-101")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "MAX-101" })).toBeNull();
  });

  it("shows a visible API error and allows retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "Support is temporarily unavailable. Try again in a moment." }),
          { status: 502, headers: { "content-type": "application/json" } }
        )
      )
    );
    openDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Send support request" }));

    expect(
      await screen.findByText("Support is temporarily unavailable. Try again in a moment.")
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: "Send support request" }) as HTMLButtonElement)
          .disabled
      ).toBe(false);
    });
  });
});
