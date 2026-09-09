// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }),
  }),
}));
import handler from "../../api/admin-user-management";

const request = (authorization?: string, method = "POST") => new Request("https://wams.test/api/admin-user-management", {
  method,
  headers: authorization ? { Authorization: authorization } : {},
});

beforeEach(() => vi.resetAllMocks());

describe("employee administration authorization", () => {
  it("rejects requests without a session", async () => {
    expect((await handler.fetch(request())).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects methods that should not mutate accounts", async () => {
    expect((await handler.fetch(request(undefined, "GET"))).status).toBe(405);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("validates the supplied token with Supabase", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "Invalid session" } });
    expect((await handler.fetch(request("Bearer invalid-token"))).status).toBe(401);
    expect(mocks.getUser).toHaveBeenCalledWith("invalid-token");
  });
  it("denies authenticated users who are not administrators", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "employee-id" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const response = await handler.fetch(request("Bearer employee-token"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Admin role required" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
