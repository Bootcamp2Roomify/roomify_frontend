# Contributing to Roomify Frontend

Thank you for contributing to Roomify. All team members must follow the agreed Git and GitHub workflow.

## Branch Strategy

Roomify uses the following branches:

- `main` contains stable and reviewed code.
- `develop` contains completed development work before release.
- `feature/*` is used for new features.
- `fix/*` is used for bug fixes.
- `docs/*` is used for documentation changes.

Examples:

```text
feature/user-login
feature/image-upload
fix/budget-validation
docs/frontend-setup
```

## Development Workflow

1. Select or receive a Jira task.
2. Switch to the `develop` branch.
3. Make sure `develop` is up to date.
4. Create a new branch from `develop`.
5. Make and test the required changes.
6. Commit using a Conventional Commit message.
7. Push the branch to GitHub.
8. Open a Pull Request into `develop`.
9. Request a review from at least one teammate.
10. Address review comments and resolve merge conflicts.
11. Merge only after the Pull Request is approved.

Team members should not push development work directly into `main` or `develop`.

## Creating a Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/descriptive-name
```

Use a descriptive name related to the Jira task.

Example:

```bash
git checkout -b feature/room-image-upload
```

## Conventional Commits

Use the following commit types:

- `feat:` for a new feature
- `fix:` for a bug fix
- `docs:` for documentation changes
- `chore:` for project setup or maintenance
- `test:` for adding or updating tests
- `refactor:` for code improvements without behavior changes

Examples:

```text
feat(auth): add login form
feat(project): add room image upload page
fix(budget): validate empty budget input
docs: update frontend setup instructions
test(auth): add login form tests
chore: configure frontend environment
```

## Pull Request Titles

Pull Request titles must include the related Jira issue key:

```text
[ROOM-###] <type>: Brief description
```

Example:

```text
[ROOM-7] docs: Set up frontend repository and Git workflow
```

## Pull Request Requirements

Each Pull Request must:

- Target the `develop` branch.
- Include a clear description and summary.
- Reference the related Jira task.
- Include testing instructions.
- Include screenshots for visible user-interface changes.
- Be reviewed by at least one teammate.
- Resolve comments and merge conflicts before merging.
- Contain no passwords, API keys, or other secrets.

## Frontend Guidelines

Frontend contributors should:

- Use TypeScript for application code.
- Create reusable React components when appropriate.
- Follow the existing Next.js project structure.
- Use Tailwind CSS for styling.
- Keep pages responsive for desktop and mobile screens.
- Add clear loading, error, empty, and success states.
- Use labels for form fields.
- Add meaningful alternative text to informative images.
- Communicate with Roomify services through the Spring Boot REST API.

The frontend must not connect directly to PostgreSQL or store private backend credentials.

## Environment Variables and Secrets

Use `.env.example` to document public environment-variable names.

Create a local frontend environment file with:

```bash
cp .env.example .env.local
```

Never commit:

- `.env.local` or other real environment files
- Database credentials
- JWT secrets
- OpenAI or Gemini API keys
- AWS access keys
- Cloud-storage credentials
- Private keys or certificates

Only values intentionally exposed to the browser should use the `NEXT_PUBLIC_` prefix.

## Testing

Before submitting a Pull Request:

1. Run the frontend locally.
2. Test the affected page or component.
3. Check the interface on desktop and mobile when applicable.
4. Verify loading, error, and validation behavior.
5. Confirm existing functionality still works.
6. Document the testing result in the Pull Request.

## Merge Strategy

Feature, fix, and documentation branches must be merged into `develop` through Pull Requests.

```text
feature/* → develop
fix/* → develop
docs/* → develop
```

The `develop` branch should only be merged into `main` when the application is stable and ready for release.
