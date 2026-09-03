# Splitting the Planning repository

Decision (3 Sep 2026): one repository per thing. Company tooling must not share a repo
with family projects, and the shared repo was public.

| New repository | Visibility | Source | Prefix |
|---|---|---|---|
| `landpower-projects` | **private** | branch `claude/team-project-dashboard-jxx92s` | `Project-Dashboard/` |
| `farm-safety-training` | public (matches today; contains real farm and emergency details — consider private) | branch `claude/farm-safety-training-pack-1v08gi` | `Farm-Safety-Training-Pack/` |
| `beas-course-builder` | public (matches today) | branch `claude/farm-safety-training-pack-1v08gi` | `Beas-Course-Builder/` |

The GitHub integration used by Claude cannot create repositories (403), so the three
repositories have to be created by hand at github.com/new. Leave them empty — no
README, no licence — so the first push is a clean import.

## Producing the split histories

`git subtree split` checks the prefix against the *current* HEAD, so run each split
from a worktree checked out at the source branch.

```bash
git fetch origin claude/farm-safety-training-pack-1v08gi claude/team-project-dashboard-jxx92s

# Land & Power tooling
git worktree add /tmp/wt-lp origin/claude/team-project-dashboard-jxx92s --detach
( cd /tmp/wt-lp && git subtree split --prefix=Project-Dashboard HEAD -b split/landpower )
git worktree remove --force /tmp/wt-lp

# Farm safety pack and Bea's course builder
git worktree add /tmp/wt-src origin/claude/farm-safety-training-pack-1v08gi --detach
( cd /tmp/wt-src \
  && git subtree split --prefix=Farm-Safety-Training-Pack HEAD -b split/farm-safety \
  && git subtree split --prefix=Beas-Course-Builder HEAD -b split/beas )
git worktree remove --force /tmp/wt-src
```

## Pages workflow for the two apps

The original workflow assembled both apps into one Pages site from the shared repo. In
its own repository each app deploys from `app/` to the site root. Add this file as
`.github/workflows/deploy-pages.yml` on `split/farm-safety` and `split/beas`:

```yaml
name: Deploy app to GitHub Pages

on:
  push:
    branches: [main]
    paths: ["app/**", ".github/workflows/deploy-pages.yml"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
        with:
          enablement: true
      - name: Assemble the site
        run: |
          set -euo pipefail
          rm -rf _site && mkdir _site
          cp -R app/. _site/
          touch _site/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Pushing

```bash
git push git@github.com:hoganben04/landpower-projects.git    split/landpower:main
git push git@github.com:hoganben04/farm-safety-training.git  split/farm-safety:main
git push git@github.com:hoganben04/beas-course-builder.git   split/beas:main
```

## Consequences to know about

- The Pages URLs change. Today both apps are served from the `Planning` repo at
  `hoganben04.github.io/Planning/` and `/Planning/course-builder/`. After the split they
  become `hoganben04.github.io/farm-safety-training/` and
  `hoganben04.github.io/beas-course-builder/`. Anyone with the old link needs the new one.
- GitHub Pages on a **private** repository needs a paid plan. If `farm-safety-training`
  is made private, the training app stops being served unless the plan covers it.
- Keep `Planning` until the new repos are confirmed working, then archive it — do not
  delete it while any Pages link still points at it.
