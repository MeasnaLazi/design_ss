# Store JSON templates (verbatim shapes)

Use these structures for `output/appstore.json` and `output/playstore.json`. Field names and nesting must match.

### Layout / device frame fields

- **`device_frame_type`:** Exactly one of **`iphone`**, **`ipad`**, **`phone`**, **`tablet`** (matches `.claude/skills/screenshot-brief/script/device-packs.mjs --type`).
- **`device_pack_path`:** Repo-relative path from the publisher repo root to the chosen pack’s `frame.json`, e.g. `composer/device-frames/iphone_12_pro/frame.json` (use the pack **`id`** from `.claude/skills/screenshot-brief/script/device-packs.mjs`).

Include both keys on **each** store JSON file produced in a run (they may mirror the same values when both files are written).

## `appstore.json`

```json
{
  "app_identifier": "",
  "version": "",
  "copyright": "",
  "primary_locale": "en-US",

  "device_frame_type": "",
  "device_pack_path": "",

  "name": "",
  "subtitle": "",
  "promotional_text": "",
  "description": "",
  "keywords": "",
  "release_notes": "",

  "support_url": "",
  "marketing_url": "",
  "privacy_url": "",

  "category": "",
  "secondary_category": "",

  "age_rating": "",

  "theme": {
    "style": "",
    "primary_color": "",
    "secondary_color": "",
    "background_color": "",
    "text_color": "",
    "accent_color": ""
  },

  "screenshots": [
    {
      "order": 1,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 2,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 3,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 4,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 5,
      "title": "",
      "subtitle": "",
      "description": ""
    }
  ]
}
```

### App Store category constants

`BOOKS`, `BUSINESS`, `DEVELOPER_TOOLS`, `EDUCATION`, `ENTERTAINMENT`, `FINANCE`, `FOOD_AND_DRINK`, `GAMES`, `GRAPHICS_AND_DESIGN`, `HEALTH_AND_FITNESS`, `LIFESTYLE`, `MAGAZINES_AND_NEWSPAPERS`, `MEDICAL`, `MUSIC`, `NAVIGATION`, `NEWS`, `PHOTO_AND_VIDEO`, `PRODUCTIVITY`, `REFERENCE`, `SHOPPING`, `SOCIAL_NETWORKING`, `SPORTS`, `TRAVEL`, `UTILITIES`, `WEATHER`

### `age_rating`

One of: `4+`, `9+`, `12+`, `17+`.

---

## `playstore.json`

```json
{
  "package_name": "",
  "version_name": "",
  "default_language": "en-US",

  "device_frame_type": "",
  "device_pack_path": "",

  "title": "",
  "short_description": "",
  "full_description": "",
  "release_notes": "",

  "category": "",
  "tags": [],
  "content_rating": "",

  "support_email": "",
  "support_url": "",
  "marketing_url": "",
  "privacy_policy_url": "",

  "theme": {
    "style": "",
    "primary_color": "",
    "secondary_color": "",
    "background_color": "",
    "text_color": "",
    "accent_color": ""
  },

  "screenshots": [
    {
      "order": 1,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 2,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 3,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 4,
      "title": "",
      "subtitle": "",
      "description": ""
    },
    {
      "order": 5,
      "title": "",
      "subtitle": "",
      "description": ""
    }
  ]
}
```

### Play Store category constants

`PRODUCTIVITY`, `HEALTH_AND_FITNESS`, `LIFESTYLE`, `TOOLS`, `ENTERTAINMENT`, `EDUCATION`, `FINANCE`, `SHOPPING`, `SOCIAL`, `TRAVEL_AND_LOCAL`, `FOOD_AND_DRINK`, `SPORTS`, `MUSIC_AND_AUDIO`, `BOOKS_AND_REFERENCE`, `PHOTOGRAPHY`, `NEWS_AND_MAGAZINES`, `BUSINESS`, `MEDICAL`, `WEATHER`, `COMMUNICATION`

### Character limits (enforcement)

| Field | Max |
| --- | --- |
| App Store `name`, `subtitle` | 30 |
| App Store `promotional_text` | 170 |
| App Store `description`, `release_notes` | 4000 |
| App Store `keywords` | 100 (comma-separated, **no spaces** after commas) |
| Play `title` | 30 |
| Play `short_description` | 80 |
| Play `full_description` | 4000 |
| Play `release_notes` | 500 |
| Screenshot `title` | 30 |
| Screenshot `subtitle` | 40 |
| Screenshot `description` | 80 |

### `content_rating` (Play)

Typical values: `Everyone`, `Everyone 10+`, `Teen`, `Mature 17+` (use Play Console wording the project expects).
