
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

<img src="assets/song.png" alt="Song command example" width="400"/>

## Installation

To self-host slack.fm, follow these steps:

1. **Clone the repository:**

    ```bash
    git clone https://github.com/bananajeanss/slack.fm.git
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

- `SLACK_CLIENT_ID` – Your Slack app client ID
- `SLACK_CLIENT_SECRET` – Your Slack app client secret
- `SLACK_BOT_TOKEN` – Your Slack bot token (starts with `xoxb-`)
- `SLACK_APP_TOKEN` – Your Slack app-level token (starts with `xapp-`)
- `SLACK_SIGNING_SECRET` – Your Slack signing secret
- `LASTFM_API_KEY` – Your Last.fm API key
- `LASTFM_SHARED_SECRET` – Your Last.fm shared secret
- `LASTFM_CALLBACK_URL` – OAuth callback URL for Last.fm (must be a valid URL)
- `SPOTIFY_CLIENT_ID` – Your Spotify client ID
- `SPOTIFY_CLIENT_SECRET` – Your Spotify client secret

## Usage

Once the bot is running and added to your Slack workspace, you can use these basic commands to get started:

| Command         | Description                                 |
|-----------------|---------------------------------------------|
| `/link`         | Link your Last.fm account                   |
| `/nowplaying`   | Shows your (or another user’s) current track|
| `/profile`      | Shows Last.fm profile info                  |
| `/artist`       | Shows info about your last played artist    |
| `/album`        | Shows info about your last played album     |
| `/song`         | Shows info about your last played song      |
| `/whoknows`     | Shows top listeners for an artist           |
| `/whoslistening`| Shows who is listening to a track           |
| `/roast`        | Get roasted for your music taste            |

More commands can be found in the [commands.md](commands.md) file.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request. For major changes, open an issue first to discuss what you’d like to change.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Last.fm API](https://www.last.fm/api)
- [Slack API/Bolt](https://api.slack.com/bolt)
- [Spotify API](https://developer.spotify.com/documentation/web-api/)
- [SQLite](https://www.sqlite.org/) - Local database storage
- [Express.js](https://expressjs.com/) - Web framework for routing
- [Axios](https://axios-http.com/) - HTTP client for API requests
