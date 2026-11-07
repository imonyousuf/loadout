# The Loadout tour

A 50-second video that shows what Loadout is and how to use it. The app plays it on a first visit
and from **How it works**. It is made from real footage of the app, composed with
[HyperFrames](https://hyperframes.heygen.com).

## Remake it

1. **Record the footage.** Build the app and serve `dist/` on port 8804, then run the recorder for
   each take. It opens the app with `?capture`, freezes the page clock and steps it one frame at a
   time, so the 3D build comes out smooth however slow the machine is. Each take writes an mp4
   and a json of its events (clicks, typing) and the boxes of the parts it framed.

   ```bash
   node tour/rec.cjs tour/film/assets/take.mp4 main      # the whole tour, one continuous take
   node tour/rec.cjs tour/film/assets/payoff.mp4 payoff  # the ending: the iced tea pallet built
   node tour/rec.cjs hero.mp4 hero                       # a clean build loop, no cursor
   ```

2. **Make the music.** `music/generate.py` writes two parts with MusicGen (small, runs on a CPU)
   and `music/mix.py <seconds> tour/film/assets/bgm/track.wav` joins and normalises them.

3. **Compose and render.** `python3 tour/build.py` writes the scenes from the takes' events, so
   every camera move and caption lands on the action it explains. Then, in `tour/film`:

   ```bash
   npx hyperframes check
   npx hyperframes render --quality delivery --video-frame-format png
   ```

`film/SPEC.md` is the brief, `film/STORYLINES.md` the three ways it could have been told, and
`film/REVIEW.md` what was checked.
