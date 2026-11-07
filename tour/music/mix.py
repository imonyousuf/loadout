"""Joins the two MusicGen parts into one bed as long as the film, with a fade at the end, then normalises it."""
import sys, subprocess, numpy as np, soundfile as sf
film_len = float(sys.argv[1])
out = sys.argv[2]
a, sr = sf.read("/home/claude/mg/tour1.wav")
b, _ = sf.read("/home/claude/mg/tour2.wav")
ctx = 10 * sr
# part 2 starts with the 10 s of part 1 it continued from: join on that seam with a short crossfade
join = len(a) - ctx
fade = int(0.08 * sr)
head = a[:join + fade].copy()
tail = b.copy()
ramp = np.linspace(0, 1, fade)
head[-fade:] = head[-fade:] * (1 - ramp) + tail[:fade] * ramp
track = np.concatenate([head, tail[fade:]])
print("joined", round(len(track) / sr, 2), "s; part2", round(len(b) / sr, 2), "s")
n = int(film_len * sr)
if len(track) < n:
    # short: loop the last 16 s under a crossfade until it is long enough
    loop = track[-16 * sr:]
    while len(track) < n:
        xf = int(0.5 * sr)
        r = np.linspace(0, 1, xf)
        track[-xf:] = track[-xf:] * (1 - r) + loop[:xf] * r
        track = np.concatenate([track, loop[xf:]])
track = track[:n]
fo = int(1.6 * sr)
track[-fo:] *= np.linspace(1, 0, fo) ** 1.5
fi = int(0.25 * sr)
track[:fi] *= np.linspace(0, 1, fi)
sf.write("/home/claude/mg/tour_raw.wav", track, sr)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "/home/claude/mg/tour_raw.wav", "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", out], check=True)
print("wrote", out)
