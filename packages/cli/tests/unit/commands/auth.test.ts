import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mock = vi.fn;

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;
let storage: typeof import("../../../src/auth/storage");

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "clip-cmd-auth-test-"));
  process.env.CLIP_HOME = tempDir;
  storage = await import("../../../src/auth/storage");
});

afterAll(async () => {
  delete process.env.CLIP_HOME;
  await rm(tempDir, { recursive: true, force: true });
});

describe("authSet", () => {
  it("saves credentials when --key and --header are provided", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    await authSet("test-alias", {
      key: "sk-test-123",
      header: "X-API-Key",
    });

    const creds = await storage.loadCredentials("test-alias");
    expect(creds).toEqual({
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-test-123",
    });
  });

  it("exits with error when no header name and no clip.yaml", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authSet("no-header-alias", { key: "some-key" });
    } catch {
      // Expected — process.exit mock throws
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("--header");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("reads headerName from clip.yaml when --header is omitted", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    const {
      writeFile,
      mkdtemp: _mkdtemp,
      rm: _rm,
    } = await import("node:fs/promises");
    const yamlDir = await _mkdtemp(join(tmpdir(), "clip-header-yaml-"));
    await writeFile(
      join(yamlDir, "clip.yaml"),
      [
        'name: "Hdr API"',
        "alias: hdr-api",
        'version: "1.0.0"',
        'baseUrl: "https://example.com"',
        "auth:",
        "  type: header",
        '  headerName: "X-Custom-Key"',
        "endpoints:",
        "  - name: ping",
        "    method: GET",
        "    path: /ping",
        '    description: "Ping"',
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    process.chdir(yamlDir);

    try {
      await authSet("hdr-from-yaml", { key: "value-from-yaml" });
    } finally {
      process.chdir(originalCwd);
      await _rm(yamlDir, { recursive: true, force: true });
    }

    const creds = await storage.loadCredentials("hdr-from-yaml");
    expect(creds).toEqual({
      type: "header",
      headerName: "X-Custom-Key",
      headerValue: "value-from-yaml",
    });
  });

  it("saves credentials with custom header name", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    await authSet("custom-header-alias", {
      key: "bearer-token-xyz",
      header: "Authorization",
    });

    const creds = await storage.loadCredentials("custom-header-alias");
    expect(creds).toEqual({
      type: "header",
      headerName: "Authorization",
      headerValue: "bearer-token-xyz",
    });
  });
});

describe("authShow", () => {
  it("displays masked credentials for existing alias", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    await storage.saveCredentials("show-test", {
      type: "header",
      headerName: "Authorization",
      headerValue: "Bearer sk-abcdef123456",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authShow("show-test");

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("show-test");
    expect(output).toContain("Authorization");
    // Value should be masked, not plain text
    expect(output).toContain("****");
    expect(output).not.toContain("sk-abcdef123456");
  });

  it("displays browser-login credentials without email or expiry", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    await storage.saveCredentials("browser-login-bare", {
      type: "browser-login",
      token: "bare-token-1234567890",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authShow("browser-login-bare");

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("browser-login");
    expect(output).not.toContain("Email:");
    expect(output).not.toContain("Expires:");
    expect(output).toContain("****");
  });

  it("displays browser-login credentials with email and expiry", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    await storage.saveCredentials("browser-login-show", {
      type: "browser-login",
      token: "browser-login-token-1234567890",
      email: "user@example.com",
      expiresAt: "2099-01-01T00:00:00Z",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authShow("browser-login-show");

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("browser-login");
    expect(output).toContain("user@example.com");
    expect(output).toContain("2099-01-01");
    expect(output).toContain("****");
    expect(output).not.toContain("browser-login-token-1234567890");
  });

  it("displays cf-access credentials with both client id and secret masked", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    await storage.saveCredentials("cfa-show", {
      type: "cf-access",
      clientId: "abcdef1234567890.access",
      clientSecret: "supersecretvalue1234",
      clientIdHeader: "CF-Access-Client-Id",
      clientSecretHeader: "CF-Access-Client-Secret",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authShow("cfa-show");

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("cf-access");
    expect(output).toContain("CF-Access-Client-Id");
    expect(output).toContain("CF-Access-Client-Secret");
    expect(output).toContain("****");
    expect(output).not.toContain("supersecretvalue1234");
  });
  it("exits with error for nonexistent alias", async () => {
    const { authShow } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authShow("nonexistent-alias");
    } catch {
      // Expected
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("No credentials found");

    process.exit = originalExit;
    console.error = originalError;
  });
});

describe("authRemove", () => {
  it("removes credentials with --force flag", async () => {
    const { authRemove } = await import("../../../src/commands/auth");

    await storage.saveCredentials("remove-test", {
      type: "header",
      headerName: "X-API-Key",
      headerValue: "sk-to-remove",
    });

    const logMock = mock();
    const originalLog = console.log;
    console.log = logMock;

    await authRemove("remove-test", { force: true });

    console.log = originalLog;

    const output = logMock.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(output).toContain("Credentials removed");

    // Verify actually removed
    const creds = await storage.loadCredentials("remove-test");
    expect(creds).toBeNull();
  });

  it("reports error when removing nonexistent alias", async () => {
    const { authRemove } = await import("../../../src/commands/auth");

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    await authRemove("totally-nonexistent", { force: true });

    console.error = originalError;

    expect(errorMock.mock.calls[0][0]).toContain("No credentials found");
  });
});

describe("authLogin", () => {
  const browserLoginSchema = {
    name: "Test",
    alias: "test-browser-login",
    version: "1.0.0",
    baseUrl: "https://example.com",
    auth: {
      type: "browser-login" as const,
      tokenParam: "api_key",
      loginPath: "/api/auth/cli",
      headerName: "Authorization",
      headerPrefix: "Bearer",
    },
    endpoints: [
      {
        name: "ping",
        method: "GET" as const,
        path: "/ping",
        description: "Ping",
      },
    ],
  };

  it("saves browser-login credentials when login succeeds", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const performLogin = mock(
      async (deps: { onSaveToken: (t: string) => void }) => {
        deps.onSaveToken("browser-login-token-xyz");
        return { success: true, email: "user@example.com" };
      },
    );
    const openBrowser = mock(async () => {});

    await authLogin("login-success", {
      parseSchema: async () => browserLoginSchema,
      // biome-ignore lint/suspicious/noExplicitAny: test mock typing
      performLogin: performLogin as any,
      openBrowser,
    });

    expect(performLogin).toHaveBeenCalled();
    const creds = await storage.loadCredentials("login-success");
    expect(creds).toEqual({
      type: "browser-login",
      token: "browser-login-token-xyz",
      email: "user@example.com",
    });
  });

  it("exits with error when login fails", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    const performLogin = mock(async () => ({
      success: false,
      error: "user cancelled",
    }));

    try {
      await authLogin("login-fail", {
        parseSchema: async () => browserLoginSchema,
        // biome-ignore lint/suspicious/noExplicitAny: test mock typing
        performLogin: performLogin as any,
        openBrowser: mock(async () => {}),
      });
    } catch {
      // expected — exit mock throws
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("Login failed");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("uses fallback message when login fails without an error string", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authLogin("login-no-msg", {
        parseSchema: async () => browserLoginSchema,
        // biome-ignore lint/suspicious/noExplicitAny: test mock typing
        performLogin: mock(async () => ({ success: false })) as any,
        openBrowser: mock(async () => {}),
      });
    } catch {
      // expected
    }

    expect(errorMock.mock.calls[0][0]).toContain("no token received");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("rejects header-auth schemas", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authLogin("wrong-type", {
        parseSchema: async () => ({
          ...browserLoginSchema,
          auth: { type: "header" as const, headerName: "X-API-Key" },
        }),
        performLogin: mock(async () => ({ success: true })) as never,
        openBrowser: mock(async () => {}),
      });
    } catch {
      // expected
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("header authentication");

    process.exit = originalExit;
    console.error = originalError;
  });

  it("uses loginUrl origin and pathname when provided", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const captured: { apiUrl?: string; loginPath?: string } = {};
    const performLogin = mock(
      async (deps: {
        apiUrl: string;
        loginPath: string;
        onSaveToken: (t: string) => void;
      }) => {
        captured.apiUrl = deps.apiUrl;
        captured.loginPath = deps.loginPath;
        deps.onSaveToken("t");
        return { success: true };
      },
    );

    await authLogin("login-url", {
      parseSchema: async () => ({
        ...browserLoginSchema,
        auth: {
          ...browserLoginSchema.auth,
          loginUrl: "https://saas.example.org/custom/login",
        },
      }),
      // biome-ignore lint/suspicious/noExplicitAny: test mock typing
      performLogin: performLogin as any,
      openBrowser: mock(async () => {}),
    });

    expect(captured).toEqual({
      apiUrl: "https://saas.example.org",
      loginPath: "/custom/login",
    });
  });

  it("uses loginPath when loginUrl is omitted", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const captured: { apiUrl?: string; loginPath?: string } = {};
    const performLogin = mock(
      async (deps: {
        apiUrl: string;
        loginPath: string;
        onSaveToken: (t: string) => void;
      }) => {
        captured.apiUrl = deps.apiUrl;
        captured.loginPath = deps.loginPath;
        deps.onSaveToken("t");
        return { success: true };
      },
    );

    await authLogin("plain-login", {
      parseSchema: async () => browserLoginSchema,
      // biome-ignore lint/suspicious/noExplicitAny: test mock typing
      performLogin: performLogin as any,
      openBrowser: mock(async () => {}),
    });

    expect(captured).toEqual({
      apiUrl: "https://example.com",
      loginPath: "/api/auth/cli",
    });
  });

  it("CLIP_BASE_URL overrides apiUrl for self-hosted deployments", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const captured: { apiUrl?: string; loginPath?: string } = {};
    const performLogin = mock(
      async (deps: {
        apiUrl: string;
        loginPath: string;
        onSaveToken: (t: string) => void;
      }) => {
        captured.apiUrl = deps.apiUrl;
        captured.loginPath = deps.loginPath;
        deps.onSaveToken("t");
        return { success: true };
      },
    );

    const original = process.env.CLIP_BASE_URL;
    process.env.CLIP_BASE_URL = "https://self-hosted.example.com";
    try {
      await authLogin("plain-login", {
        parseSchema: async () => browserLoginSchema,
        // biome-ignore lint/suspicious/noExplicitAny: test mock typing
        performLogin: performLogin as any,
        openBrowser: mock(async () => {}),
      });
    } finally {
      if (original === undefined) delete process.env.CLIP_BASE_URL;
      else process.env.CLIP_BASE_URL = original;
    }

    // loginPath stays the same; apiUrl flips to the env override regardless
    // of what schema.baseUrl said. Self-hosters set CLIP_BASE_URL once and
    // every CLI call — including login — targets their worker.
    expect(captured.apiUrl).toBe("https://self-hosted.example.com");
    expect(captured.loginPath).toBe("/api/auth/cli");
  });

  it("exits when clip.yaml cannot be parsed", async () => {
    const { authLogin } = await import("../../../src/commands/auth");

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authLogin("missing-yaml", {
        parseSchema: async () => {
          throw new Error("ENOENT: clip.yaml not found");
        },
        performLogin: mock(async () => ({ success: true })) as never,
        openBrowser: mock(async () => {}),
      });
    } catch {
      // expected — exit mock throws
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("clip.yaml");

    process.exit = originalExit;
    console.error = originalError;
  });
});

describe("authSet — browser-login schema rejection", () => {
  it("rejects when clip.yaml declares browser-login auth and no --header is given", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    // Write an browser-login clip.yaml in cwd so authSet's parser finds it
    const {
      writeFile,
      mkdtemp: _mkdtemp,
      rm: _rm,
    } = await import("node:fs/promises");
    const browserLoginDir = await _mkdtemp(
      join(tmpdir(), "clip-browser-login-yaml-"),
    );
    const yamlPath = join(browserLoginDir, "clip.yaml");
    await writeFile(
      yamlPath,
      [
        'name: "browser-login API"',
        "alias: browser-login-api",
        'version: "1.0.0"',
        'baseUrl: "https://example.com"',
        "auth:",
        "  type: browser-login",
        "  tokenParam: api_key",
        '  loginPath: "/api/auth/cli"',
        '  headerName: "Authorization"',
        '  headerPrefix: "Bearer"',
        "endpoints:",
        "  - name: ping",
        "    method: GET",
        "    path: /ping",
        '    description: "Ping"',
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    process.chdir(browserLoginDir);

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    try {
      await authSet("rejects-browser-login", { key: "irrelevant" });
    } catch {
      // expected — exit mock throws
    } finally {
      process.chdir(originalCwd);
      process.exit = originalExit;
      console.error = originalError;
      await _rm(browserLoginDir, { recursive: true, force: true });
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("browser-login");
  });
});

describe("authSet — cf-access schema rejection", () => {
  it("rejects when only --client-id is given without --client-secret", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    const {
      writeFile,
      mkdtemp: _mkdtemp,
      rm: _rm,
    } = await import("node:fs/promises");
    const cfDir = await _mkdtemp(join(tmpdir(), "clip-cfa-yaml-"));
    await writeFile(
      join(cfDir, "clip.yaml"),
      [
        'name: "CF API"',
        "alias: cf-api",
        'version: "1.0.0"',
        'baseUrl: "https://example.com"',
        "auth:",
        "  type: cf-access",
        "endpoints:",
        "  - name: ping",
        "    method: GET",
        "    path: /ping",
        '    description: "Ping"',
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    process.chdir(cfDir);

    const exitMock = mock(() => {
      throw new Error("process.exit called");
    });
    const originalExit = process.exit;
    process.exit = exitMock as never;

    const errorMock = mock();
    const originalError = console.error;
    console.error = errorMock;

    // Force the prompt path to short-circuit by providing one but not the
    // other AND treating empty as missing.
    try {
      await authSet("rejects-cfa", {
        clientId: "abc.access",
        clientSecret: "",
      });
    } catch {
      // expected — exit mock throws
    } finally {
      process.chdir(originalCwd);
      await _rm(cfDir, { recursive: true, force: true });
      process.exit = originalExit;
      console.error = originalError;
    }

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock.mock.calls[0][0]).toContain("--client-id");
  });

  it("saves cf-access creds when --client-id and --client-secret are provided", async () => {
    const { authSet } = await import("../../../src/commands/auth");

    const {
      writeFile,
      mkdtemp: _mkdtemp,
      rm: _rm,
    } = await import("node:fs/promises");
    const cfDir = await _mkdtemp(join(tmpdir(), "clip-cfa-save-"));
    await writeFile(
      join(cfDir, "clip.yaml"),
      [
        'name: "CF API"',
        "alias: cf-api",
        'version: "1.0.0"',
        'baseUrl: "https://example.com"',
        "auth:",
        "  type: cf-access",
        '  clientIdHeader: "X-Cf-Id"',
        '  clientSecretHeader: "X-Cf-Secret"',
        "endpoints:",
        "  - name: ping",
        "    method: GET",
        "    path: /ping",
        '    description: "Ping"',
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    process.chdir(cfDir);

    try {
      await authSet("cfa-save", {
        clientId: "abc.access",
        clientSecret: "topsecret",
      });
    } finally {
      process.chdir(originalCwd);
      await _rm(cfDir, { recursive: true, force: true });
    }

    const creds = await storage.loadCredentials("cfa-save");
    expect(creds).toEqual({
      type: "cf-access",
      clientId: "abc.access",
      clientSecret: "topsecret",
      clientIdHeader: "X-Cf-Id",
      clientSecretHeader: "X-Cf-Secret",
    });
  });
});
