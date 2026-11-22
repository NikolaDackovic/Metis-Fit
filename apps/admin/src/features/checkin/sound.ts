let ctx: AudioContext | null = null;

/** Short distinct tones so reception can work without looking: high = granted, low double = denied. */
export function beep(granted: boolean) {
  try {
    ctx ??= new AudioContext();
    const tones = granted
      ? [[880, 0]]
      : [
          [220, 0],
          [220, 0.18],
        ];
    for (const [freq, delay] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq!;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay!);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay! + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay! + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay!);
      osc.stop(ctx.currentTime + delay! + 0.15);
    }
  } catch {
    /* audio is optional */
  }
}
