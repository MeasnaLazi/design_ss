# <App Name>

The strip folder is named from this heading: "Bio Journal" → `strips/bio-journal/`.

## About

- summary: One or two sentences on what the app does and who it is for.
- category: e.g. lifestyle / journal, productivity, finance
- tone: e.g. warm and literary · clinical and precise · playful
- theme: #f5f1ee / #0c0c0a        <!-- background / ink; accent optional -->
- store: appstore | play
- preset: appstore_iphone_portrait

`tone` and `theme` steer type and palette. Leave either out and the agent infers
from the summary and says what it inferred.

## Panel 0

- title: Your Life, Beautifully Kept
- subtitle: Turn everyday moments into a story worth keeping.
- screenshot: welcome.jpg

## Panel 1

- title: Every Day, In Order
- subtitle: Browse your memories on an interactive timeline.
- screenshot: timeline.jpg

## Panel 2

- title: Speak It, Save It
- subtitle: Record a thought — the app transcribes it for you.
- caption: Works offline
- screenshot: voice.jpg

## Panel 3

- title: Perfect Every Page
- subtitle: Let AI clean up grammar and tighten your notes.
- screenshot: rewrite.jpg

## Panel 4

- title: Made For You Alone
- subtitle: Private by default. Your story, your device.
- screenshot: privacy.jpg

<!--
Keys: title, subtitle, caption, screenshot. A title is required; the rest are
optional. One title and one subtitle per panel — a caption only when it earns
its place.

`screenshot` names a file sitting beside this one in input/. Omit it and that
panel's device renders a blank screen, which is a legitimate design choice.

Copy is taken verbatim. If a line does not fit the layout the agent says so
rather than rewording it — the words are yours.

Anything else in this file is a note to the designer, not copy to render.
-->
