import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";

import { getWorkspaceAuthErrorMessage } from "@/lib/supabase/config";

const require = createRequire(import.meta.url);

const supabaseClient = {
  auth: {
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
};

const createSupabaseBrowserClient = vi.fn();

function loadClientComponent<T>(relativePath: string, exportName: string): T {
  const source = readFileSync(join(process.cwd(), relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const cjsModule = { exports: {} as Record<string, T> };

  const localRequire = (id: string) => {
    if (id === "@/lib/supabase/browser") {
      return { createSupabaseBrowserClient };
    }
    if (id === "@/lib/supabase/config") {
      return { getWorkspaceAuthErrorMessage };
    }
    return require(id);
  };

  new Function("exports", "require", "module", outputText)(
    cjsModule.exports,
    localRequire,
    cjsModule
  );

  return cjsModule.exports[exportName];
}

const GoogleSignInButton = loadClientComponent<React.ComponentType<{
  initialErrorCode?: string | null;
  nextPath?: string;
  supabase: { url: string; anonKey: string };
}>>("src/components/auth/google-sign-in-button.tsx", "GoogleSignInButton");

const UnauthorizedSessionReset = loadClientComponent<React.ComponentType<{
  supabase: { url: string; anonKey: string };
}>>(
  "src/components/auth/unauthorized-session-reset.tsx",
  "UnauthorizedSessionReset"
);

const supabaseConfig = {
  url: "https://supabase.maxpetrusenko.com",
  anonKey: "anon-key",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth client components", () => {
  it("uses injected Supabase config and encodes next path in Google redirect", async () => {
    createSupabaseBrowserClient.mockReturnValue(supabaseClient);
    supabaseClient.auth.signInWithOAuth.mockResolvedValue({ error: null });
    const nextPath = "/dashboard/posts?tab=drafts&return=/team settings";

    render(
      createElement(GoogleSignInButton, {
        nextPath,
        supabase: supabaseConfig,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => {
      expect(createSupabaseBrowserClient).toHaveBeenCalledWith(supabaseConfig);
      expect(supabaseClient.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
    });
  });

  it("renders unauthorized initial error", () => {
    createSupabaseBrowserClient.mockReturnValue(supabaseClient);

    render(
      createElement(GoogleSignInButton, {
        initialErrorCode: "unauthorized",
        supabase: supabaseConfig,
      })
    );

    expect(screen.getByText("That sign-in session is not authorized.")).toBeTruthy();
  });

  it("renders Google sign-in errors", async () => {
    createSupabaseBrowserClient.mockReturnValue(supabaseClient);
    supabaseClient.auth.signInWithOAuth.mockResolvedValue({
      error: { message: "OAuth provider unavailable" },
    });

    render(createElement(GoogleSignInButton, { supabase: supabaseConfig }));

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(await screen.findByText("OAuth provider unavailable")).toBeTruthy();
  });

  it("does not sign out unauthorized sessions until the user explicitly resets", async () => {
    createSupabaseBrowserClient.mockReturnValue(supabaseClient);
    supabaseClient.auth.signOut.mockResolvedValue({ error: null });

    render(createElement(UnauthorizedSessionReset, { supabase: supabaseConfig }));

    expect(supabaseClient.auth.signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /use a different google account/i }));

    await waitFor(() => {
      expect(createSupabaseBrowserClient).toHaveBeenCalledWith(supabaseConfig);
      expect(supabaseClient.auth.signOut).toHaveBeenCalledTimes(1);
    });
  });
});
