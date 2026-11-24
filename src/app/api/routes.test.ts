/**
 * Route-handler integration tests.
 *
 * Each API route handler is invoked directly with a real NextRequest; the
 * Prisma client (`@/lib/db`), the LLM wrapper (`@/lib/ai`) and the live-data
 * fetcher (`@/lib/air-quality-server`) are replaced with deterministic
 * mocks via `mock.module`, so every test exercises the route's own logic —
 * guard, validation, domain computation and response shaping — end-to-end
 * with zero network and zero database.
 */
import { describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";
import type { AirQualitySnapshot } from "@/lib/aqi";

// ---------------------------------------------------------------------------
// Deterministic fixtures
// ---------------------------------------------------------------------------

const snapshot: AirQualitySnapshot = {
  city: { id: "delhi", name: "Delhi", state: "NCT of Delhi", lat: 28.6139, lon: 77.209 },
  source: "open-meteo",
  updatedAt: "2026-11-25T08:00:00.000Z",
  current: {
    aqi: 194,
    category: "moderate",
    dominant: "pm25",
    pollutants: [
      {
        key: "pm25",
        name: "PM2.5",
        value: 88.2,
        unit: "µg/m³",
        subIndex: 194,
        category: "moderate",
        inOverall: true,
      },
    ],
  },
  hourly: [
    { time: "2026-11-25T07:00:00+05:30", pm25: 90, aqi: 200, category: "poor", future: false },
    { time: "2026-11-25T08:00:00+05:30", pm25: 80, aqi: 180, category: "moderate", future: true },
    { time: "2026-11-25T09:00:00+05:30", pm25: 70, aqi: 160, category: "moderate", future: true },
    { time: "2026-11-25T10:00:00+05:30", pm25: 60, aqi: 140, category: "moderate", future: true },
  ],
  bestWindows: [{ startHour: 9, endHour: 11, avgAqi: 150, label: "9–11 am" }],
};

interface FamilyRow {
  id: string;
  name: string;
  ageGroup: string;
  conditions: string;
  createdAt: Date;
  updatedAt: Date;
}

const familyRows: FamilyRow[] = [
  {
    id: "m1",
    name: "Asha",
    ageGroup: "senior",
    conditions: "heart",
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-01T00:00:00Z"),
  },
];

const created: { data: unknown }[] = [];
const chatReply = "MOCK REPLY";
let chatShouldThrow = false;

// ---------------------------------------------------------------------------
// Module mocks (must run before the routes are imported)
// ---------------------------------------------------------------------------

mock.module("@/lib/db", () => ({
  db: {
    familyMember: {
      findMany: async () => familyRows,
      create: async ({ data }: { data: unknown }) => {
        created.push({ data });
        return {
          id: "m2",
          ...(data as object),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
    routine: {
      findMany: async () => [{ id: "r1", city: "Delhi", aqi: 194, aqiLabel: "Moderate", memberSummary: "No saved members", content: "plan", createdAt: new Date() }],
      create: async ({ data }: { data: unknown }) => ({
        id: "r2",
        ...(data as object),
        createdAt: new Date(),
      }),
    },
    indoorPlan: {
      create: async ({ data }: { data: unknown }) => ({
        id: "p1",
        ...(data as object),
        createdAt: new Date(),
      }),
    },
  },
}));

mock.module("@/lib/ai", () => ({
  BASE_SYSTEM_PROMPT: "MOCK SYSTEM PROMPT",
  getZAI: async () => ({}),
  chatComplete: async () => {
    if (chatShouldThrow) throw new Error("LLM down");
    return chatReply;
  },
  buildAqiContext: async () => ({
    text: "MOCK AQI CONTEXT",
    aqi: snapshot.current.aqi,
    aqiLabel: "Moderate",
    cityName: "Delhi",
  }),
  buildFamilyContext: async () => ({ summary: "MOCK FAMILY", count: familyRows.length }),
}));

mock.module("@/lib/air-quality-server", () => ({
  getAirQuality: async () => snapshot,
  snapshotToContext: () => "MOCK CONTEXT",
  snapshotToContextBrief: () => "MOCK BRIEF",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unique IP per request so in-memory rate-limit buckets never collide. */
let ipSeq = 0;
const nextIp = () => `192.168.${Math.floor(ipSeq / 256) % 256}.${(ipSeq += 1)}`;

function req(
  url: string,
  body?: unknown,
  opts: { raw?: string } = {}
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": nextIp(),
    },
    body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  }) as NextRequest;
}

async function get(
  url: string,
  init?: { method?: string }
): Promise<{ status: number; body: unknown }> {
  const { GET, POST } = await import(url2import(url));
  const handler = init?.method === "POST" ? POST : GET;
  const request = new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers: { "x-forwarded-for": nextIp() },
  }) as NextRequest;
  const res = await handler(request);
  return { status: res.status, body: await res.json() };
}

/** Map a test URL to the route module that serves it. */
function url2import(url: string): string {
  if (url.startsWith("/api/air-quality")) return "@/app/api/air-quality/route";
  if (url.startsWith("/api/chat")) return "@/app/api/chat/route";
  if (url.startsWith("/api/family")) return "@/app/api/family/route";
  if (url.startsWith("/api/routine")) return "@/app/api/routine/route";
  if (url.startsWith("/api/indoor-plan")) return "@/app/api/indoor-plan/route";
  if (url.startsWith("/api/commute")) return "@/app/api/commute/route";
  throw new Error(`no route module mapped for ${url}`);
}

async function post(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const { POST } = await import(url2import(url));
  const res = await POST(req(url, body));
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/air-quality", () => {
  it("returns the (mocked) snapshot for a valid city", async () => {
    const { status, body } = await get("/api/air-quality?city=delhi");
    expect(status).toBe(200);
    expect((body as AirQualitySnapshot).current.aqi).toBe(194);
  });

  it("rejects an unknown city with 400 and the valid id list", async () => {
    const { status, body } = await get("/api/air-quality?city=london");
    expect(status).toBe(400);
    expect((body as { error: string }).error).toContain("Valid ids: delhi");
  });
});

describe("POST /api/chat", () => {
  const valid = { city: "delhi", messages: [{ role: "user", content: "hi" }] };

  it("returns the coach reply on success", async () => {
    const { status, body } = await post("/api/chat", valid);
    expect(status).toBe(200);
    expect((body as { reply: string }).reply).toBe("MOCK REPLY");
  });

  it("rejects an invalid city enum with 400", async () => {
    const { status } = await post("/api/chat", { ...valid, city: "london" });
    expect(status).toBe(400);
  });

  it("rejects an empty messages array with 400", async () => {
    const { status, body } = await post("/api/chat", { city: "delhi", messages: [] });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toContain("messages");
  });

  it("maps an LLM failure to 502 with the friendly message", async () => {
    chatShouldThrow = true;
    try {
      const { status, body } = await post("/api/chat", valid);
      expect(status).toBe(502);
      expect((body as { error: string }).error).toContain("temporarily unavailable");
    } finally {
      chatShouldThrow = false;
    }
  });
});

describe("GET/POST /api/family", () => {
  it("lists members with computed sensitivity", async () => {
    const { status, body } = await get("/api/family");
    expect(status).toBe(200);
    const members = body as Array<{ name: string; sensitivity: { band: string } }>;
    expect(members).toHaveLength(1);
    expect(members[0].name).toBe("Asha");
    expect(members[0].sensitivity.band).toBe("high"); // senior + heart condition
  });

  it("creates a member with 201 and returns sensitivity", async () => {
    const { status, body } = await post("/api/family", {
      name: "Vihaan",
      ageGroup: "child",
      conditions: ["asthma"],
    });
    expect(status).toBe(201);
    expect((body as { name: string }).name).toBe("Vihaan");
    expect((body as { sensitivity: object }).sensitivity).toBeDefined();
  });

  it("persists conditions as a comma-joined string", async () => {
    await post("/api/family", { name: "Zoya", ageGroup: "adult", conditions: ["asthma", "diabetes"] });
    const last = created.at(-1)?.data as { conditions: string };
    expect(last.conditions).toBe("asthma,diabetes");
  });

  it("rejects an invalid age group with 400", async () => {
    const { status } = await post("/api/family", { name: "X", ageGroup: "toddler" });
    expect(status).toBe(400);
  });

  it("rejects a name over 40 chars with 400", async () => {
    const { status } = await post("/api/family", { name: "x".repeat(41), ageGroup: "adult" });
    expect(status).toBe(400);
  });
});

describe("GET /api/routine", () => {
  it("returns the persisted routine history, newest first", async () => {
    const { status, body } = await get("/api/routine");
    expect(status).toBe(200);
    const routines = body as Array<{ city: string; aqi: number; content: string }>;
    expect(routines.length).toBeGreaterThan(0);
    expect(routines[0].city).toBe("Delhi");
    expect(routines[0].aqi).toBe(194);
    expect(routines[0].content).toBe("plan");
  });
});

describe("POST /api/routine", () => {
  const valid = { city: "delhi", dayType: "workday", mode: "balanced" };

  it("generates and persists a routine with 201", async () => {
    const { status, body } = await post("/api/routine", valid);
    expect(status).toBe(201);
    const routine = body as { city: string; aqi: number; content: string };
    expect(routine.city).toBe("Delhi");
    expect(routine.aqi).toBe(194);
    expect(routine.content).toBe("MOCK REPLY");
  });

  it("rejects an invalid day type with 400", async () => {
    const { status } = await post("/api/routine", { ...valid, dayType: "holiday" });
    expect(status).toBe(400);
  });

  it("maps an LLM failure to 502 with the friendly message", async () => {
    chatShouldThrow = true;
    try {
      const { status, body } = await post("/api/routine", valid);
      expect(status).toBe(502);
      expect((body as { error: string }).error).toContain("Please try again");
    } finally {
      chatShouldThrow = false;
    }
  });
});

describe("POST /api/indoor-plan", () => {
  const valid = {
    city: "delhi",
    rooms: 3,
    hasPurifier: false,
    hasAC: true,
    budget: "low",
    cooking: "gas",
  };

  it("generates and persists a plan with 201", async () => {
    const { status, body } = await post("/api/indoor-plan", valid);
    expect(status).toBe(201);
    const plan = body as { homeInfo: string; content: string };
    expect(plan.homeInfo).toContain("3 rooms");
    expect(plan.content).toBe("MOCK REPLY");
  });

  it("rejects rooms out of bounds with 400", async () => {
    const { status } = await post("/api/indoor-plan", { ...valid, rooms: 11 });
    expect(status).toBe(400);
  });
});

describe("POST /api/commute", () => {
  const valid = {
    city: "delhi",
    origin: "delhi-cp",
    destination: "delhi-dwarka",
    departure: "now",
    preference: "balanced",
  };

  it("plans a trip with ranked options and narration", async () => {
    const { status, body } = await post("/api/commute", valid);
    expect(status).toBe(200);
    const res = body as {
      options: Array<{ mode: string; score: number }>;
      narration: string | null;
      sensitiveMembers: string[];
    };
    expect(res.options.length).toBeGreaterThan(3);
    expect(res.narration).toBe("MOCK REPLY");
    // Asha (senior + heart) is flagged as sensitive.
    expect(res.sensitiveMembers).toContain("Asha");
  });

  it("rejects identical origin and destination with 400", async () => {
    const { status, body } = await post("/api/commute", {
      ...valid,
      destination: "delhi-cp",
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toContain("two different areas");
  });

  it("rejects a zone from another city with 400", async () => {
    const { status } = await post("/api/commute", {
      ...valid,
      destination: "ggn-cyber",
    });
    expect(status).toBe(400);
  });

  it("rejects an invalid preference enum with 400", async () => {
    const { status } = await post("/api/commute", { ...valid, preference: "fastest" });
    expect(status).toBe(400);
  });

  it("still ships ranked options when the narration LLM fails", async () => {
    chatShouldThrow = true;
    try {
      const { status, body } = await post("/api/commute", valid);
      expect(status).toBe(200); // deterministic ranking still returns
      const res = body as { options: unknown[]; narration: string | null };
      expect(res.options.length).toBeGreaterThan(0);
      expect(res.narration).toBeNull();
    } finally {
      chatShouldThrow = false;
    }
  });
});
