import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { errorKey } from "../api/use-action";

type Json = { [key: string]: Json | string };

const DIR = path.join(__dirname, "messages");
const NAMESPACES = fs.readdirSync(path.join(DIR, "en")).filter((f) => f.endsWith(".json"));
const load = (locale: string, file: string): Json => JSON.parse(fs.readFileSync(path.join(DIR, locale, file), "utf8"));

/** Flatten to { "a.b.c": "text" }; keys starting with "_" are notes, not messages. */
function flatten(obj: Json, prefix = ""): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    if (k.startsWith("_")) return acc;
    if (typeof v === "string") acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});
}

/** ICU argument names ({name}, {count, plural, …}) and rich-text tags (<b>) used anywhere in a message. */
function placeholders(msg: string): string[] {
  const found = new Set<string>();
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
        continue;
      }
      found.add(el.value);
      if (el.type === TYPE.select || el.type === TYPE.plural) Object.values(el.options).forEach((o) => walk(o.value));
    }
  };
  walk(parse(msg));
  return [...found].sort();
}

const isValidIcu = (msg: string) => {
  try {
    parse(msg);
    return true;
  } catch {
    return false;
  }
};

describe("translation files", () => {
  it("has the same namespaces for en and ur", () => {
    expect(fs.readdirSync(path.join(DIR, "ur")).filter((f) => f.endsWith(".json")).sort()).toEqual([...NAMESPACES].sort());
  });

  describe.each(NAMESPACES)("%s", (file) => {
    const en = flatten(load("en", file));
    const ur = flatten(load("ur", file));

    it("has identical keys in en and ur", () => {
      expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
    });

    it("parses as valid ICU in both languages", () => {
      const invalid = [...Object.entries(en), ...Object.entries(ur)].filter(([, v]) => !isValidIcu(v)).map(([k]) => k);
      expect(invalid).toEqual([]);
    });

    it("has no empty messages", () => {
      const empty = [...Object.entries(en), ...Object.entries(ur)].filter(([, v]) => !v.trim()).map(([k]) => k);
      expect(empty).toEqual([]);
    });

    it("uses the same ICU arguments and rich-text tags in both languages", () => {
      const mismatched = Object.keys(en).filter(
        (k) => k in ur && placeholders(en[k]).join() !== placeholders(ur[k]).join(),
      );
      expect(mismatched).toEqual([]);
    });

    if (file !== "apiErrors.json") {
      it("actually translates (Urdu text contains Urdu script)", () => {
        // A value identical to English is fine for codes/brands ("PNC", "SOS"); real sentences must be translated.
        const untranslated = Object.keys(en).filter((k) => /[a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}/i.test(en[k]) && !/[؀-ۿ]/.test(ur[k]));
        expect(untranslated).toEqual([]);
      });
    }
  });

  it("keys apiErrors by the English backend message (errorKey)", () => {
    const en = flatten(load("en", "apiErrors.json"));
    // Values may be friendlier rewrites of the backend message; the key must still be a valid errorKey output.
    for (const key of Object.keys(en)) expect(errorKey(key.replace(/_/g, " "))).toBe(key);
    expect(errorKey("Promo code is not valid")).toBe("Promo_code_is_not_valid");
    expect(errorKey("Cannot reach the server. Check your connection.")).toBe("Cannot_reach_the_server_Check_your_connection");
  });
});
