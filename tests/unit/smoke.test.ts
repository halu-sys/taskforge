import { describe, it, expect } from "vitest";
import net from "net";

describe("test harness", () => {
  it("TEST_DATABASE_URL is set and Postgres is reachable", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.pathname).toBe("/taskforge_test");
    await new Promise<void>((res, rej) => {
      const s = net.connect(Number(url.port), url.hostname);
      s.on("connect", () => { s.end(); res(); });
      s.on("error", rej);
    });
  });
});
