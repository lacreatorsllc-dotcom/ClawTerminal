#!/usr/bin/env python3
"""
Cinema Pipeline — AI action scene generator
Step 1: OpenRouter (Claude) generates a cinematic shot breakdown
Step 2: fal.ai (Kling v1.6) generates video clips per shot
Step 3: ffmpeg stitches clips into a final film

Usage:
  python generate.py "A street fighter must win a rigged match to save his family"
"""

import os
import sys
import json
import subprocess
import time
import requests
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')

FAL_KEY    = os.getenv('FAL_KEY')
OR_KEY     = os.getenv('OPENROUTER_API_KEY')

if not OR_KEY:
    print("Error: OPENROUTER_API_KEY not set in .env")
    sys.exit(1)

# ── 1. Shot Breakdown ────────────────────────────────────────────────────────

DIRECTOR_PROMPT = """You are a cinematic AI director specializing in high-impact action sequences.
Given a story idea, produce a structured shot breakdown for a 60–90 second short film.

Return a JSON object with this exact structure:
{
  "title": "Film title",
  "logline": "One sentence hook",
  "style_notes": "Overall visual style, color grade, mood",
  "total_duration": 90,
  "shots": [
    {
      "id": 1,
      "duration": 5,
      "camera": "Camera type and movement (e.g. Low-angle dolly push)",
      "action": "What visually happens in this shot",
      "prompt": "Highly detailed text-to-video prompt — subject, action, environment, lighting, camera move, lens, cinematic style. Min 50 words.",
      "voiceover": "Narration or dialogue (empty string if none)"
    }
  ]
}

Rules:
- 8–12 shots, total ~60–90s
- Prompts must be vivid and cinematic — reference specific lighting (golden hour, neon-lit, etc.), camera movements (crane shot, handheld chase, etc.), and film styles
- Build tension: establish → escalate → climax → resolve
- Voiceover only where it adds dramatic weight"""


def generate_breakdown(story: str) -> dict:
    from openai import OpenAI

    client = OpenAI(
        api_key=OR_KEY,
        base_url='https://openrouter.ai/api/v1',
        default_headers={
            'HTTP-Referer': 'https://clawterminal.app',
            'X-Title': 'ClawTerminal Cinema',
        }
    )

    print("Generating shot breakdown via OpenRouter...")
    FREE_MODELS = [
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'openai/gpt-oss-20b:free',
        'qwen/qwen3-next-80b-a3b-instruct:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-3-27b-it:free',
    ]

    last_err = None
    for model in FREE_MODELS:
        try:
            print(f"  Trying model: {model}")
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {'role': 'system', 'content': DIRECTOR_PROMPT},
                    {'role': 'user', 'content': f"Create a cinematic action scene breakdown for: {story}. Respond ONLY with valid JSON, no markdown."}
                ],
                max_tokens=2000,
            )
            content = response.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if content.startswith('```'):
                content = content.split('```')[1]
                if content.startswith('json'):
                    content = content[4:]
            return json.loads(content)
        except Exception as e:
            print(f"  {model} failed: {e}")
            last_err = e
            continue

    raise RuntimeError(f"All models failed. Last error: {last_err}")


# ── 2. Video Generation ──────────────────────────────────────────────────────

def generate_clip(shot: dict, output_dir: Path) -> Optional[Path]:
    """Generate one video clip via fal.ai Kling v1.6."""
    if not FAL_KEY:
        print(f"  [SKIP] Shot {shot['id']} — no FAL_KEY")
        return None

    os.environ['FAL_KEY'] = FAL_KEY

    try:
        import fal_client

        duration = min(int(shot['duration']), 10)  # Kling max 10s
        print(f"  Generating shot {shot['id']} ({duration}s): {shot['camera']}...")

        result = fal_client.run(
            "fal-ai/kling-video/v1.6/standard/text-to-video",
            arguments={
                "prompt": shot['prompt'],
                "duration": str(duration),
                "aspect_ratio": "16:9",
            }
        )

        video_url = result['video']['url']
        clip_path = output_dir / f"shot_{shot['id']:02d}.mp4"

        r = requests.get(video_url, stream=True, timeout=120)
        r.raise_for_status()
        with open(clip_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        print(f"  Saved: {clip_path.name}")
        return clip_path

    except Exception as e:
        print(f"  [ERROR] Shot {shot['id']}: {e}")
        return None


# ── 3. Stitch ────────────────────────────────────────────────────────────────

def stitch_clips(clips: list[Path], output_path: Path):
    """Concatenate clips with ffmpeg."""
    concat_file = output_path.parent / '_concat.txt'
    with open(concat_file, 'w') as f:
        for c in clips:
            f.write(f"file '{c.absolute()}'\n")

    cmd = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', str(concat_file),
        '-c', 'copy',
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    concat_file.unlink(missing_ok=True)

    if result.returncode == 0:
        print(f"\nFinal film: {output_path}")
    else:
        print(f"ffmpeg error:\n{result.stderr}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate.py \"your story idea\"")
        print('Example: python generate.py "A hacker races to stop a city blackout"')
        sys.exit(1)

    story = ' '.join(sys.argv[1:])
    timestamp = int(time.time())
    out = Path(__file__).parent / 'output' / str(timestamp)
    out.mkdir(parents=True, exist_ok=True)

    print(f"\nCinema Pipeline")
    print(f"Story  : {story}")
    print(f"Output : {out}\n")

    # Step 1 — Shot breakdown
    breakdown = generate_breakdown(story)

    with open(out / 'breakdown.json', 'w') as f:
        json.dump(breakdown, f, indent=2)

    print(f"\nTitle    : {breakdown['title']}")
    print(f"Logline  : {breakdown['logline']}")
    print(f"Style    : {breakdown.get('style_notes', '')}")
    print(f"Shots    : {len(breakdown['shots'])} | ~{breakdown.get('total_duration', '?')}s\n")

    print("Shot List:")
    print("─" * 64)
    for s in breakdown['shots']:
        vo = f"\n    VO: \"{s['voiceover'][:60]}\"" if s.get('voiceover') else ""
        print(f"  [{s['id']:02d}] {s['duration']}s | {s['camera']}")
        print(f"       {s['action'][:80]}{vo}")
    print("─" * 64)

    # Save voiceover script
    lines = [f"[{s['id']}] {s['voiceover']}" for s in breakdown['shots'] if s.get('voiceover')]
    if lines:
        vo_path = out / 'voiceover.txt'
        vo_path.write_text(f"# {breakdown['title']}\n\n" + '\n\n'.join(lines))
        print(f"\nVoiceover script → {vo_path}")

    # Step 2 — Video clips
    if FAL_KEY:
        print("\nGenerating video clips (this takes a few minutes)...")
        clips = []
        for s in breakdown['shots']:
            c = generate_clip(s, out)
            if c:
                clips.append(c)

        if clips:
            print(f"\nStitching {len(clips)} clips...")
            stitch_clips(clips, out / 'final.mp4')
        else:
            print("No clips generated.")
    else:
        print("\n[Video generation skipped — FAL_KEY missing]")
        print("Prompts are in breakdown.json. Add credits + FAL_KEY to generate.")

    print(f"\nDone → {out}")


if __name__ == '__main__':
    main()
