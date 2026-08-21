# ScriptToClips Pitch Deck

## 1. Title

**ScriptToClips**

Turn scripts into ready-to-edit stock media packs.

**Presenter:** Francis Faniku  
**Category:** AI-assisted video production workflow tool

Speaker note:
ScriptToClips helps creators move from written scripts to usable visual assets faster by validating scene breakdowns, searching stock media, ranking the best matches, and packaging selected assets for editing.

---

## 2. Problem

Video creators waste too much time turning scripts into visual material.

- A single script can require dozens of scene-by-scene stock media searches.
- Search results are noisy, repetitive, and often only loosely related to the scene.
- Creators manually copy links, preview assets, download files, and organize clips.
- The process slows down editors, social media teams, educators, marketers, and solo creators.

Speaker note:
The pain is not just finding stock media. The pain is the repeated workflow: interpret the script, think of search phrases, test searches, compare results, save files, and keep everything organized per scene.

---

## 3. Solution

ScriptToClips turns a structured script breakdown into ranked media results.

- Users generate scene JSON from a built-in ChatGPT prompt.
- ScriptToClips validates the scene structure before fetching media.
- The app searches Pexels for videos or pictures per scene.
- OpenAI ranks candidate media by visual relevance.
- Users preview, replace, select, and download organized assets as a ZIP.

Speaker note:
The product acts like a bridge between script writing and video editing. It does not try to be a full editor. It focuses on the painful asset sourcing step and makes it repeatable.

---

## 4. Target Users

ScriptToClips is built for people who create video content frequently.

- Short-form video creators
- YouTube editors
- Social media managers
- Marketing teams
- Course creators and educators
- Agencies producing story-driven ad or explainer content

Speaker note:
The first users are creators and small teams who already rely on stock footage or stock photos and need speed more than a complex production suite.

---

## 5. Product Workflow

1. Copy the built-in ChatGPT prompt.
2. Paste a script into ChatGPT and receive scene JSON.
3. Paste the JSON into ScriptToClips.
4. Review and edit scene text or search queries.
5. Choose videos or pictures.
6. Fetch ranked Pexels matches.
7. Replace weak results when needed.
8. Download selected assets and metadata as a ZIP.

Speaker note:
The workflow is intentionally simple. The creator remains in control, but the repetitive search and ranking work is automated.

---

## 6. Key Features

- Scene JSON validation with clear error messages
- Review modal for editing scenes before media fetching
- Pexels video and photo search
- Highest-quality available MP4 selection for videos
- High-quality photo source selection for images
- OpenAI-based ranking with heuristic fallback
- Per-scene replacement flow
- Selected-only ZIP export with scene and asset metadata
- Local session persistence in the browser

Speaker note:
The current build already contains the core end-to-end loop: validate, fetch, rank, preview, replace, select, and export.

---

## 7. Why Now

Content volume is increasing, but production timelines are shrinking.

- Creators are publishing across TikTok, YouTube Shorts, Instagram, LinkedIn, and course platforms.
- AI has made script generation faster, creating more demand for fast visual sourcing.
- Stock libraries are abundant, but searching them manually is still slow.
- Teams want lightweight tools that fit existing editing workflows instead of replacing them.

Speaker note:
AI has accelerated writing and ideation. ScriptToClips addresses the next bottleneck: getting matching visuals into the editor quickly.

---

## 8. Market Opportunity

ScriptToClips sits at the intersection of AI content tooling, creator workflows, and stock media.

Potential customer segments:

- Solo creators and freelancers
- Social media agencies
- Marketing departments
- Educational content teams
- Small production studios

Potential expansion:

- More stock providers
- Direct editor integrations
- Team workspaces
- Script-to-storyboard mode
- Brand/style-aware media ranking

Speaker note:
The initial market can be approached through creators and small teams, then expanded into agency and team workflows where repeated asset sourcing has a measurable cost.

---

## 9. Competitive Advantage

ScriptToClips focuses on the missing middle between scripts and editing.

- More practical than a generic chatbot response.
- Faster than manual stock media searching.
- More controllable than fully automated AI video generation.
- Produces real downloadable assets editors can use immediately.
- Keeps metadata, rankings, scene text, and source URLs organized.

Speaker note:
The advantage is workflow fit. ScriptToClips does not ask users to abandon their editor or trust a black-box video generator. It accelerates the part they already do manually.

---

## 10. Business Model

Possible pricing paths:

- Free tier for limited scenes per month
- Creator plan for individual users
- Pro plan with higher limits and faster processing
- Team plan with shared projects and exports
- Usage-based add-ons for AI ranking or premium providers

Example packaging:

- **Free:** 5 scripts/month, Pexels only, heuristic fallback
- **Creator:** unlimited small projects, OpenAI ranking, ZIP export
- **Team:** shared workspace, brand presets, export history, collaboration

Speaker note:
The pricing should map to frequency of use. People producing weekly or daily content feel the value most clearly.

---

## 11. Go-To-Market

Start with creators who already use stock footage and AI writing tools.

- Launch demos on TikTok, YouTube Shorts, and X.
- Share before/after workflow videos.
- Target creator communities, video editing groups, and agency operators.
- Build SEO pages around script-to-stock-footage workflows.
- Offer templates for common content formats: explainer, documentary, faceless video, educational short.

Speaker note:
The product is visual and demo-friendly. The strongest marketing asset is showing a script becoming an organized media pack in minutes.

---

## 12. Current Status

Working prototype implemented.

- Express backend
- EJS frontend shell
- Vanilla JavaScript browser workflow
- Pexels API integration
- OpenAI ranking support
- Heuristic fallback ranking
- Review, replace, selection, and ZIP download flows
- Performance improvements for query caching and scene concurrency

Speaker note:
This is not just an idea deck. The core prototype exists and can be demonstrated locally.

---

## 13. Roadmap

Near-term:

- Direct script paste without requiring a separate ChatGPT step
- Project history and saved exports
- Better ranking controls and style preferences
- Multiple stock media providers
- In-app storyboard view

Mid-term:

- Team accounts and shared libraries
- Brand presets
- Timeline/export integrations
- Automated clip trimming recommendations
- Usage analytics and quality feedback loop

Speaker note:
The roadmap moves from a local workflow helper toward a production workspace for script-driven visual sourcing.

---

## 14. Ask

We are looking for support to turn ScriptToClips into a production-ready creator tool.

Potential asks:

- Pilot users who create content weekly
- Feedback from editors and agencies
- Access to additional stock media/provider APIs
- Design and product support
- Funding or technical partnership for hosted deployment

Speaker note:
The immediate goal is validation: put this in front of real creators, measure time saved, and learn which integrations make the product indispensable.

---

## 15. Closing

**ScriptToClips helps creators go from script to usable visuals faster.**

Instead of manually searching, previewing, downloading, and organizing stock media scene by scene, creators can generate a structured media pack ready for editing.

**Next step:** run pilot workflows with real scripts and measure time saved per finished video.

