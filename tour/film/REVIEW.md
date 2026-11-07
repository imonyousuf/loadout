# Review: the Loadout tour

## Creative calls
- Storyline A, "One Friday order": one real order (the Grocery Friday preset, 306 cases) goes from a
  plain load sheet into the app and comes out as five built pallets, in one continuous take over the
  real interface. Not built: B ("The loader's rules", each rule a big line proving itself on the
  pallet) and C ("Result first", the build, then a pull-back to the order that made it).
- The app plays in the top 930 px and every caption sits in the strip below it, so no line ever
  covers the part of the app it explains. The camera frames each part as the cursor reaches it.
- The ending is a second short take: the same order with the iced tea added, the pallet that got
  it clicked and built, so the film ends on the result of the last step, not on a form.
- Footage is recorded frame by frame from the app's own `?capture` mode at 3200 x 1800, so the
  deepest zoom (2x) still shows sharp text.

## Measured
- `hyperframes check`: passes. Kept on purpose: `text_below_floor` for the sheet's "cs" unit
  labels and its small caps label (secondary to the names and numbers beside them, which are
  32-38 px), and `timeline_track_too_dense` (nine captions on one track, one at a time).
- Every caption holds at least 0.5 s + 0.3 s a word (build.py asserts it).
- Sound: each click, key and pop is placed so its peak lands one frame after the picture; the
  bed is normalised. The mix was measured with `hyperframes audio`, not heard.

## Looked at
- Contact sheets at every step, the order-to-app seam, the phone sheet (360 px), and a draft
  render of the carry-across in motion.

## Weakest shot
- The stats close-up crops the pallet at the bottom; it is there for the numbers. With more time:
  a split framing that holds the stats and the whole pallet together.
