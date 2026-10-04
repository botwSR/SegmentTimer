// Compare elapsed durations, never raw frame counts from different FPS grids.
export function compareDurations(first, firstFps, second, secondFps, referenceFps) {
  const firstSeconds = (first.out - first.in) / firstFps;
  const secondSeconds = (second.out - second.in) / secondFps;
  const delta = secondSeconds - firstSeconds;
  const direction = Math.abs(delta) < 1e-9 ? 0 : Math.sign(delta);
  const absoluteSeconds = direction ? Math.abs(delta) : 0;
  const wholeSeconds = Math.floor(absoluteSeconds + 1e-9);
  const round = value => Number(value.toFixed(6));
  return {
    direction, firstSeconds, secondSeconds, absoluteSeconds,
    minutes: Math.floor(wholeSeconds / 60), seconds: wholeSeconds % 60,
    frames: round(Math.max(0, absoluteSeconds - wholeSeconds) * referenceFps),
    totalFrames: round(absoluteSeconds * referenceFps)
  };
}
