"use client"

import { cn } from "@workspace/ui/lib/utils"

export type BoatSceneMode =
  | "idle"
  | "sailing"
  | "paused"
  | "break"
  | "sinking"
  | "arrived"

interface BoatSceneProps {
  // 0 at departure, 1 when the boat reaches the lighthouse.
  progress: number
  mode: BoatSceneMode
  className?: string
}

const SCENE_WIDTH = 360
const SCENE_HEIGHT = 132
const SEA_LEVEL = 96
const DEPARTURE_X = 36
const HARBOR_X = 300

// One 40px-wide wave period, repeated wide enough to slide 40px and loop
// seamlessly.
const wavePath = (y: number) => {
  const segments: string[] = [`M-40 ${y}`]
  for (let x = -40; x < SCENE_WIDTH + 40; x += 40) {
    segments.push(`q 10 -7 20 0 q 10 7 20 0`)
  }
  return segments.join(" ")
}

export function BoatScene({ progress, mode, className }: BoatSceneProps) {
  const clamped = Math.min(1, Math.max(0, progress))
  const atSea = mode === "break" ? 0.5 : clamped
  const boatX =
    mode === "arrived"
      ? HARBOR_X - 26
      : DEPARTURE_X + atSea * (HARBOR_X - 56 - DEPARTURE_X)
  const isNight = mode === "break"
  const wavesAnimated = mode === "sailing" || mode === "break"

  return (
    <div className={cn("text-foreground", className)}>
      <style>{`
        @keyframes helm-pomodoro-drift {
          from { transform: translateX(0); }
          to { transform: translateX(40px); }
        }
        @keyframes helm-pomodoro-bob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-2.5px) rotate(-1.8deg); }
        }
        @keyframes helm-pomodoro-sink {
          to { transform: translateY(34px) rotate(-24deg); opacity: 0; }
        }
        @keyframes helm-pomodoro-beam {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.7; }
        }
        .helm-pomodoro-wave { animation: helm-pomodoro-drift 7s linear infinite; }
        .helm-pomodoro-wave-far { animation-duration: 11s; animation-direction: reverse; }
        .helm-pomodoro-boat-bob { animation: helm-pomodoro-bob 3.2s ease-in-out infinite; }
        .helm-pomodoro-boat-sink { animation: helm-pomodoro-sink 1.4s ease-in forwards; }
        .helm-pomodoro-beam-pulse { animation: helm-pomodoro-beam 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .helm-pomodoro-wave,
          .helm-pomodoro-wave-far,
          .helm-pomodoro-boat-bob,
          .helm-pomodoro-boat-sink,
          .helm-pomodoro-beam-pulse { animation: none; }
        }
      `}</style>
      <svg
        aria-hidden="true"
        className="h-auto w-full"
        fill="none"
        viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      >
        <title>Session progress</title>

        {isNight ? (
          <g className="opacity-60" stroke="currentColor" strokeWidth="1.5">
            <path d="M52 30 a 11 11 0 1 0 8 19 a 9 9 0 0 1 -8 -19" />
            <circle cx="118" cy="22" r="0.8" fill="currentColor" />
            <circle cx="158" cy="38" r="0.8" fill="currentColor" />
            <circle cx="92" cy="48" r="0.8" fill="currentColor" />
          </g>
        ) : (
          <g className="opacity-50" stroke="currentColor" strokeWidth="1.5">
            <circle cx="56" cy="34" r="10" />
            <path d="M56 16 v-5 M56 57 v-5 M74 34 h5 M33 34 h5 M69 21 l3.5 -3.5 M39.5 50.5 L43 47 M69 47 l3.5 3.5 M39.5 17.5 L43 21" />
          </g>
        )}

        {/* Two drifting wave layers; paths repeat every 40px so the slide
            loops. Painted first so they sit behind the boat and lighthouse. */}
        <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
          <path
            className={cn(
              "helm-pomodoro-wave helm-pomodoro-wave-far opacity-25",
              !wavesAnimated && "[animation-play-state:paused]"
            )}
            d={wavePath(SEA_LEVEL + 14)}
          />
          <path
            className={cn(
              "helm-pomodoro-wave opacity-60",
              !wavesAnimated && "[animation-play-state:paused]"
            )}
            d={wavePath(SEA_LEVEL)}
          />
        </g>

        {/* Lighthouse harbor on the far shore. The tower gets an opaque
            backing so the waves behind it do not show through the outline. */}
        <g stroke="currentColor" strokeWidth="1.5">
          <path
            className={cn(
              "opacity-15",
              mode === "arrived" && "helm-pomodoro-beam-pulse"
            )}
            d="M310 40 L286 30 M330 40 L354 30"
          />
          <path
            d="M313 96 L315 48 h10 l2 48 Z"
            fill="var(--background)"
            stroke="none"
          />
          <path d="M313 96 L315 48 h10 l2 48" />
          <path d="M312 48 h16 M314 40 h12 l-2 8 h-8 Z" />
          <circle cx="320" cy="44" r="1.5" fill="currentColor" />
          <path d="M306 96 h40" strokeLinecap="round" />
        </g>

        {/* Boat. The outer group travels, the inner group bobs or sinks. */}
        <g
          style={{
            transform: `translateX(${boatX}px)`,
            transition: "transform 1s linear",
          }}
        >
          <g
            className={cn(
              mode === "sinking" && "helm-pomodoro-boat-sink",
              (mode === "sailing" || mode === "break") &&
                "helm-pomodoro-boat-bob",
              mode === "paused" && "opacity-60"
            )}
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.5"
          >
            {/* Opaque backing under the translucent hull and sail so the
                waves behind the boat do not show through. */}
            <g fill="var(--background)" stroke="none">
              <path d={`M-16 ${SEA_LEVEL - 6} h32 l-7 8 h-18 Z`} />
              <path d={`M0 ${SEA_LEVEL - 34} l15 24 h-15 Z`} />
            </g>
            <path
              d={`M-16 ${SEA_LEVEL - 6} h32 l-7 8 h-18 Z`}
              fill="currentColor"
              fillOpacity="0.12"
            />
            <path d={`M0 ${SEA_LEVEL - 6} v-30`} />
            <path
              d={`M0 ${SEA_LEVEL - 34} l15 24 h-15 Z`}
              fill="currentColor"
              fillOpacity="0.12"
            />
            <path d={`M0 ${SEA_LEVEL - 34} l-7 4 l7 2 Z`} fill="currentColor" />
            {isNight && (
              <path
                className="opacity-60"
                d={`M2 ${SEA_LEVEL + 2} q 4 8 0 16 m0 0 q -3 2 0 4`}
                strokeLinecap="round"
              />
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
