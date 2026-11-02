"""Harman: tempo / ton değiştirme (Rubber Band, pedalboard üzerinden).

Kullanım: stretch.py GİRİŞ.wav ÇIKIŞ.wav --stretch 1.05 --semitones 2

--stretch: hız çarpanı (1.05 = %5 daha hızlı, süre kısalır; ton değişmez)
--semitones: ton kaydırma (süre değişmez)
"""
import argparse
import sys

from pedalboard import time_stretch
from pedalboard.io import AudioFile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--stretch", type=float, default=1.0)
    ap.add_argument("--semitones", type=float, default=0.0)
    args = ap.parse_args()

    with AudioFile(args.src) as f:
        audio = f.read(f.frames)
        rate = f.samplerate

    out = time_stretch(
        audio,
        rate,
        stretch_factor=args.stretch,
        pitch_shift_in_semitones=args.semitones,
        high_quality=True,
        transient_mode="crisp",
        preserve_formants=True,
    )

    with AudioFile(args.dst, "w", rate, out.shape[0], bit_depth=32) as f:
        f.write(out)
    print(f"ok {audio.shape[1] / rate:.3f}s -> {out.shape[1] / rate:.3f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
