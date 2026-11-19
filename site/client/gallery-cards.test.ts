import { describe, expect, it } from "vitest";
import { CardPlayback, countLabel, matchesTags, type CardPlayer } from "./gallery-cards";

class FakePlayer implements CardPlayer {
  currentTime = 0;
  calls: string[] = [];
  private readonly listeners: Array<() => void> = [];
  play(): void {
    this.calls.push("play");
  }
  pause(): void {
    this.calls.push("pause");
  }
  addEventListener(_type: "ready", listener: () => void): void {
    this.listeners.push(listener);
  }
  ready(): void {
    for (const l of this.listeners) l();
  }
}

describe("matchesTags", () => {
  it("shows every card when no tag is pressed", () => {
    expect(matchesTags(["physics"], new Set())).toBe(true);
    expect(matchesTags([], new Set())).toBe(true);
  });

  it("shows a card carrying any pressed tag, and hides one carrying none", () => {
    const pressed = new Set(["physics", "text"]);
    expect(matchesTags(["generative", "text"], pressed)).toBe(true);
    expect(matchesTags(["physics"], pressed)).toBe(true);
    expect(matchesTags(["generative", "loop"], pressed)).toBe(false);
  });
});

describe("countLabel", () => {
  it("says how many scenes the filter leaves", () => {
    expect(countLabel(2, 6)).toBe("Showing 2 of 6 scenes");
    expect(countLabel(1, 6)).toBe("Showing 1 of 6 scenes");
    expect(countLabel(6, 6)).toBe("Showing all 6 scenes");
  });
});

describe("CardPlayback", () => {
  it("seeks to the poster time when the player is ready and nobody is looking", () => {
    const card = new CardPlayback(4.5, true);
    const player = new FakePlayer();
    card.attach(player);
    player.ready();
    expect(player.currentTime).toBe(4.5);
    expect(player.calls).toEqual([]);
  });

  it("leaves the player's own poster frame alone when there is no poster time", () => {
    const card = new CardPlayback(null, true);
    const player = new FakePlayer();
    player.currentTime = 7;
    card.attach(player);
    player.ready();
    expect(player.currentTime).toBe(7);
  });

  it("plays while hovered or focused, and pauses only when both have left", () => {
    const card = new CardPlayback(null, true);
    const player = new FakePlayer();
    card.attach(player);
    card.set("hover", true);
    card.set("focus", true);
    card.set("hover", false);
    expect(player.calls).toEqual(["play"]);
    card.set("focus", false);
    expect(player.calls).toEqual(["play", "pause"]);
  });

  it("plays a player that becomes ready while the card is hovered, without seeking", () => {
    const card = new CardPlayback(2, true);
    card.set("hover", true);
    const player = new FakePlayer();
    card.attach(player);
    player.ready();
    expect(player.calls).toEqual(["play"]);
    expect(player.currentTime).toBe(0);
  });

  it("never plays where the card cannot (touch screens, reduced motion)", () => {
    const card = new CardPlayback(3, false);
    const player = new FakePlayer();
    card.attach(player);
    card.set("hover", true);
    card.set("focus", true);
    player.ready();
    expect(player.calls).toEqual([]);
    expect(player.currentTime).toBe(3);
  });

  it("follows a change in whether the card may play", () => {
    const card = new CardPlayback(null, true);
    const player = new FakePlayer();
    card.attach(player);
    card.set("hover", true);
    card.set("canPlay", false);
    expect(player.calls).toEqual(["play", "pause"]);
    card.set("canPlay", true);
    expect(player.calls).toEqual(["play", "pause", "play"]);
  });

  it("starts playing a hovered card once it becomes allowed to", () => {
    const card = new CardPlayback(null, false);
    const player = new FakePlayer();
    card.attach(player);
    card.set("hover", true);
    expect(player.calls).toEqual([]);
    card.set("canPlay", true);
    expect(player.calls).toEqual(["play"]);
  });

  it("ignores a replaced player that becomes ready late", () => {
    const card = new CardPlayback(2, true);
    const first = new FakePlayer();
    const second = new FakePlayer();
    card.attach(first);
    card.attach(second);
    first.ready();
    expect(first.currentTime).toBe(0);
  });

  it("drives the newest player after the pool replaces one", () => {
    const card = new CardPlayback(null, true);
    const first = new FakePlayer();
    const second = new FakePlayer();
    card.attach(first);
    card.attach(second);
    card.set("hover", true);
    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual(["play"]);
  });
});
