import { afterEach, describe, expect, it, vi } from "vitest";
import { errorMessage, formatDate, formatTime, friendlyDbError, todayLocal } from "@/lib/utils";

describe("todayLocal", () => {
  afterEach(() => vi.useRealTimers());
  it("returns the local calendar date, not the UTC one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 7, 0, 30));
    expect(todayLocal()).toBe("2026-03-07");
  });
});

describe("formatTime and formatDate", () => {
  it("formats times and dates", () => {
    expect(formatTime("08:40:00")).toBe("08:40");
    expect(formatDate("2026-12-01")).toBe(new Date(2026, 11, 1).toLocaleDateString());
    expect(formatDate(null)).toBe("—");
  });
});

describe("error messages", () => {
  it("reads Error and Supabase-style errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "This class already has Mathematics 08:00–08:40 on Monday" })).toContain("Mathematics");
  });
  it("explains blocked deletes and duplicates", () => {
    expect(friendlyDbError({ message: 'update or delete on table "terms" violates foreign key constraint "results_term_id_fkey"' }))
      .toContain("results or attendance records depend on it");
    expect(friendlyDbError({ message: 'duplicate key value violates unique constraint "classes_name_key"' })).toBe("That already exists.");
  });
});
