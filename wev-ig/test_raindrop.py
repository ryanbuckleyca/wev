
from pathlib import Path
import os
import requests
from dotenv import load_dotenv

# Load .env from parent directory
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

token = os.environ["RAINDROP_TOKEN"]

# Fetch bookmarks
response = requests.get(
    "https://api.raindrop.io/rest/v1/raindrops/-1",
    headers={"Authorization": f"Bearer {token}"},
    params={"perpage": 50, "page": 0, "sort": "-created"},
)
response.raise_for_status()

bookmarks = response.json()["items"]

# Create output directory
output_dir = Path(__file__).resolve().parent / "images"
output_dir.mkdir(exist_ok=True)

# Download images
for index, item in enumerate(bookmarks, start=1):
    media = item.get("media") or []
    image_url = media[0].get("link") if media else item.get("cover")

    if not image_url:
        print(f"Skipping {index}: no image found")
        continue

    try:
        image_response = requests.get(image_url, timeout=30)
        image_response.raise_for_status()

        filename = output_dir / f"{index:02d}.jpg"
        filename.write_bytes(image_response.content)

        print(f"Downloaded {index:02d}: {item.get('title')}")

    except requests.RequestException as error:
        print(f"Failed {index:02d}: {error}")

print(f"\nFinished. Images saved to: {output_dir}")
