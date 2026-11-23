import { describe, expect, it } from "vitest";
import { cleanLink, isGoogleDrive, parseScope, scopeValue, sopApplies, sopFileProblem } from "../src/lib/sops";

describe("SOP scope", () => {
  it("reads the form value", () => {
    expect(parseScope("")).toEqual({ clientId: null, locationId: null });
    expect(parseScope("client:abc")).toEqual({ clientId: "abc", locationId: null });
    expect(parseScope("location:xyz")).toEqual({ clientId: null, locationId: "xyz" });
    expect(parseScope("client:")).toEqual({ clientId: null, locationId: null });
    expect(scopeValue(parseScope("location:xyz"))).toBe("location:xyz");
  });
  it("company SOPs apply everywhere, client SOPs at that client's sites, location SOPs at one site", () => {
    const site = { id: "L1", clientId: "C1" };
    expect(sopApplies({ clientId: null, locationId: null }, site)).toBe(true);
    expect(sopApplies({ clientId: "C1", locationId: null }, site)).toBe(true);
    expect(sopApplies({ clientId: "C2", locationId: null }, site)).toBe(false);
    expect(sopApplies({ clientId: null, locationId: "L1" }, site)).toBe(true);
    expect(sopApplies({ clientId: null, locationId: "L2" }, site)).toBe(false);
    expect(sopApplies({ clientId: "C1", locationId: null }, { id: "L9", clientId: null })).toBe(false);
  });
});

describe("SOP links and files", () => {
  it("tidies pasted links", () => {
    expect(cleanLink("  ")).toBeNull();
    expect(cleanLink("docs.google.com/document/d/1/edit")).toBe("https://docs.google.com/document/d/1/edit");
    expect(cleanLink("http://example.com/a")).toBe("https://example.com/a");
    expect(() => cleanLink("javascript:alert(1)")).toThrow();
    expect(() => cleanLink("not a link")).toThrow();
  });
  it("knows a Google Drive link", () => {
    expect(isGoogleDrive("https://drive.google.com/file/d/1/view")).toBe(true);
    expect(isGoogleDrive("https://docs.google.com/document/d/1")).toBe(true);
    expect(isGoogleDrive("https://evil-docs.google.com.example.com/x")).toBe(false);
  });
  it("checks uploads", () => {
    expect(sopFileProblem({ name: "Opening checklist.pdf", size: 1000 })).toBeNull();
    expect(sopFileProblem({ name: "run.exe", size: 1000 })).toMatch(/isn't supported/);
    expect(sopFileProblem({ name: "big.pdf", size: 9_000_000 })).toMatch(/7 MB/);
  });
});
