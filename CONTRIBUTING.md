# Contributing to slack.fm

Thanks for taking the time to contribute! Below you'll find the necessary info you should know about contributing.

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).  
By participating in this project, you agree to abide by its terms. In short:

- Be respectful and considerate toward others.
- Do not use harassment, discriminatory language, or hate speech.
- Encourage an inclusive environment, especially for people new to open source.

## Getting Started

### Prerequisites

Before you start, make sure you have:

- **Node.js** (≥ v16.0.0) and **npm** (≥ v8.0.0) installed.
- A Slack workspace where you can install the app.
- A Last.fm account.
- A Spotify developer account (optional, for Spotify features).

### Cloning & Installation

1. **Fork** this repository on GitHub.
2. From your fork, run:

   ```bash
   git clone https://github.com/<your-username>/slack.fm.git
   cd slack.fm
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

### Environment Setup

Copy the `.env.example` and fill in the required fields:

```env
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
LASTFM_API_KEY=
LASTFM_SHARED_SECRET=
LASTFM_CALLBACK_URL=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
USE_LANGUAGE_FILTERING=false
DB_PATH=./src/utils/slackfm.db
```

If everything in `.env` is set up correctly, when you run the project you should get a message saying "✅ Environment validation passed". To test this, run:

```bash
npm start
```

If you wish to use features such as linking your account, you should set up a [ngrok](https://ngrok.com/) server, and point your lastfm callback url to that ngrok link.

## Making Contributions

### Branch Naming

Use descriptive names for your feature or fix branches, e.g feature/add-roast-command.

### Commit Messages

Write clear and descriptive commit messages, such as:

```commit
feat: add new command to do X
```

Common commit types:

- feat: New feature
- fix: Bug fix
- docs: Documentation only changes
- style: Code formatting, white space, etc
- refactor: Code change without fixing a bug or adding a feature
- chore: Misc changes like config or dependency updates

### Before committing

Before you commit, make sure your code follows all the standards above, and works properly.
To confirm this, you can run `npm run lint`, if there's any warnings or errors, they should be fixed, which can typically be done with `npm run lint:fix`.

### Opening a Pull Request

Once your changes are ready, push your branch to your fork:

```bash
git push origin feature/your-feature-name
```

Open a Pull Request against the main branch.

In your PR, include:

- A brief description of your changes
- Why the changes are necessary
- Any screenshots or logs (if relevant)
- References to related issues (e.g. Closes #12)
- Make sure your PR passes lint checks and doesn’t introduce console errors.

### Reporting Issues & Requesting Features

To report a bug or request a new feature:

- Check existing issues to avoid duplicates.
- If none exist, open a new issue.
- Provide clear steps to reproduce bugs or describe the feature you'd like to see and why it's useful.
- Please include logs, screenshots, or environment details if relevant.

## Questions or Help

If you’re unsure how to do something, feel free to:

- Open an issue [on the GitHub issues page](https://github.com/bananajeanss/slack.fm/issues)
- Refer to the existing code and documentation
- Ask questions directly in your Pull Request

That's it, thanks for taking the time to read this, happy contributing!
