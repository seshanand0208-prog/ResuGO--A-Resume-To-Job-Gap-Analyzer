<div align="center">

# ResuGO

**Resume-to-job gap analyzer and custom resume builder**

Find out exactly what your resume is missing for the job you want, then fix it inside the app.

[Live Demo](#) · [Report a Bug](../../issues) · [Request a Feature](../../issues)

</div>

---

## Table of contents

- [About](#about)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [How the gap analysis works](#how-the-gap-analysis-works)
- [Security and privacy](#security-and-privacy)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## About

ResuGO compares your resume with a target job description and shows a match score, the skills and keywords you are missing, and a plan to close the gaps. A built-in resume builder lets you apply the fixes right away and export an ATS-friendly resume.

## Features

**Gap analysis**
- Match score (0-100) with breakdown by skills, experience, education, keywords and seniority
- Matched, partial and missing skills, color-coded
- ATS keyword check and formatting audit
- Job input by pasted description, URL, or Google Jobs search

**Custom resume builder**
- Live preview editor with drag-and-drop sections
- Multiple templates and an ATS-safe mode
- AI assistant to rewrite bullets, generate summaries and tailor to a job
- Version history, multiple resumes, export to PDF, DOCX and text

**Login and security**
- Google Sign-In, email/password and guest mode
- reCAPTCHA human verification (verified server-side)
- Honeypot field, rate limiting and disposable-email blocking

**Name analysis**
- Parses and normalizes names, including South Indian formats and initials
- Flags fake or placeholder names with a soft warning
- Cross-checks account, Google and resume names

**Extras**
- Honesty Guard: AI will not invent experience and flags claims to verify
- Resume Health Score and recruiter 6-second view
- Career path simulator and skill transferability map
- Learning roadmap with progress tracking
- Interview question generator and cover letter generator
- Multi-job comparison, dark mode, English / Tamil / Hindi

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Next.js API routes |
| Database | PostgreSQL (Supabase) |
| Auth | NextAuth / Firebase Auth, Google OAuth |
| Bot protection | Google reCAPTCHA v3 / v2 |
| AI | Claude API |
| Google APIs | Drive Picker, Jobs (via SerpAPI), Custom Search, Calendar, Sheets |
| Export | react-pdf / Puppeteer, docx |
| Hosting | Vercel + Supabase |

## Getting started

### Prerequisites

- Node.js 18 or later
- npm or pnpm
- A Supabase project (or PostgreSQL database)
- Google Cloud project with OAuth credentials
- reCAPTCHA site and secret keys
- Claude API key

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/resugo.git
cd resugo

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local

# 4. Run database migrations / seed demo data
npm run db:migrate
npm run db:seed

# 5. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
npm run build
npm start
```

## Environment variables

Create a `.env.local` file in the project root:

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=http://localhost:3000

# Database
DATABASE_URL=your_postgres_connection_string
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# reCAPTCHA (secret key must stay on the server)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key
RECAPTCHA_SECRET_KEY=your_secret_key

# AI
ANTHROPIC_API_KEY=your_claude_api_key

# Jobs and search
SERPAPI_KEY=your_serpapi_key
GOOGLE_CSE_API_KEY=your_custom_search_key
GOOGLE_CSE_ID=your_search_engine_id
```

Never commit `.env.local`. Make sure it is listed in `.gitignore`.

## Project structure

```
resugo/
├── app/                  # Pages and API routes
│   ├── (auth)/           # Login, sign-up, verification
│   ├── dashboard/        # History, saved jobs, versions
│   ├── analyze/          # New analysis and report
│   ├── builder/          # Resume builder
│   └── api/              # Backend endpoints
├── components/           # Reusable UI components
├── lib/                  # Helpers (parsing, scoring, name analysis)
├── prompts/              # AI prompt templates
├── db/                   # Schema, migrations, seed data
├── public/               # Static assets and logo
└── .env.example
```

## How the gap analysis works

1. **Parse** the resume into skills, experience, education and projects.
2. **Extract** required and preferred skills from the job description.
3. **Compare** each requirement against the resume and mark it matched, partial or missing.
4. **Score** the result across skills, experience, education, keywords and seniority.
5. **Recommend** fixes, learning resources and resume edits for each gap.

AI responses are returned as structured JSON and validated before display.

## Security and privacy

- reCAPTCHA tokens are verified server-side before any session is created
- Rate limiting and lockout on repeated failed attempts
- Resumes are encrypted at rest and limited to 5 MB
- Users can edit or delete all their data at any time
- Names are never used to infer gender, ethnicity or religion
- Google data is accessed only through official APIs, with no scraping

## Roadmap

- [ ] Job alerts by email
- [ ] LinkedIn export import
- [ ] Mock interview chat
- [ ] Browser extension to analyze jobs on any site
- [ ] More languages and regional resume formats

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a pull request

