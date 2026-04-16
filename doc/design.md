# Showcase Design Decisions — 2026-04-16

## Entity Model

```
Project 1──* Folder 0..1──* Folder (self, unlimited depth)
                   1──* FolderImage *──1 Image
```

**Project** — groups independent root folders (e.g. "Old Books", "Maps")

**Folder** — name, note, properties (JSONB), sort_order, version (Draft/Published), setup (JSONB nullable)
- Root folder = setup non-null (at any depth, not necessarily top-level)
- Organizing folder = setup null, no properties/images — just grouping
- No root under another root on a vertical path (enforced by logic)
- Child folders inherit setup from their root ancestor

**FolderImage** — filename, caption, section, is_main, sort_order
- Contextual: how an image appears in a specific folder version
- Section is implicit: same section name = same group, first occurrence = jump target

**Image** — storage_key, crop, rotation
- Physical asset, stored once in the Supabase bucket, never duplicated
- Shared between draft and published via FolderImage links

## Draft / Published Workflow

- Each root folder + its subtree exists in draft and published versions
- Admin works on draft. Public sees published only.
- Publish action (per root, all-or-nothing):
  1. Delete published folders under this root
  2. Copy draft folders as published rows
  3. Copy FolderImage links (same image IDs, new published folder IDs)
  4. No image binary duplication
- An image can be linked from a draft folder AND a different published folder (e.g. reorg in progress)

## Image Sections (Book Navigation)

Images have optional section and caption fields on FolderImage.
Example: Cover, Table of contents, Chapter I, Chapter II...
Section list in UI = clickable, scrolls to first image of that section.

## Frontend Architecture

- Public: ShowcaseView only (read-only, sorting/filtering)
- Admin: same app, route-guarded, adds FileExplorer + editing (later)
- No login for first iteration, coming soon
- Home page → Enter → ShowcaseView

## Infrastructure

- Frontend: Vercel (auto-deploy from main)
- Backend: FastAPI on Render (free tier)
- Database: Supabase Postgres
- Images: Supabase Storage
- Vercel API proxy with CDN caching eliminates Render cold-start wait
- GitHub Actions keep-alive cron as backup
