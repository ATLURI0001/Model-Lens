import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  normalizeBlobStorageRegion,
  truncate,
  stringifyValue,
  extractVariables,
  isValidVariableName,
  getIsCharOrUnderscore,
  stripAnsiCodes,
  isAlphanumeric,
  safeJsonParse,
  isValidUrl,
  normalizeHeaderName,
  sanitizeCsvCell,
} from "./stringChecks.ts";

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe("normalizeBlobStorageRegion", () => {
  const validRegions = [
    ["us-west-2", "AWS"],
    ["europe-west1", "GCP"],
    ["us-central1", "GCP"],
    ["US", "GCS multi-region"],
    ["eastus", "Azure"],
    ["westeurope", "Azure"],
    ["germanywestcentral", "Azure"],
    ["auto", "GCS/R2 signing region"],
    ["wnam", "Cloudflare R2"],
    ["us-ashburn-1", "OCI"],
    ["us-west-004", "Backblaze"],
  ];

  for (const [region] of validRegions) {
    it(`accepts ${region}`, () => {
      assert.strictEqual(normalizeBlobStorageRegion(` ${region} `), region);
    });
  }

  const invalidRegions = [
    "us west-2",
    "East US",
    "US-CENTRAL1+US-EAST1",
    "us_west_2",
    "-us-west-2",
    "us-west-2-",
    "a".repeat(64),
  ];

  for (const region of invalidRegions) {
    it(`rejects ${region}`, () => {
      assert.throws(
        () => normalizeBlobStorageRegion(region),
        new RegExp(BLOB_STORAGE_REGION_INVALID_MESSAGE)
      );
    });
  }

  it("rejects non-string region inputs safely", () => {
    assert.throws(
      () => normalizeBlobStorageRegion(null as unknown as string),
      new RegExp(BLOB_STORAGE_REGION_INVALID_MESSAGE)
    );
  });
});

describe("truncate", () => {
  it("returns the string unchanged when at or under the limit", () => {
    assert.strictEqual(truncate("hello", 16), "hello");
    assert.strictEqual(truncate("exactly-sixteen!", 16), "exactly-sixteen!");
  });

  it("appends an ellipsis when over the limit", () => {
    assert.strictEqual(
      truncate("this is definitely longer than sixteen", 16),
      "this is definite..."
    );
  });

  it("counts code points, not UTF-16 code units, for the limit", () => {
    assert.strictEqual(truncate("🎉".repeat(9), 16), "🎉".repeat(9));
  });

  it("does not split surrogate pairs when the cut lands mid-pair", () => {
    const input = "a" + "🎉".repeat(20);
    const out = truncate(input, 16);
    assert.strictEqual(hasLoneSurrogate(out), false);
    assert.strictEqual(out, "a" + "🎉".repeat(15) + "...");
  });

  it("handles non-string or negative limits safely", () => {
    assert.strictEqual(truncate(null as unknown as string, 16), "");
    assert.strictEqual(truncate("hello", -5), "...");
    assert.strictEqual(truncate("hello", Number.NaN), "...");
  });
});

describe("stringifyValue", () => {
  it("handles primitives, bigint, symbol, undefined, and null safely", () => {
    assert.strictEqual(stringifyValue(undefined), "");
    assert.strictEqual(stringifyValue(null), "null");
    assert.strictEqual(stringifyValue("text"), "text");
    assert.strictEqual(stringifyValue(42), "42");
    assert.strictEqual(stringifyValue(true), "true");
    assert.strictEqual(stringifyValue(100n), "100");
    assert.strictEqual(stringifyValue(Symbol("sym")), "sym");
    assert.strictEqual(stringifyValue({ a: 1 }), '{"a":1}');
  });

  it("handles nested BigInt inside objects and Error instances safely", () => {
    assert.strictEqual(
      stringifyValue({ count: 999999999999999999n }),
      '{"count":"999999999999999999"}'
    );
    assert.strictEqual(stringifyValue(new Error("custom error")), "custom error");
  });
});

describe("extractVariables", () => {
  it("extracts unique variables from mustache syntax", () => {
    assert.deepStrictEqual(
      extractVariables("Hello {{name}}, welcome to {{city}}! Bye {{name}}."),
      ["name", "city"]
    );
    assert.deepStrictEqual(extractVariables(123 as unknown as string), []);
  });

  it("extracts variables with surrounding whitespace inside braces", () => {
    assert.deepStrictEqual(
      extractVariables("Hello {{ name }} and {{   user_role   }}!"),
      ["name", "user_role"]
    );
  });

  it("validates variable names against unicode letters and digits", () => {
    assert.strictEqual(isValidVariableName("valid_var1"), true);
    assert.strictEqual(isValidVariableName("1invalid"), false);
    assert.strictEqual(isValidVariableName(null as unknown as string), false);
  });
});

describe("getIsCharOrUnderscore", () => {
  it("returns true for alphanumeric characters and underscores", () => {
    assert.strictEqual(getIsCharOrUnderscore("abc"), true);
    assert.strictEqual(getIsCharOrUnderscore("123"), true);
    assert.strictEqual(getIsCharOrUnderscore("foo_bar_42"), true);
    assert.strictEqual(getIsCharOrUnderscore("日本語_42"), true);
  });

  it("returns false for non-string, empty, null, and undefined values", () => {
    assert.strictEqual(getIsCharOrUnderscore(""), false);
    assert.strictEqual(getIsCharOrUnderscore(null as unknown as string), false);
    assert.strictEqual(getIsCharOrUnderscore(undefined as unknown as string), false);
    assert.strictEqual(getIsCharOrUnderscore(123 as unknown as string), false);
  });

  it("returns false for strings containing whitespace or punctuation", () => {
    assert.strictEqual(getIsCharOrUnderscore("foo bar"), false);
    assert.strictEqual(getIsCharOrUnderscore("foo-bar"), false);
    assert.strictEqual(getIsCharOrUnderscore("foo.bar"), false);
  });
});

describe("stripAnsiCodes", () => {
  it("strips ANSI escape sequences and colors", () => {
    assert.strictEqual(stripAnsiCodes("\u001b[31mRed Alert\u001b[0m"), "Red Alert");
    assert.strictEqual(stripAnsiCodes("\u001b[1;32mBold Green\u001b[0m"), "Bold Green");
    assert.strictEqual(stripAnsiCodes("plain text"), "plain text");
    assert.strictEqual(stripAnsiCodes(null as unknown as string), "");
  });
});

describe("isAlphanumeric", () => {
  it("validates ASCII alphanumeric characters", () => {
    assert.strictEqual(isAlphanumeric("abcXYZ123"), true);
    assert.strictEqual(isAlphanumeric(""), false);
    assert.strictEqual(isAlphanumeric("abc_123"), false);
    assert.strictEqual(isAlphanumeric("hello world"), false);
    assert.strictEqual(isAlphanumeric(123 as unknown as string), false);
  });
});

describe("safeJsonParse", () => {
  it("safely parses JSON or returns fallback", () => {
    assert.deepStrictEqual(safeJsonParse('{"a":1}', {}), { a: 1 });
    assert.deepStrictEqual(safeJsonParse('invalid json', { fallback: true }), { fallback: true });
    assert.deepStrictEqual(safeJsonParse('', { fallback: true }), { fallback: true });
    assert.deepStrictEqual(safeJsonParse(null as unknown as string, 42), 42);
  });
});

describe("isValidUrl", () => {
  it("validates standard web URLs and rejects disallowed protocols", () => {
    assert.strictEqual(isValidUrl("https://example.com/api/v1"), true);
    assert.strictEqual(isValidUrl("http://localhost:3000"), true);
    assert.strictEqual(isValidUrl("javascript:alert(1)"), false);
    assert.strictEqual(isValidUrl("data:text/plain;base64,SGVsbG8="), false);
    assert.strictEqual(isValidUrl("not-a-url"), false);
    assert.strictEqual(isValidUrl(""), false);
    assert.strictEqual(isValidUrl("ftp://files.example.com", ["ftp:"]), true);
  });
});

describe("normalizeHeaderName", () => {
  it("normalizes and validates standard HTTP header names", () => {
    assert.strictEqual(normalizeHeaderName("  Content-Type  "), "content-type");
    assert.strictEqual(normalizeHeaderName("X-Custom-Token"), "x-custom-token");
    assert.throws(() => normalizeHeaderName("Invalid Header!"), /Invalid HTTP header token/);
    assert.throws(() => normalizeHeaderName(""), /Invalid HTTP header token/);
    assert.throws(() => normalizeHeaderName(123 as unknown as string), /Header name must be a string/);
  });
});

describe("sanitizeCsvCell", () => {
  it("guards against formula injection and escapes delimiters", () => {
    assert.strictEqual(sanitizeCsvCell("regular text"), "regular text");
    assert.strictEqual(sanitizeCsvCell("=1+1"), "'=1+1");
    assert.strictEqual(sanitizeCsvCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.strictEqual(sanitizeCsvCell("@SUM(A1:A10)"), "'@SUM(A1:A10)");
    assert.strictEqual(sanitizeCsvCell('quotes "inside"'), '"quotes ""inside"""');
    assert.strictEqual(sanitizeCsvCell("comma, separated"), '"comma, separated"');
    assert.strictEqual(sanitizeCsvCell(123), "123");
  });
});

