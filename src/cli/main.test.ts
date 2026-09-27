import { describe, it, expect, vi, afterEach } from "vitest";
import { main, COMMANDS } from "./main";
import packageJson from "../../package.json";

afterEach(() => vi.restoreAllMocks());

describe("main", () => {
  it("prints the package version for --version and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await main(["--version"])).toBe(0);
    expect(log).toHaveBeenCalledWith(packageJson.version);
  });

  it("prints usage naming every command for --help and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await main(["--help"])).toBe(0);
    const text = log.mock.calls.map((c) => String(c[0])).join("\n");
    for (const name of Object.keys(COMMANDS)) expect(text).toContain(`marey ${name}`);
  });

  it("prints usage to stderr and exits 1 with no arguments", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main([])).toBe(1);
    expect(String(err.mock.calls[0][0])).toContain("marey check");
  });

  it("names an unknown command and lists the real ones", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main(["frobnicate"])).toBe(1);
    const text = String(err.mock.calls[0][0]);
    expect(text).toContain("Unknown command 'frobnicate'");
    expect(text).toContain("check");
  });

  it("dispatches check with the arguments after the command name", async () => {
    const spy = vi.spyOn(COMMANDS, "check").mockResolvedValue(0);
    await main(["check", "--export-ready", "a.marey"]);
    expect(spy).toHaveBeenCalledWith(["--export-ready", "a.marey"]);
  });
});
