import { describe, it, expect } from "vitest";
import { maskEmail, redactFilename } from "@/lib/log/redact";

describe("maskEmail", () => {
  it("keeps the domain, masks the local part", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail("a@heyoria.com")).toBe("a***@heyoria.com");
  });

  it("never leaks the full local part", () => {
    const masked = maskEmail("sensitive.person@clinic.org");
    expect(masked).not.toContain("sensitive.person");
    expect(masked.endsWith("@clinic.org")).toBe(true);
  });

  it("handles malformed or empty input without throwing", () => {
    expect(maskEmail("")).toBe("[redacted]");
    expect(maskEmail(null)).toBe("[redacted]");
    expect(maskEmail(undefined)).toBe("[redacted]");
    expect(maskEmail("not-an-email")).toBe("[redacted-email]");
    expect(maskEmail("@nope.com")).toBe("[redacted-email]");
    expect(maskEmail("trailing@")).toBe("[redacted-email]");
  });
});

describe("redactFilename", () => {
  it("keeps only the extension", () => {
    expect(redactFilename("tax_return_2023.pdf")).toBe("[file].pdf");
    expect(redactFilename("Divorce Settlement FINAL.docx")).toBe("[file].docx");
    expect(redactFilename("IMG_4821.HEIC")).toBe("[file].heic");
  });

  it("never leaks the base name", () => {
    expect(redactFilename("salary_negotiation.pdf")).not.toContain("salary");
  });

  it("handles no-extension and empty input", () => {
    expect(redactFilename("receipt")).toBe("[file]");
    expect(redactFilename("")).toBe("[file]");
    expect(redactFilename(null)).toBe("[file]");
    expect(redactFilename(".hidden")).toBe("[file]");
  });
});
