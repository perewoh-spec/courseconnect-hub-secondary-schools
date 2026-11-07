import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supabase errors and thrown values both have a message; fall back to a generic one.
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Something went wrong";
}

// "09:30:00" -> "09:30"
export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}

// Today's date as YYYY-MM-DD in the user's own timezone (toISOString() would give the UTC date).
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Formats a YYYY-MM-DD date column without shifting it a day in timezones west of UTC.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

// Friendlier text for common database errors.
export function friendlyDbError(error: unknown): string {
  const msg = errorMessage(error);
  if (msg.includes("violates foreign key constraint") && msg.includes("delete")) {
    return "This can't be deleted because results or attendance records depend on it.";
  }
  if (msg.includes("duplicate key")) return "That already exists.";
  return msg;
}
