import { describe, expect, it } from "vitest";
import { formatPkMobile, parsePkMobile, sanitizePhoneInput } from "./phone";

const LRI = "⁦";
const PDI = "⁩";

describe("parsePkMobile", () => {
  it.each([
    ["0300 1234567"],
    ["03001234567"],
    ["300 1234567"],
    ["92 300 1234567"],
    ["+92 300 1234567"],
    ["0092 300 1234567"],
    ["+92-300-1234567"],
    [" (0300) 123-4567 "],
  ])("accepts %j as +923001234567", (input) => {
    expect(parsePkMobile(input)).toEqual({ ok: true, e164: "+923001234567" });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["0300 12345a7", "digitsOnly"],
    ["+44 7700 900123", "notPakistan"],
    ["92 300 123456", "length92"],
    ["0300 123456", "length0"],
    ["300 123456", "length10"],
    ["+92 300 123456", "lengthAfter92"],
    ["0092 300 12345678", "lengthAfter92"],
    ["0421 2345678", "notMobile"],
    ["0360 1234567", "operator"],
  ])("rejects %j with code %s", (input, code) => {
    const r = parsePkMobile(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.error).toBeTruthy();
    }
  });

  it("accepts every operator prefix 030–035 and nothing above", () => {
    for (const op of ["30", "31", "32", "33", "34", "35"]) expect(parsePkMobile(`0${op}0 1234567`).ok).toBe(true);
    for (const op of ["36", "37", "38", "39"]) expect(parsePkMobile(`0${op}0 1234567`).ok).toBe(false);
  });
});

describe("sanitizePhoneInput", () => {
  it("keeps digits, spaces, dashes and one leading plus", () => {
    expect(sanitizePhoneInput("+92 (300) abc-123")).toBe("+92 300 -123");
    expect(sanitizePhoneInput("92+300+1")).toBe("923001");
  });

  it("stops accepting extra digits once the number is complete for its prefix", () => {
    // bare national: 10 digits max
    expect(sanitizePhoneInput("3001234567890")).toBe("3001234567");
    expect(sanitizePhoneInput("300 1234567 890")).toBe("300 1234567 ");
    // leading 0: 11 digits
    expect(sanitizePhoneInput("030012345679999")).toBe("03001234567");
    // 92 / +92: 12 digits
    expect(sanitizePhoneInput("923001234567890")).toBe("923001234567");
    expect(sanitizePhoneInput("+923001234567890")).toBe("+923001234567");
    // 0092: 14 digits
    expect(sanitizePhoneInput("009230012345670000")).toBe("00923001234567");
    // a bare run of digits is capped to the national length, not 17
    expect(sanitizePhoneInput("1".repeat(30))).toBe("1111111111");
  });
});

describe("formatPkMobile", () => {
  it("groups a Pakistani mobile and wraps it in LTR isolates (safe inside Urdu text)", () => {
    expect(formatPkMobile("+923001234567")).toBe(`${LRI}+92 300 1234567${PDI}`);
  });

  it("passes other values through, still isolated", () => {
    expect(formatPkMobile("12345")).toBe(`${LRI}12345${PDI}`);
  });
});
