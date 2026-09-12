<!--
PR title should follow this format:

[ROOM-###] <type>: Brief description of the change

Types: feat, fix, docs, refactor, test, chore

Example:
[ROOM-7] docs: Set up frontend repository and Git workflow
-->

## Before You Start

- [ ] I have read and will follow the Contributing Guide.
- [ ] My branch follows the naming convention: `<type>/descriptive-name`.
- [ ] My PR title follows the format: `[ROOM-###] <type>: description`.
- [ ] My branch includes the latest changes from `develop`.

---

[Brief one-line description of what this PR adds]

#### Summary

- [Main addition or change]
- [Another important change]
- [Third important change]

#### Changes

- New: [List new files, pages, components, or directories]
- Modified: [List modified files and explain what changed]
- Removed: [List deleted files or functionality]

#### Implementation

- [Explain key technical decisions]
- [Describe important implementation details]
- [Mention API integration, state management, or validation]
- [Mention any trade-offs or assumptions]

#### Why

- [Explain why this change is needed]
- [Connect the change to the related Roomify feature or Jira task]

#### Screenshots

[Add screenshots for visible user-interface changes or write `Not applicable`]

#### Checklist

- [ ] The change matches the related Jira task.
- [ ] Code follows the project conventions.
- [ ] The interface was checked on desktop and mobile when applicable.
- [ ] Forms and interactive elements are accessible when applicable.
- [ ] No passwords, private API keys, or other secrets were committed.
- [ ] No unnecessary files were committed.
- [ ] Documentation was updated when needed.
- [ ] The change is ready for review.

#### Testing Instructions

[Provide clear instructions for reviewers to test the changes]

#### Prerequisites

- [List required dependencies]
- [List required public environment variables]
- [List any required backend services]

#### Step-by-Step Testing

1. Pull this branch.
2. Install the project dependencies.
3. Copy `.env.example` to `.env.local`.
4. Start the frontend development server.
5. Open the affected page or feature.
6. Verify the expected behavior.

#### Expected Result

[Describe what the reviewer should see after completing the testing steps]
