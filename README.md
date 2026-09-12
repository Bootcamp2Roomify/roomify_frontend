# Roomify Frontend

An AI-powered room redesign and DIY planning application that helps college students, renters, young adults, and budget-conscious users visualize a personalized room design based on their actual space, existing furniture, preferred style, budget, rental status, and practical requirements.

This repository contains the **Next.js frontend**. The REST API is maintained in the separate [roomify_backend](https://github.com/Bootcamp2Roomify/roomify_backend) repository.

---

## Planned MVP Features

The following features define the planned Roomify MVP and should not be treated as completed until they have been implemented and tested.

- 🔐 User registration and secure login
- 🏠 Room project creation and dashboard
- 🖼️ Room image upload
- 👁️ Room analysis status and results
- 🪑 Detected furniture review
- ✅ Keep, Replace, Remove, or Unsure decisions
- 🎨 Style, color, budget, and requirement input
- 🤖 AI-generated room redesign
- 🛋️ Furniture and decoration recommendations
- 🛠️ Beginner-friendly DIY suggestions
- 💰 Estimated project cost
- 💾 Saved room projects

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | Java and Spring Boot REST API in a separate repository |
| Database | PostgreSQL through the backend API |
| Computer Vision | Python and FastAPI service through the backend |
| AI Services | OpenAI and Gemini through the backend |
| Image Storage | AWS S3 or compatible cloud object storage |
| Secret Management | AWS Secrets Manager for backend secrets |
| Deployment | Not yet decided |

The frontend must communicate with the Spring Boot API rather than connecting directly to PostgreSQL, the computer-vision service, or private cloud credentials.

---

## Planned Project Structure

```text
src/
├── app/                 # Next.js pages, layouts, and routes
├── components/          # Reusable user-interface components
├── features/            # Feature-specific frontend logic
├── lib/                 # API client and utility functions
├── types/               # TypeScript types and interfaces
└── styles/              # Global styling

public/                  # Static frontend assets
.github/                 # Pull Request templates
.env.example             # Example public environment variables
.gitignore
CONTRIBUTING.md
README.md
```

The exact structure may be updated when the Next.js application is initialized under Jira task `ROOM-8`.

---

## MVP User Workflow

```text
Landing Page
      ↓
Login / Register
      ↓
Create Room Project
      ↓
Upload Room Image
      ↓
Analyze Room
      ↓
Review Detected Furniture
      ↓
Keep / Replace / Remove / Unsure
      ↓
Enter Style, Budget, and Requirements
      ↓
Generate Redesign
      ↓
View Redesign Prototype
      ↓
Review Furniture and DIY Suggestions
      ↓
Save Project
```

---

## Git Workflow

This project follows a feature-branch and Pull Request workflow.

```text
main
│
└── develop
      ├── feature/*
      ├── fix/*
      └── docs/*
```

- `main` — stable and production-ready code
- `develop` — integration branch for reviewed development work
- `feature/*` — new features
- `fix/*` — bug fixes
- `docs/*` — documentation changes

Team members should not push development work directly into `main` or `develop`.

---

## Commit Convention

Roomify uses Conventional Commits:

```text
feat: new feature
fix: bug fix
refactor: code restructuring without behavior changes
docs: documentation changes
test: adding or updating tests
chore: project setup or maintenance
```

Examples:

```text
feat(auth): add login form
feat(project): add room image upload page
fix(budget): validate empty budget input
docs: update frontend setup instructions
test(auth): add login form tests
chore: configure environment example
```

---

## Getting Started

The Next.js application will be initialized under Jira task `ROOM-8`.

### Clone the Repository

```bash
git clone https://github.com/Bootcamp2Roomify/roomify_frontend.git
cd roomify_frontend
```

### Configure the Environment

Create the local environment file:

```bash
cp .env.example .env.local
```

The frontend environment example contains:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Only values intentionally exposed to the browser should use the `NEXT_PUBLIC_` prefix.

Do not place database passwords, JWT secrets, OpenAI or Gemini API keys, AWS access keys, or other private credentials in the frontend environment.

### Install and Run

The installation, development, build, and test commands will be added after the Next.js project and package manager are initialized.

The planned local frontend URL is:

```text
http://localhost:3000
```

---

## Create a Feature Branch

Create new work from the latest `develop` branch:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature
```

Examples:

```text
feature/user-login
feature/room-image-upload
fix/budget-validation
docs/frontend-setup
```

---

## Open a Pull Request

Create a Pull Request from the working branch into `develop`:

```text
feature/* → develop
fix/* → develop
docs/* → develop
```

Stable releases are merged from:

```text
develop → main
```

Pull Request titles must include the related Jira issue key:

```text
[ROOM-###] <type>: Brief description
```

Example:

```text
[ROOM-7] docs: Set up frontend repository and Git workflow
```

Each Pull Request must be reviewed by at least one teammate before it is merged.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the complete contribution guidelines.

---

## MVP Limitations

Roomify’s frontend must clearly communicate the following limitations:

- Room measurements estimated from a single photograph are not centimeter-perfect.
- Furniture recommendations are not guaranteed to physically fit.
- The MVP does not provide a complete interactive 3D model.
- The MVP does not support augmented-reality furniture placement.
- Furniture cannot be freely dragged, rotated, or resized in the generated design.
- The MVP generates a static redesign concept.
- Product prices and inventory may not be available in real time.
- Users must verify measurements before purchasing or moving furniture.
- DIY suggestions are limited to beginner-friendly, low-risk projects.

---

## Related Repositories

- [Roomify Backend](https://github.com/Bootcamp2Roomify/roomify_backend) — Java and Spring Boot REST API
- `roomify_cv` — Python and FastAPI computer-vision service; repository will be added during project setup

---

## License

This project is licensed under the MIT License.
