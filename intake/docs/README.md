# Intake Documents

Put uploaded or referenced build documents here when they should be reused across multiple agent runs.

Recommended examples:

- requirements docs
- architecture docs
- workflow docs
- team skill indexes

After copying documents here, record them in `../manifest.json` (schemaVersion `2`) before running `seli`.
Create it from `../manifest.template.json` when needed.

Recommended manifest fields to keep in sync with this folder:

- `documents[].path`
- `decisions[].sourcePaths`
