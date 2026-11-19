import { describe, expect, it } from "vitest";
import { PLAYING_CLASS, PLAYING_EVENTS, releasePointerFocus, syncPlaying, trackPlaying, type PlayingTarget } from "./controls";

function fakePlayer(paused: boolean) {
  const classes = new Set<string>();
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const button = { blurred: 0, blur() { this.blurred++; } };
  const shadowRoot = { activeElement: button as unknown as Element | null };
  const player = {
    paused,
    shadowRoot,
    classList: {
      toggle(name: string, force?: boolean) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
    },
    addEventListener(type: string, listener: (event: Event) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  };
  const fire = (type: string, detail = 0) => {
    for (const l of listeners.get(type) ?? []) l({ type, detail } as unknown as Event);
  };
  return { player: player as PlayingTarget & { paused: boolean }, classes, fire, listeners, button, shadowRoot };
}

describe("the control bar's playing class", () => {
  it("is set while the player plays and cleared while it is paused", () => {
    const { player, classes } = fakePlayer(false);
    syncPlaying(player);
    expect(classes.has(PLAYING_CLASS)).toBe(true);
    player.paused = true;
    syncPlaying(player);
    expect(classes.has(PLAYING_CLASS)).toBe(false);
  });

  it("follows the player after each event that can change playback, once the player has acted", () => {
    const { player, classes, fire } = fakePlayer(true);
    const queued: Array<() => void> = [];
    trackPlaying(player, (run) => queued.push(run));
    expect(classes.has(PLAYING_CLASS)).toBe(false);

    // A click on play: the class waits until the player has started.
    fire("click");
    player.paused = false;
    expect(classes.has(PLAYING_CLASS)).toBe(false);
    queued.splice(0).forEach((run) => run());
    expect(classes.has(PLAYING_CLASS)).toBe(true);

    // The scene ends with loop off.
    player.paused = true;
    fire("ended");
    queued.splice(0).forEach((run) => run());
    expect(classes.has(PLAYING_CLASS)).toBe(false);
  });

  it("listens for the scene loading, the bar's input and the scene ending", () => {
    const { player, listeners } = fakePlayer(true);
    trackPlaying(player, () => undefined);
    expect([...listeners.keys()].sort()).toEqual([...new Set<string>([...PLAYING_EVENTS, "click"])].sort());
    expect(PLAYING_EVENTS).toEqual(expect.arrayContaining(["ready", "ended", "click", "input"]));
  });

  it("takes the focus off a control after a pointer click, so the bar can fade", () => {
    const { player, fire, button } = fakePlayer(false);
    trackPlaying(player, () => undefined);
    fire("click", 1);
    expect(button.blurred).toBe(1);
  });

  it("leaves the focus on a control clicked from the keyboard", () => {
    const { player, fire, button } = fakePlayer(false);
    trackPlaying(player, () => undefined);
    fire("click", 0);
    expect(button.blurred).toBe(0);
  });

  it("does nothing when nothing in the player has focus", () => {
    const { player, shadowRoot } = fakePlayer(false);
    shadowRoot.activeElement = null;
    expect(() => releasePointerFocus(player, { detail: 1 } as unknown as Event)).not.toThrow();
  });
});
