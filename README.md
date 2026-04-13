# <p align="center">Navix</p>

<p align="center">
  <a href="https://navixagents.netlify.app/login"><strong>Navix</strong></a>
</p>

Navix is a high-performance travel management console that bridges the gap between **social media inspiration** and **practical execution**. It acts as a specialized AI agent that plans, audits, and remembers on a unified platform for you.

## Key Features

### The Audit Agent Architecture
Unlike traditional chatbots, Navix uses an **Adversarial Dual-Agent Loop**. Every response from the primary assistant is audited by a hidden "Shadow Agent" that cross-references your current budget, past preferences, and itinerary constraints to prevent hallucinations and errors.

### Social Link Ingestion
Found a cool spot on Instagram or TikTok? Paste the link. Navix downloads the video using open-source CLI Tool `yt-dlp`, then leverages **Gemini 3's Model* to analyze the location, costs, and tips, and automatically merges them into your trip memory.

### Persistent LLM Memory
Navix builds a long-term profile for you. It learns your pacing, dietary tendencies, and accommodation style. This memory is injected into every future trip so you never have to explain your style twice.

### Seamless Execution
- **One-Click Itinerary Building**: AI plans multi-day schedules in seconds.
- **Budget Tracking**: Real-time spending analysis against defined limits.
- **Google Calendar Sync**: Push your tentative plans to your real-world calendar with one click.

---

## The Tech Stack

- **Backend**: Go
- **Frontend**: React (Vite) + Typescript + CSS
- **Database**: PostgreSQL
- **AI Engine**: Gemini 3 Flash (utilizing Model Context Protocol - MCP)
- **Video Processing**: `yt-dlp`
