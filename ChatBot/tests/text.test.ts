import { describe, expect, it } from "vitest";
import { decodeServerText } from "../src/client/lib/text";

describe("decodeServerText", () => {
  it("decodes the entities the API produces", () => {
    expect(decodeServerText("I&#039;m here &amp; ready")).toBe("I'm here & ready");
    expect(decodeServerText("&lt;b&gt; &quot;quoted&quot;")).toBe('<b> "quoted"');
  });

  it("does not re-decode its own output", () => {
    // A reply that literally contains the text "&lt;" arrives as "&amp;lt;".
    expect(decodeServerText("&amp;lt;")).toBe("&lt;");
  });

  it("leaves ordinary text untouched", () => {
    expect(decodeServerText("Espresso costs ₹90.")).toBe("Espresso costs ₹90.");
  });
});
