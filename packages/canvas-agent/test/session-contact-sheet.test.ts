import { writeFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
  bootPerception,
  vocabularyContactSheet,
} from "../src/service/session";
import { makeTestSession } from "./helpers";
import { box, makeDocument } from "./synthetic";

const PNG_SIGNATURE = "89504e470d0a1a0a";

describe("session vocabulary contact sheet", () => {
  test("renders the live object vocabulary as a PNG", () => {
    const sheet = vocabularyContactSheet();

    expect(Buffer.isBuffer(sheet)).toBe(true);
    if (!sheet) return;
    expect(sheet.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
    writeFileSync("/tmp/contact-sheet.png", sheet);
  });

  test("attaches the contact sheet to boot perception as a base64 PNG", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const boot = bootPerception(session);

    expect(typeof boot.images.contactSheet).toBe("string");
    const png = Buffer.from(boot.images.contactSheet!, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  });

  test("derives a no-argument sheet once and caches it for the static process roster", () => {
    expect(vocabularyContactSheet.length).toBe(0);

    const first = vocabularyContactSheet();
    const second = vocabularyContactSheet();

    expect(first).toBe(second);
  });
});
