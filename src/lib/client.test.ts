/**
 * Tests for the shared JSON fetch helpers (src/lib/client.ts).
 * The global fetch is stubbed per test so the error-envelope contract is
 * exercised without a server.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { deleteJson, getJson, postJson, userMessage } from "@/lib/client";

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let restoreFetch: (() => void) | null = null;
const stubFetch = (impl: (input: string, init?: RequestInit) => Promise<Response>) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
};

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

describe("postJson", () => {
  it("returns the parsed body typed as T on 200", async () => {
    stubFetch(() => Promise.resolve(jsonRes(200, { reply: "all good" })));
    const data = await postJson<{ reply: string }>("/api/chat", { any: "body" });
    expect(data.reply).toBe("all good");
  });

  it("sends the JSON content-type header and the serialised body", async () => {
    let seenInit: RequestInit | undefined;
    let seenUrl = "";
    stubFetch((input, init) => {
      seenUrl = input;
      seenInit = init;
      return Promise.resolve(jsonRes(201, { ok: true }));
    });
    await postJson("/api/family", { name: "Asha" });
    expect(seenUrl).toBe("/api/family");
    expect((seenInit as RequestInit).method).toBe("POST");
    expect(
      (seenInit as RequestInit).headers
    ).toMatchObject({ "Content-Type": "application/json" });
    expect((seenInit as RequestInit).body).toBe('{"name":"Asha"}');
  });

  it("throws the server's error message on a 4xx", async () => {
    stubFetch(() => Promise.resolve(jsonRes(400, { error: "Invalid request at \"city\"" })));
    expect(postJson("/api/chat", {})).rejects.toThrow('Invalid request at "city"');
  });

  it("falls back to a status message when the error body is not JSON", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response("<html>Bad Gateway</html>", { status: 502 })
      )
    );
    expect(postJson("/api/chat", {})).rejects.toThrow("Request failed (502)");
  });

  it("ignores an empty error field and uses the status fallback", async () => {
    stubFetch(() => Promise.resolve(jsonRes(500, {})));
    expect(postJson("/api/chat", {})).rejects.toThrow("Request failed (500)");
  });

  it("wraps network failures in a Network error", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(postJson("/api/chat", {})).rejects.toThrow("Failed to fetch");
    stubFetch(() => Promise.reject("cable unplugged")); // non-Error rejection
    expect(postJson("/api/chat", {})).rejects.toThrow("Network error");
  });
});

describe("getJson", () => {
  it("returns the parsed body on 200", async () => {
    stubFetch(() => Promise.resolve(jsonRes(200, [{ id: "1" }])));
    const data = await getJson<Array<{ id: string }>>("/api/routine");
    expect(data).toHaveLength(1);
  });

  it("throws the server message on error", async () => {
    stubFetch(() => Promise.resolve(jsonRes(400, { error: "Unknown city \"x\"" })));
    expect(getJson("/api/air-quality")).rejects.toThrow('Unknown city "x"');
  });
});

describe("deleteJson", () => {
  it("resolves on 200 and throws the server message on failure", async () => {
    stubFetch((input, init) => {
      expect(input).toBe("/api/family/abc");
      expect(init?.method).toBe("DELETE");
      return Promise.resolve(jsonRes(200, { ok: true }));
    });
    await deleteJson("/api/family/abc");

    stubFetch(() => Promise.resolve(jsonRes(404, { error: "Member not found" })));
    expect(deleteJson("/api/family/abc")).rejects.toThrow("Member not found");
  });
});

describe("userMessage", () => {
  it("keeps the message of a known Error", () => {
    expect(userMessage(new Error("Rate limited"), "fallback")).toBe("Rate limited");
  });

  it("uses the fallback for non-Error values", () => {
    expect(userMessage("string throw", "fallback")).toBe("fallback");
    expect(userMessage(undefined, "fallback")).toBe("fallback");
  });

  it("uses the fallback for an Error with an empty message", () => {
    expect(userMessage(new Error(""), "fallback")).toBe("fallback");
  });
});
