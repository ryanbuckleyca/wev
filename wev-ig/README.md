# wev-ig

Download full-resolution Instagram images from Raindrop.io bookmarks for WEV
job-roundup carousels.

## Setup

```bash
cd wev-ig
source .venv-siloe/bin/activate   # Python 3.11, gallery-dl, Pillow, requests
```

`RAINDROP_TOKEN` comes from the parent `../.env`. Instagram auth uses your
Brave browser session (`gallery-dl --cookies-from-browser brave`).

## Usage

```bash
python download_carousels.py --dry-run          # list saved Instagram posts
python download_carousels.py --limit 2          # first slide of 2 posts
python download_carousels.py                    # first slide of every new post
python download_carousels.py --all-slides       # every carousel slide
```

Images land in `downloads/<shortcode>/`. Progress is recorded in
`downloads/manifest.csv`; reruns skip successful posts unless `--force`.

`test_raindrop.py` is the earlier Raindrop-only thumbnail downloader; keep it
for API checks. Prefer `download_carousels.py` for production downloads.
