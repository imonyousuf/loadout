import time, numpy as np, soundfile as sf, torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration
torch.set_num_threads(2)
t0 = time.time()
proc = AutoProcessor.from_pretrained("facebook/musicgen-small")
model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
sr = model.config.audio_encoder.sampling_rate
prompt = ("calm minimal electronic background for a product demo, soft warm plucked synth arpeggio, mellow pads, "
          "light kick and soft shaker, steady 100 bpm, focused and optimistic, clean modern mix, no vocals")
torch.manual_seed(11)
inp = proc(text=[prompt], padding=True, return_tensors="pt")
a = model.generate(**inp, do_sample=True, guidance_scale=3.5, max_new_tokens=1500)[0, 0].numpy()
sf.write("/home/claude/mg/tour1.wav", a, sr); print("part1", round(len(a) / sr, 1), "s", round(time.time() - t0), "s elapsed", flush=True)
ctx = a[-10 * sr:]
prompt2 = ("the same calm minimal electronic track continues, soft plucked arpeggio and pads, light kick, steady 100 bpm, "
           "a little brighter and fuller, optimistic, clean modern mix, no vocals")
inp2 = proc(audio=ctx, sampling_rate=sr, text=[prompt2], padding=True, return_tensors="pt")
b = model.generate(**inp2, do_sample=True, guidance_scale=3.5, max_new_tokens=1500)[0, 0].numpy()
sf.write("/home/claude/mg/tour2.wav", b, sr); print("part2", round(len(b) / sr, 1), "s", round(time.time() - t0), "s elapsed", flush=True)
