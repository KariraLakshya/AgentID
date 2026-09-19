import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { grantDataCategory } from "./grant-data.js";

describe("grantDataCategory", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server?.close(resolve));
    server = undefined;
  });

  it("posts the agent DID and category to the vault's /data-grants endpoint", async () => {
    let received: { url?: string; body: unknown } | undefined;
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        received = { url: req.url, body: JSON.parse(raw) };
        res.statusCode = 201;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ agentId: "did:web:example:agents:a1", category: "email" }));
      });
    });
    await new Promise<void>((resolve) => server?.listen(4706, "127.0.0.1", resolve));

    const result = await grantDataCategory({
      vaultUrl: "http://127.0.0.1:4706",
      agentDid: "did:web:example:agents:a1",
      category: "email",
    });

    expect(received).toEqual({
      url: "/data-grants",
      body: { agentId: "did:web:example:agents:a1", category: "email" },
    });
    expect(result).toEqual({ agentId: "did:web:example:agents:a1", category: "email" });
  });

  it("throws when the vault rejects the grant request", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "INVALID_INPUT" }));
    });
    await new Promise<void>((resolve) => server?.listen(4707, "127.0.0.1", resolve));

    await expect(
      grantDataCategory({
        vaultUrl: "http://127.0.0.1:4707",
        agentDid: "did:web:example:agents:a1",
        category: "email",
      }),
    ).rejects.toThrow(/grant-data failed.*400/);
  });
});
