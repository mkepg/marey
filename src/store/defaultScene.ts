/**
 * The scene loaded when there is no saved or shared document.
 *
 * It is the first thing a visitor sees, so it shows off what Marey is for —
 * choreographed animation handing off into a shared physics world — in one
 * friendly picture, and it declares a `duration` so the export buttons work
 * on it as loaded. `defaultScene.test.ts` checks that it compiles, fits in a
 * share link, and can be exported.
 *
 * The motion test card that used to live here, which exercises every
 * timeline path for eyeballing renderer changes, is now
 * `tools/visual-check/scenes/test-card.marey`.
 *
 * Kept in its own module so it can be imported without pulling in the store,
 * which touches `window.localStorage` at module load.
 */
export const DEFAULT_CODE = `// ══ HELLO FROM MAREY ═══════════════════════════════════════
//
// What you should see, in about six seconds:
//
//   1. A big yellow face pops in, overshoots a little and settles.
//   2. Its smile grows into a grin, its cheeks blush, and it blinks.
//   3. Confetti bursts out from behind it. Each piece hands its
//      momentum to physics, so it arcs, tumbles and lands on the
//      floor instead of stopping dead and dropping.
//   4. "hello!" pops in, and the face bobs and wiggles for joy.
//
// The scene declares 'duration: 6', which is how long an MP4 or
// WebM export from the top bar will be.

let sun    = #facc15
let rim    = #f59e0b
let ink    = #3b2410
let blush  = #fb7185
let party  = [#f472b6, #38bdf8, #a78bfa, #34d399, #fb923c]

let cx = 400
let cy = 310

// One eye: a dark pupil with a highlight, blinking twice.
template Eye() {
  group lid {
    circle pupil     { position: (0, 0),  radius: 19, color: ink }
    circle highlight { position: (6, -7), radius: 6,  color: #ffffff }
    sequence {
      animate { property: scale, to: (1, 0.1), duration: 0.07, delay: 1.7, easing: easeIn }
      animate { property: scale, to: (1, 1),   duration: 0.1,  easing: easeOut }
      animate { property: scale, to: (1, 0.1), duration: 0.07, delay: 2.1, easing: easeIn }
      animate { property: scale, to: (1, 1),   duration: 0.1,  easing: easeOut }
    }
  }
}

scene {
  size: (800, 600)
  background: #0a0e1a
  duration: 6

  // ── Sparkles twinkling around the face ───────────────────
  generate k in 0 to 5 {
    let angle = k * 60 - 30
    polygon sparkle {
      position: (cx + 250 * cos(angle), cy + 172 * sin(angle))
      points: [(0, -14), (4, -4), (14, 0), (4, 4), (0, 14), (-4, 4), (-14, 0), (-4, -4)]
      color: #fde68a
      alpha: 0.15
      animate {
        property: alpha
        to: 1.0
        duration: 0.7
        delay: 0.9 + k * 0.2
        loop: true
        yoyo: true
      }
    }
  }

  // ── Confetti: a burst that hands off into physics ────────
  generate i in 0 to 23 {
    let angle = -165 + i * 150 / 23
    let reach = 190 + (i % 3) * 35
    rectangle bit {
      position: (cx + 8 * cos(angle), cy + 8 * sin(angle))
      size: (14, 8)
      rotation: i * 37
      color: party[i % 5]
      layer: -1
      alpha: 0
      // Hidden until the burst, so the pile waiting behind the face
      // never shows before the face has popped in over it.
      animate { property: alpha, to: 1, duration: 0.1, delay: 1.9 }
      animate {
        property: position
        to: (cx + reach * cos(angle), cy + reach * sin(angle))
        duration: 0.55
        delay: 2.0
        easing: easeOut
        handoff: true
      }
      physics {
        gravity: (0, 520)
        airDrag: 0.02
        bounce: 0.3
        collideBounds: true
        duration: indefinitely
      }
    }
  }

  // ── The face ──────────────────────────────────────────────
  // Two groups on purpose. An object's 'sequence' starts only once
  // its own 'animate' blocks have finished, and a looping one never
  // does, so the endless bob and wiggle live on the outer group and
  // the one-off pop lives on the inner one.
  group joy {
    position: (cx, cy)
    rotation: -4
    animate { property: rotation, to: 4, duration: 0.45, delay: 2.6, loop: true, yoyo: true }
    animate { property: position, to: (cx, cy - 12), duration: 0.3, delay: 2.6, easing: easeOut, loop: true, yoyo: true }

    group face {
      position: (0, 0)
      scale: (0, 0)

      circle edge { position: (0, 0), radius: 158, color: rim }
      circle head { position: (0, 0), radius: 150, color: sun }

      circle cheekL {
        position: (-92, 34), radius: 26, color: blush, alpha: 0
        animate { property: alpha, to: 0.55, duration: 0.6, delay: 1.2 }
      }
      circle cheekR {
        position: (92, 34), radius: 26, color: blush, alpha: 0
        animate { property: alpha, to: 0.55, duration: 0.6, delay: 1.2 }
      }

      use Eye() eyeL { position: (-52, -38) }
      use Eye() eyeR { position: (52, -38) }

      // The smile is an arc: points on a circle of radius 78,
      // from 25 to 155 degrees (y points down, so that is the
      // bottom of the circle).
      line smile {
        position: (0, 48)
        points: [
          (78 * cos(25),  78 * sin(25)),  (78 * cos(35),  78 * sin(35)),
          (78 * cos(45),  78 * sin(45)),  (78 * cos(56),  78 * sin(56)),
          (78 * cos(67),  78 * sin(67)),  (78 * cos(78),  78 * sin(78)),
          (78 * cos(90),  78 * sin(90)),
          (78 * cos(102), 78 * sin(102)), (78 * cos(113), 78 * sin(113)),
          (78 * cos(124), 78 * sin(124)), (78 * cos(135), 78 * sin(135)),
          (78 * cos(145), 78 * sin(145)), (78 * cos(155), 78 * sin(155))
        ]
        thickness: 12
        color: ink
        scale: (0.35, 0.5)
        animate { property: scale, to: (1, 1), duration: 0.7, delay: 0.6, easing: easeOut }
      }

      // Pop in: overshoot, dip, settle.
      sequence {
        animate { property: scale, to: (1.12, 1.12), duration: 0.45, easing: easeOut }
        animate { property: scale, to: (0.96, 0.96), duration: 0.15 }
        animate { property: scale, to: (1, 1),       duration: 0.15 }
      }
    }
  }

  // Same split: the outer group sways forever, the text pops once.
  group wave {
    position: (cx, 78)
    rotation: -3
    animate { property: rotation, to: 3, duration: 0.6, delay: 2.8, loop: true, yoyo: true }

    text hello {
      position: (0, 0)
      content: "hello!"
      fontSize: 60
      color: #ffffff
      scale: (0, 0)
      sequence {
        animate { property: scale, to: (1.15, 1.15), duration: 0.3, delay: 2.3, easing: easeOut }
        animate { property: scale, to: (1, 1),       duration: 0.2 }
      }
    }
  }
}
`;
