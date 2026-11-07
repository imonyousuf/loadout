GOAL:    someone who opens Loadout for the first time knows what it is (a store order in, stable pallets out)
         and can use it: pick an order, read a pallet, change a number, add a product.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, 50.5 s, music bed and sound on visible actions, no voiceover.
STORY:   storyline A (STORYLINES.md): one Friday order, start to finish, in one continuous take over the real app.
TIME:    order sheet 0 - 4.8 s; the main take from O = 2.77 s (take time = film time - O); the click on Grocery
         Friday lands at film 4.9 s; at film 44.57 a hard cut to the ending take (the iced tea pallet built) to 50.47.
         Exact events come from assets/take.json and assets/payoff.json; build.py writes every time from them.
FRAME:   the app plays in the top 930 px (whole app = 1653 px wide, centred on the ground); every caption sits in
         the strip below, left-aligned with the app's edge, so no caption ever covers the part of the app it explains.
LOOK:    the app's own material, nothing else: ground #0b0b0c; panel #111113 / #17171a; lines #232327 / #2e2e33;
         ink #ededee; muted #8b8b93; accent #ff5b1f only on one word per caption, the hazard stripe and the
         Loadout mark. Geist 600 for captions at 58 px (5.4% of height), -2% tracking; Geist Mono for numbers.
         The opening floor is the app's halftone dot floor (4 px grid, dots fading from the middle).
         No shadow beyond a 0 2 16 rgba(0,0,0,.55) text-shadow on captions over the floor.
OBJECTS: the load sheet: a 720 px panel #111113 with the 5 px hazard stripe, "Store order" label, the store name,
         seven product rows (colour swatch, name, pack, cases in mono), a total row. The real app, recorded at
         3200 x 1800 and shown full frame; its own cursor is in the footage.
MOTION:  camera (wrapper scale / x / y) moves 0.9-1.2 s power2.inOut, starting as the cursor starts to travel;
         zooms 1.0-1.8x so recorded text stays sharp. Captions: per-word blur 6->0 px, 0.13 s, 0.07 s apart (most),
         whole-line blur-in 0.18 s (two of them); held 0.5 s + 0.3 s a word at least; exit blur-out 0.2 s.
         Sheet rows print 0.09 s apart, opacity 0 -> 1 with 4 px blur, no slide. Carry-across: the sheet shrinks into
         the Grocery Friday button in 0.8 s power3.inOut, blur peaking at 6 px; the app blur-swaps in behind it.
SHOTS:   0-4.6   load sheet prints; "Friday's order." then "How does it fit on pallets?" (pallets in orange);
                 the sheet carries into the app and lands on the Grocery Friday button.
         ~4.9    click; full-frame app; slow push to the pallet as it builds: "Pick an order. Loadout builds the pallets."
         stats   camera to the stats as the cursor points: "Every pallet stays under 60 in and 2,200 lb."
         tabs    camera to the tabs, click P2, it builds: "Five pallets. Click one to see it built."
         layers  camera to the layer list and pallet; hover one by one: "Hover a layer to see it on its own."
         chips   camera to the Chips row and pallet: "Heavy cases go low. Chips ride on top."
         change  camera to the cans row and pallet, three clicks on +: "Change a number and it rebuilds."
         add     camera to the form; typing: "Carry something else? Add your own." then the preview:
                 "It shows how many fit per layer."
         payoff  pull back to the whole app, then a hard cut to a closer shot: the cursor clicks the pallet that
                 got the iced tea and it builds, coral cases landing last on top. "Your order, built into pallets."
                 holds 7.5 s across the cut; the Loadout mark lands on the right of the strip.
SOUND:   locally generated bed (calm minimal electronic, soft plucks, light kick, ~100 bpm), -16 LUFS-ish under
         effects; click / click-soft alternating on real clicks; key ticks under typing; one whoosh on the
         carry-across; one pop when the preview number lands.
BANNED:  a dark void with small things floating (the app fills the frame); glow, particles, gradients; every caption
         entering the same way; titles that move after landing; click rings; a title over a dimmed screenshot;
         drawn UI (only the real app); the logo docked in a corner; fast montage cuts.
QA:      frame 0 shows the sheet and a line; the carry lands exactly on the button before the click; every caption
         sits on dark floor, never on the UI it explains; recorded text stays sharp at the deepest zoom; the last
         line holds 2.5 s or more; sound peaks one frame after each click.
