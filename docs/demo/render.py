#!/usr/bin/env python3
"""Responsibility: turn the raw screen recording into the shipped demo files.

Usage: python3 docs/demo/render.py <raw.mp4 | frames-dir> <output-dir> [trim-seconds]

A frames-dir (from scene.js with FRAMES set) holds sharp JPEG screenshots and a frames.txt timing list.

Writes <output-dir>/collabhtml-demo.mp4 (sharp, small) and <output-dir>/collabhtml-demo.gif (for the README).
The bottom 30 px are cropped to remove the Browser Control status badge, which shows on cards. trim-seconds removes the first moments, before the intro card fades in.
"""
import os
import subprocess
import sys

raw, out_dir = sys.argv[1], sys.argv[2]
trim = sys.argv[3] if len(sys.argv) > 3 else '0.6'
src = ['-f', 'concat', '-safe', '0', '-i', os.path.join(raw, 'frames.txt')] if os.path.isdir(raw) else ['-i', raw]
mp4 = os.path.join(out_dir, 'collabhtml-demo.mp4')
gif = os.path.join(out_dir, 'collabhtml-demo.gif')

subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', trim, *src, '-vf', 'scale=1512:-2:flags=lanczos,crop=iw:trunc((ih-30)/2)*2:0:0,fps=25,format=yuv420p',
                '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4], check=True)

filters = ('scale=1512:-2:flags=lanczos,crop=iw:trunc((ih-30)/2)*2:0:0,fps=12,scale=1120:-1:flags=lanczos,split[a][b];'
           '[a]palettegen=max_colors=128:stats_mode=diff[p];'
           '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', trim, *src, '-vf', filters, '-loop', '0', gif], check=True)

for path in (mp4, gif):
    print(f'{os.path.getsize(path) / 1024 / 1024:.2f} MB  {path}')
