// @vitest-environment jsdom
/**
 * Component tests for the optional §7 adapter panel, plus an App-level smoke test that the whole
 * workbench still mounts and the reference fixture still drives it. These render the real components
 * in a DOM; they do not exercise a real browser, a real device or the built bundle.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "../../src/App";

afterEach(cleanup);

function loadFixture() {
  render(<App />);
  fireEvent.click(screen.getByTestId("btn-load-ref"));
}

describe("workbench mounts and replays the reference fixture", () => {
  it("shows the honest banner and no source status before a fixture is loaded", () => {
    render(<App />);
    expect(screen.getByTestId("banner").textContent).toMatch(/SYNTHETIC OR USER-PROVIDED DATA/);
    expect(screen.getByTestId("empty-state").textContent).toMatch(/no source has any status/i);
  });

  it("loads the fixture and renders all three sources with their states", () => {
    loadFixture();
    expect(screen.queryByTestId("empty-state")).toBeNull();
    const sources = screen.getByTestId("scenario-meta").textContent ?? "";
    expect(sources).toMatch(/threshold 5 s/);
    // T=0: A and B fresh, C waiting.
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/FRESH HEARTBEAT/);
    expect(text).toMatch(/WAITING/);
  });

  it("exposes the optional adapter section once a scenario is loaded", () => {
    loadFixture();
    expect(screen.getByTestId("adapter-optin")).toBeTruthy();
    expect(screen.getByTestId("adapter-card").getAttribute("data-status")).toBe("OPT_IN_DISABLED");
  });
});

describe("adapter panel drives the real state machine", () => {
  it("is inert until opted in", () => {
    loadFixture();
    const send = screen.getByTestId("adapter-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByTestId("adapter-card").getAttribute("data-status")).toBe("OPT_IN_DISABLED");
  });

  it("opt-in → valid heartbeat shows a fresh card with age 0", () => {
    loadFixture();
    fireEvent.click(screen.getByTestId("adapter-optin"));
    fireEvent.click(screen.getByTestId("adapter-send"));
    const card = screen.getByTestId("adapter-card");
    expect(card.getAttribute("data-status")).toBe("FRESH_HEARTBEAT_RECEIVED");
    expect(card.textContent).toMatch(/AGE 0s < 5s THRESHOLD/);
    expect(screen.getByTestId("adapter-ages").textContent).toMatch(/heartbeat age: 0 s/);
  });

  it("a simulated failure immediately replaces the fresh card and is labelled not-fresh", () => {
    loadFixture();
    fireEvent.click(screen.getByTestId("adapter-optin"));
    fireEvent.click(screen.getByTestId("adapter-send"));
    fireEvent.click(screen.getByTestId("adapter-fail"));
    const card = screen.getByTestId("adapter-card");
    expect(card.getAttribute("data-status")).toBe("DISCONNECTED_OR_POLL_FAILED_UNKNOWN");
    expect(card.textContent).toMatch(/NOT FRESH/);
  });

  it("advancing the local clock past the threshold shows stale, with a growing age", () => {
    loadFixture();
    fireEvent.click(screen.getByTestId("adapter-optin"));
    fireEvent.click(screen.getByTestId("adapter-send"));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByTestId("adapter-advance"));
    const card = screen.getByTestId("adapter-card");
    expect(card.getAttribute("data-status")).toBe("STALE_THRESHOLD_EXCEEDED_UNKNOWN");
    expect(card.textContent).toMatch(/AGE 5s/);
  });

  it("a late out-of-order callback is ignored and counted in the UI", () => {
    loadFixture();
    fireEvent.click(screen.getByTestId("adapter-optin"));
    fireEvent.click(screen.getByTestId("adapter-send"));
    fireEvent.click(screen.getByTestId("adapter-send"));
    fireEvent.click(screen.getByTestId("adapter-late"));
    const ages = screen.getByTestId("adapter-ages");
    expect(within(ages).getByText(/out-of-order callbacks ignored:/).parentElement?.textContent).toMatch(/1$/);
    expect(screen.getByTestId("adapter-card").getAttribute("data-status")).toBe("FRESH_HEARTBEAT_RECEIVED");
  });

  it("reset returns the adapter to the opt-in-off state", () => {
    loadFixture();
    fireEvent.click(screen.getByTestId("adapter-optin"));
    fireEvent.click(screen.getByTestId("adapter-send"));
    fireEvent.click(screen.getByTestId("adapter-reset"));
    expect(screen.getByTestId("adapter-card").getAttribute("data-status")).toBe("OPT_IN_DISABLED");
  });

  it("the rendered panel states plainly that no physical device is involved", () => {
    loadFixture();
    const section = screen.getByTestId("adapter-status-line").textContent ?? "";
    expect(section).toMatch(/UNTESTED/);
    expect(screen.getByTestId("adapter-optin-label").textContent).toMatch(/simulated test feed/i);
  });
});

describe("rendered text keeps the spec §1 boundaries", () => {
  it("does not render independence, calibration, safety or hardware claims", () => {
    loadFixture();
    fireEvent.click(screen.getByTestId("adapter-optin"));
    // The "What this prototype does not show" panel deliberately NEGATES these phrases
    // ("No ... trust score ... is provided"), so keyword bans are applied to everything else.
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelector("#limits")?.remove();
    const text = body.textContent ?? "";
    expect(text).not.toMatch(/\bSybil\b|\bBrier\b|\bAtech\b/i);
    expect(text).not.toMatch(/true independent|independent groups|independence score|trust score/i);
    expect(text).not.toMatch(/all clear|area is (clear|safe)|scene is clear|safe to proceed/i);
    expect(text).not.toMatch(/certified|field-validated/i);
    // ...and the negating panel must still be on screen.
    expect(document.body.textContent ?? "").toMatch(/Silence is not a clear scene/);
  });
});
