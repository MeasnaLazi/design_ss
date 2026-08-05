# Strip copy

One markdown file per strip: `datasource/input/<strip-name>.md`, matching the
strip at `output/strips/<strip-name>.html`.

This is where panel copy lives — titles, subtitles, captions. **When a file here
exists it is the source of truth**, and the copy is taken from it verbatim. Edit
the copy here rather than in the strip HTML, then ask for the strip to be
updated.

The format and the rules around it are in
[`.claude/skills/strip-design/SKILL.md`](../../.claude/skills/strip-design/SKILL.md)
§ Where copy comes from. Files here are tracked in git — unlike
`datasource/screenshots/`.
