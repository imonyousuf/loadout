"""Writes the HyperFrames project for the Loadout tour from the recorded take's markers.

The take (take.mp4 + take.json) is the app recorded at 1600 x 900 CSS px, 2x. Every camera move
and caption is timed from the take's own events, so a re-recorded take only needs this re-run.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
FILM = HERE / "film"
take = json.loads((FILM / "assets" / "take.json").read_text())

FPS = take["fps"]
CSS_W, CSS_H = take["width"], take["height"]
K = 1920 / CSS_W  # output px per app CSS px
E = {}
for ev in take["events"]:
    E.setdefault(ev["name"], ev["t"])
BOX = take["boxes"]
TAKE_END = take["frames"] / FPS

# the ending is its own short take: the same order, the pallet with the iced tea clicked and built
pay = json.loads((FILM / "assets" / "payoff.json").read_text())
P = {ev["name"]: ev["t"] for ev in pay["events"]}
PAY_IN = P["start"]
PAY_LEN = round(P["end"] - P["start"], 3)
T_CUT = round(E["added"] + 2.3, 3)  # take time where the main take hands over to the ending

# film time of take time 0: the click on Grocery Friday lands just after the sheet has carried in
CLICK_FILM = 4.9
O = round(CLICK_FILM - E["click-preset"], 3)
SCENE_END = round(T_CUT + PAY_LEN, 3)  # the app scene's own length
FILM_END = round(O + SCENE_END, 3)


VIEW_H = 930  # the app plays in the top 930 px; captions sit in the strip below
FIT = VIEW_H / 1080  # the whole app fits the viewport at zoom 1


def cam(z, cx, cy):
    """Wrapper transform: zoom z (1 = whole app) centred on app point (cx, cy), never past the footage."""
    S = FIT * z
    x = 960 - S * K * cx
    y = VIEW_H / 2 - S * K * cy
    if S * 1920 >= 1920:
        x = min(0.0, max(1920 - 1920 * S, x))
    else:
        x = (1920 - 1920 * S) / 2
    if S * 1080 >= VIEW_H:
        y = min(0.0, max(VIEW_H - 1080 * S, y))
    else:
        y = (VIEW_H - 1080 * S) / 2
    return round(x, 1), round(y, 1), round(S, 4)


def to_screen(z, cx, cy, px, py):
    """Where app point (px, py) lands on screen under camera (z, cx, cy)."""
    x, y, S = cam(z, cx, cy)
    return x + S * K * px, y + S * K * py


def center(name):
    b = BOX[name]
    return b["x"] + b["w"] / 2, b["y"] + b["h"] / 2


# ---- camera: (take time, duration, zoom, centre x, centre y) --------------------------------------
pallet_c = (560, 520)
stats_c = center("stats")
tabs_c = center("tabs")
layers_c = center("layers")
form_box = BOX.get("form") or BOX["addbtn"]
form_c = (form_box["x"] + form_box["w"] / 2, form_box["y"] + form_box["h"] / 2)
moves = [
    (E["build-start"] + 0.35, 2.2, 1.3, 600, 470),
    (E["at-stats"] - 1.05, 1.05, 1.75, stats_c[0] + 230, stats_c[1] + 190),
    (E["click-p2"] - 1.3, 1.1, 1.6, tabs_c[0] + 300, tabs_c[1] - 250),
    (E["layers-start"] - 0.1, 1.05, 1.6, layers_c[0] - 250, layers_c[1] + 140),
    (E["chips-hover"] - 1.35, 1.15, 1.4, 990, 560),
    (E["cans-plus-1"] - 1.15, 1.05, 1.5, 1060, 400),
    (E["click-add"] - 1.7, 1.1, 1.55, 1180, 640),
    (E["form-open"] - 0.55, 0.9, 1.7, form_c[0] - 70, form_c[1]),
    (E["preview-ready"] - 1.1, 0.95, 2.0, form_box["x"] + form_box["w"] / 2 - 80, form_box["y"] + form_box["h"] - 140),
    (E["added"] + 0.3, 1.5, 1.0, 800, 450),
]

# ---- captions: (id, take start, take end, words, accent words, left, top, entrance) -------------
CAP_X = round((1920 - 1920 * FIT) / 2)
CAP_Y = 958
captions = [
    ("c1", E["click-preset"] + 0.45, E["built"] - 0.15, "Pick an order. Loadout builds the pallets.", {"pallets."}, "words"),
    ("c2", E["at-stats"] - 0.65, E["click-p2"] - 0.9, "Every pallet stays under 60 in, 2,200 lb.", set(), "line"),
    ("c3", E["click-p2"] - 0.2, E["layers-start"] + 0.2, "Five pallets. Click one to see it built.", {"Click"}, "words"),
    ("c4", E["layers-start"] + 0.95, E["layers-end"] + 0.05, "Hover a layer to see it on its own.", {"layer"}, "words"),
    ("c5", E["chips-hover"] - 0.6, E["cans-plus-1"] - 1.0, "Heavy cases go low. Chips ride on top.", {"top."}, "grey"),
    ("c6", E["cans-plus-1"] - 0.3, E["click-add"] - 1.25, "Change a number and it rebuilds.", {"rebuilds."}, "words"),
    ("c7", E["click-add"] - 0.55, E["preview-ready"] - 0.85, "Carry something else? Add your own.", {"own."}, "line"),
    ("c8", E["preview-ready"] - 0.6, E["added"] + 0.35, "It shows how many fit per layer.", {"per", "layer."}, "words"),
    ("c9", E["added"] + 0.75, SCENE_END, "Your order, built into pallets.", {"pallets."}, "words"),
]
MONO = set()

clicks = [ev for ev in take["events"] if ev["name"].startswith(("click", "cans-plus", "focus"))]


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "’")


def caption_html(cid, words, accent):
    spans = []
    for w in words.split(" "):
        cls = []
        if w in accent:
            cls.append("accent")
        if w in MONO:
            cls.append("num")
        c = f' class="{" ".join(cls)}"' if cls else ""
        spans.append(f"<span{c}>{esc(w)}</span>")
    return " ".join(spans)


# ---- app scene --------------------------------------------------------------------------------------
cap_divs = []
cap_js = []
for cid, a, b, words, accent, kind in captions:
    left, top = CAP_X, CAP_Y
    a, b = round(a, 3), round(min(b, SCENE_END), 3)
    dur = round(b - a, 3)
    n = len(words.split(" "))
    need = 0.5 + 0.3 * n
    assert dur >= need - 0.05, f"{cid} holds {dur:.2f} s, needs {need:.2f}"
    cap_divs.append(
        f'    <div id="{cid}" class="clip cap" data-start="{a}" data-duration="{dur}" data-track-index="3" '
        f'style="left:{left}px;top:{top}px">{caption_html(cid, words, accent)}</div>'
    )
    sel = f"#{cid} span"
    if kind == "words":
        cap_js.append(f'tl.fromTo("{sel}", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.13, ease: "power4.out", stagger: 0.07 }}, {a + 0.02});')
    elif kind == "line":
        cap_js.append(f'tl.fromTo("{sel}", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.2, ease: "power3.out" }}, {a + 0.02});')
    else:  # grey to ink, word by word, no movement
        cap_js.append(f'tl.fromTo("{sel}", {{ opacity: 0.18 }}, {{ opacity: 1, duration: 0.18, ease: "power2.out", stagger: 0.09 }}, {a + 0.02});')
    if cid != "c9":
        cap_js.append(f'tl.to("{sel}", {{ opacity: 0, filter: "blur(8px)", duration: 0.2, ease: "power2.in", stagger: 0.015 }}, {round(b - 0.24, 3)});')

cam_js = []
x0, y0, z0 = cam(1.0, 800, 450)
cam_js.append(f'tl.set("#app-cam", {{ x: {x0}, y: {y0}, scale: {z0} }}, 0);')
for t, d, z, cx, cy in moves:
    x, y, s = cam(z, cx, cy)
    cam_js.append(f'tl.to("#app-cam", {{ x: {x}, y: {y}, scale: {s}, duration: {d}, ease: "power2.inOut" }}, {round(t, 3)});')
# the ending: a punch-in on the pallet and its tabs, then a slow settle while the tea builds
# the tabs stay in frame until the pallet with the tea is clicked, then the camera settles onto it
x, y, s = cam(1.25, 560, 590)
cam_js.append(f'tl.set("#app-cam", {{ x: {x}, y: {y}, scale: {s} }}, {T_CUT});')
t_click = round(T_CUT + P["click-tea-pallet"] - PAY_IN, 3)
x2, y2, s2 = cam(1.42, 600, 505)
cam_js.append(f'tl.to("#app-cam", {{ x: {x2}, y: {y2}, scale: {s2}, duration: {round(SCENE_END - t_click - 0.6, 3)}, ease: "power2.inOut" }}, {round(t_click + 0.25, 3)});')

mark_t = round(T_CUT + (P["tea-build"] - PAY_IN) + 1.1, 3)
app_html = f"""<template>
  <style>
    @font-face {{ font-family: "Geist"; src: url("assets/fonts/Geist-SemiBold.woff2") format("woff2"); font-weight: 600; }}
    @font-face {{ font-family: "Geist"; src: url("assets/fonts/Geist-Bold.woff2") format("woff2"); font-weight: 700; }}
    @font-face {{ font-family: "Geist Mono"; src: url("assets/fonts/GeistMono-Medium.woff2") format("woff2"); font-weight: 500; }}
    @font-face {{ font-family: "Geist Mono"; src: url("assets/fonts/GeistMono-SemiBold.woff2") format("woff2"); font-weight: 600; }}
    #root {{ position: absolute; inset: 0; overflow: hidden; background: #0b0b0c; font-family: "Geist", sans-serif; color: #ededee; }}
    #app-view {{ position: absolute; left: 0; top: 0; width: 1920px; height: {VIEW_H}px; overflow: hidden; }}
    #app-rule {{ position: absolute; left: {CAP_X}px; right: {CAP_X}px; top: {VIEW_H}px; height: 1px; background: #232327; }}
    #app-cam {{ position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }}
    #app-take, #app-pay {{ position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }}
    .cap {{ position: absolute; font-weight: 600; font-size: 56px; letter-spacing: -0.025em; line-height: 1.1; white-space: nowrap; }}
    .cap span {{ display: inline-block; }}
    .cap .num {{ font-family: "Geist Mono", monospace; font-weight: 600; letter-spacing: -0.03em; }}
    .accent {{ color: #ff5b1f; }}
    #app-mark {{ position: absolute; right: {CAP_X}px; top: {CAP_Y + 4}px; display: flex; align-items: center; gap: 16px; }}
    #app-mark .glyph {{ position: relative; width: 52px; height: 52px; }}
    #app-mark .glyph i, #app-mark .glyph b {{ position: absolute; left: 6px; right: 6px; border-radius: 2px; }}
    #mk-a {{ top: 8px; height: 13px; background: #ff5b1f; }}
    #mk-b {{ top: 24px; height: 13px; background: #ff5b1f; opacity: .65; }}
    #mk-c {{ top: 40px; height: 7px; background: #c9a06b; left: 1px !important; right: 1px !important; }}
    #app-mark .word {{ font-size: 44px; font-weight: 700; letter-spacing: -0.03em; }}
  </style>

  <div id="root" data-composition-id="app" data-width="1920" data-height="1080">
    <div id="app-rule"></div>
    <div id="app-view">
      <div id="app-cam">
        <video id="app-take" class="clip" src="assets/take.mp4" data-start="0" data-duration="{T_CUT}" data-track-index="1" muted playsinline></video>
        <video id="app-pay" class="clip" src="assets/payoff.mp4" data-hf-media-start-basis="local" data-start="{T_CUT}" data-media-start="{PAY_IN}" data-duration="{PAY_LEN}" data-track-index="2" muted playsinline></video>
      </div>
    </div>
{chr(10).join(cap_divs)}
    <div id="app-mark" class="clip" data-start="{mark_t}" data-duration="{round(SCENE_END - mark_t, 3)}" data-track-index="4">
      <div class="glyph"><i id="mk-a"></i><i id="mk-b"></i><b id="mk-c"></b></div>
      <div class="word" id="mk-word">Loadout</div>
    </div>
  </div>

  <script>
    const tl = gsap.timeline({{ paused: true }});
    // the app blur-swaps in under the sheet as it carries the order across
    tl.fromTo("#app-view", {{ opacity: 0, filter: "blur(10px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "power2.out" }}, {round(3.95 - O, 3)});
    tl.fromTo("#app-rule", {{ opacity: 0, scaleX: 0.4 }}, {{ opacity: 1, scaleX: 1, duration: 0.6, ease: "expo.out" }}, {round(4.2 - O, 3)});

    // camera
    {chr(10).join("    " + l for l in cam_js).strip()}

    // captions
    {chr(10).join("    " + l for l in cap_js).strip()}

    // the mark: the plank lands, then two cases drop onto it, then the name
    tl.fromTo("#mk-c", {{ opacity: 0, scaleX: 0.6 }}, {{ opacity: 1, scaleX: 1, duration: 0.3, ease: "expo.out" }}, {mark_t + 0.02});
    tl.fromTo("#mk-b", {{ opacity: 0, y: -26 }}, {{ opacity: .65, y: 0, duration: 0.42, ease: "back.out(1.4)" }}, {mark_t + 0.14});
    tl.fromTo("#mk-a", {{ opacity: 0, y: -26 }}, {{ opacity: 1, y: 0, duration: 0.42, ease: "back.out(1.4)" }}, {mark_t + 0.28});
    tl.fromTo("#mk-word", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.2, ease: "power3.out" }}, {mark_t + 0.5});

    window.__timelines["app"] = tl;
  </script>
</template>
"""
(FILM / "compositions" / "app.html").write_text(app_html)

# ---- order scene: land the sheet on the Grocery Friday button ----------------------------------------
pb = BOX["presets"]
bw = (pb["w"] - 12) / 3
btn_cx, btn_cy = to_screen(1.0, 800, 450, pb["x"] + bw * 1.5 + 6, pb["y"] + pb["h"] / 2)  # middle button, 6 px gaps
sheet_cx, sheet_cy = 236 + 360, 118 + 422
land_scale = round((bw * K * FIT) / 720, 4)
order = (FILM / "compositions" / "order.html").read_text()
order = re.sub(r"const LAND = \{[^}]*\};",
               f"const LAND = {{ x: {round(btn_cx - sheet_cx, 1)}, y: {round(btn_cy - sheet_cy, 1)}, scale: {land_scale} }};", order)
order = order.replace("__LAND_X__", str(round(btn_cx - sheet_cx, 1))).replace("__LAND_Y__", str(round(btn_cy - sheet_cy, 1))).replace("__LAND_SCALE__", str(land_scale))
(FILM / "compositions" / "order.html").write_text(order)

# ---- sound -----------------------------------------------------------------------------------------
audio = []
# each sound peaks one frame after its picture: start = event + 1 frame - the file's peak
PEAK = {"click.mp3": 0.073, "click-soft.mp3": 0.073, "key-press.mp3": 0.076, "pop.mp3": 0.12, "whoosh-short.mp3": 0.162}
F1 = 1 / FPS
alt = ["click.mp3", "click-soft.mp3"]
for i, ev in enumerate(clicks):
    f = alt[i % 2]
    t = round(O + ev["t"] + F1 - PEAK[f], 3)
    vol = 0.32 if f == "click.mp3" else 0.42
    audio.append(f'      <audio id="sfx-click{i+1}" class="clip" src="assets/sfx/{f}" data-start="{t}" data-duration="0.22" data-track-index="{12 + (i % 2) * 3}" data-volume="{vol}"></audio>')
pt = round(O + T_CUT + (P["click-tea-pallet"] - PAY_IN) + F1 - PEAK["click.mp3"], 3)
audio.append(f'      <audio id="sfx-click-pay" class="clip" src="assets/sfx/click.mp3" data-start="{pt}" data-duration="0.22" data-track-index="12" data-volume="0.32"></audio>')
# keys under typing: the name and the category get a burst (its sound starts 0.43 s into the file), numbers a tick
typing = [("focus-name", 1.05), ("focus-cat", 0.3)]
for i, (name, d) in enumerate(typing):
    t = round(O + E[name] + 0.12, 3)
    audio.append(f'      <audio id="sfx-type{i+1}" class="clip" src="assets/sfx/typing.mp3" data-start="{t}" data-media-start="0.43" data-duration="{d}" data-track-index="13" data-volume="0.3" data-fade-out="0.1"></audio>')
for i, name in enumerate(["focus-l", "focus-w", "focus-h", "focus-wt"]):
    t = round(O + E[name] + 0.12 + F1 - PEAK["key-press.mp3"], 3)
    audio.append(f'      <audio id="sfx-key{i+1}" class="clip" src="assets/sfx/key-press.mp3" data-start="{t}" data-duration="0.2" data-track-index="14" data-volume="0.3"></audio>')
audio.append(f'      <audio id="sfx-carry" class="clip" src="assets/sfx/whoosh-short.mp3" data-start="{round(4.32 - PEAK["whoosh-short.mp3"], 3)}" data-duration="0.5" data-track-index="11" data-volume="0.3"></audio>')
audio.append(f'      <audio id="sfx-fits" class="clip" src="assets/sfx/pop.mp3" data-start="{round(O + E["preview-ready"] + F1 - PEAK["pop.mp3"], 3)}" data-duration="0.5" data-track-index="16" data-volume="0.26"></audio>')
bgm = FILM / "assets" / "bgm" / "track.wav"
if bgm.exists():
    audio.insert(0, f'      <audio id="bgm" class="clip" src="assets/bgm/track.wav" data-start="0" data-duration="{FILM_END}" data-track-index="10" data-volume="0.72" data-fade-in="0.3" data-fade-out="1.2"></audio>')

index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0b0b0c; }}
      #root {{ width: 100%; height: 100%; position: relative; background: #0b0b0c; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{FILM_END}" data-width="1920" data-height="1080">
      <div id="app" data-composition-id="app" data-composition-src="compositions/app.html" data-start="{O}" data-duration="{round(FILM_END - O, 3)}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:1"></div>
      <div id="order" data-composition-id="order" data-composition-src="compositions/order.html" data-start="0" data-duration="4.8" data-track-index="2" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:2"></div>
{chr(10).join(audio)}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
(FILM / "index.html").write_text(index)
print(json.dumps({"O": O, "film_end": FILM_END, "cut": round(O + T_CUT, 2), "events": {k: round(O + v, 2) for k, v in E.items()},
                  "ending": {k: round(O + T_CUT + v - PAY_IN, 2) for k, v in P.items()}}, indent=1))
