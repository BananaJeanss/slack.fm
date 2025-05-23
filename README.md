
<p align="center">
    <img src="assets/slackfm.png" alt="slack.fm logo" width="150"/>
</p>

# slack.fm 


A last.fm bot for Slack

## Introduction

**slack.fm** is a Slack bot that lets you connect your Last.fm account to view your music stats, get song/album/artist info, and more—all from within Slack. Perfect for sharing your music taste, discovering new tracks, and having fun with your team.

## Features

- Link your Last.fm account to Slack
- View your or others now playing track, profile, top artists, albums, and songs
- Get fun roasts of your music taste
- See detailed stats for songs, albums, and artists
- Easy-to-use Slack slash commands

## Installation

To self-host slack.fm, follow these steps:

1. **Clone the repository:**

    ```bash
    git clone https://github.com/yourusername/slack.fm.git
    cd slack.fm
    ```

2. **Install the dependencies:**

    ```bash
    npm install
    ```

3. **Create a `.env` file**  
   Copy `.env.example` and fill in the required variables.

4. **Run the app:**

    ```bash
    node index.js
    ```

## Environment Variables

- `SLACK_BOT_TOKEN` – Your Slack bot token
- `SLACK_APP_TOKEN` – Your Slack app-level token
- `SLACK_SIGNING_SECRET` – Your Slack signing secret
- `LASTFM_API_KEY` – Your Last.fm API key
- `LASTFM_SHARED_SECRET` – Your Last.fm shared secret
- `LASTFM_CALLBACK_URL` – OAuth callback URL for last.fm

## Usage

Once the bot is running and added to your Slack workspace, you can use these basic commands to get started:

| Command         | Description                                 |
|-----------------|---------------------------------------------|
| `/link`         | Link your Last.fm account                   |
| `/nowplaying`   | Show your (or another user’s) current track |
| `/profile`      | Show Last.fm profile info                   |
| `/artist`       | Show info about your last played artist     |
| `/album`        | Show info about your last played album      |
| `/song`         | Show info about your last played song       |
| `/roast`        | Get roasted for your music taste            |

## Contributing

Contributions are welcome! Please fork the repository and create a pull request. For major changes, open an issue first to discuss what you’d like to change.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [last.fm api](https://www.last.fm/api)
- [Slack API/Bolt](https://api.slack.com/bolt)
