# Video Optimization Guide for GitHub README

This guide provides ffmpeg commands to optimize gameplay recordings for embedding in the GitHub README.

## Quick Start

After recording your gameplay video, use these commands to create optimized versions:

### 1. Optimize as MP4 (Recommended for GitHub)

Creates a web-optimized MP4 with H.264 encoding:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  -vf "scale=1280:-2" \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  -pix_fmt yuv420p \
  gameplay.mp4
```

**Parameters explained:**
- `-c:v libx264`: Use H.264 codec (widely supported)
- `-preset slow`: Better compression (use `medium` for faster encoding)
- `-crf 23`: Quality setting (18-28 range, lower = better quality but larger file)
- `-vf "scale=1280:-2"`: Scale to 1280px width, maintain aspect ratio
- `-c:a aac -b:a 128k`: Audio codec and bitrate
- `-movflags +faststart`: Enables progressive download (starts playing before fully downloaded)
- `-pix_fmt yuv420p`: Ensures compatibility with all players

### 2. Create a Smaller Version (For faster loading)

If the file is still too large, create a more compressed version:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset medium \
  -crf 28 \
  -vf "scale=960:-2" \
  -c:a aac \
  -b:a 96k \
  -movflags +faststart \
  -pix_fmt yuv420p \
  gameplay-small.mp4
```

### 3. Create an Animated GIF (Alternative)

GitHub supports GIFs natively, but they can be large. Use this for short clips:

```bash
# First, create a palette for better quality
ffmpeg -i input.mp4 -vf "fps=15,scale=640:-1:flags=lanczos,palettegen" palette.png

# Then create the GIF using the palette
ffmpeg -i input.mp4 -i palette.png \
  -filter_complex "fps=15,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse" \
  gameplay.gif

# Clean up
rm palette.png
```

**Note:** GIFs are typically much larger than MP4s. Use only for short clips (< 10 seconds).

### 4. Extract a Thumbnail/Preview Image

Create a preview image to use as a clickable link:

```bash
# Extract frame at 2 seconds (or adjust -ss value)
ffmpeg -i input.mp4 -ss 00:00:02 -vframes 1 -vf "scale=1280:-2" gameplay-thumbnail.png
```

## File Size Targets

- **MP4**: Aim for 5-15 MB for a 30-60 second clip
- **GIF**: Can be 10-50 MB for the same clip (use sparingly)
- **Thumbnail**: Should be < 500 KB

## Adding to README

### Option 1: Direct Video Embed (Recommended)

GitHub supports HTML5 video tags in READMEs. Place your video file in `docs/` or `assets/` and reference it:

```markdown
<video width="100%" controls>
  <source src="docs/gameplay.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>
```

### Option 2: Animated GIF

```markdown
![Gameplay](docs/gameplay.gif)
```

### Option 3: Thumbnail with Link

```markdown
[![Gameplay Video](docs/gameplay-thumbnail.png)](docs/gameplay.mp4)
```

## Advanced: Trim and Optimize

If you need to trim the video and optimize in one step:

```bash
ffmpeg -i input.mp4 \
  -ss 00:00:05 \
  -t 00:00:30 \
  -c:v libx264 \
  -preset slow \
  -crf 23 \
  -vf "scale=1280:-2" \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  -pix_fmt yuv420p \
  gameplay.mp4
```

- `-ss 00:00:05`: Start at 5 seconds
- `-t 00:00:30`: Duration of 30 seconds

