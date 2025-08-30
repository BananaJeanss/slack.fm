# slack.fm Commands

A comprehensive guide to all slash commands available in slack.fm.

## Authentication Commands

| Command         | Description                 | Usage           |
| --------------- | --------------------------- | --------------- |
| `/linklastfm`   | Link your Last.fm account   | `/linklastfm`   |
| `/unlinklastfm` | Unlink your Last.fm account | `/unlinklastfm` |

## Profile & Stats Commands

| Command    | Description                | Usage                 |
| ---------- | -------------------------- | --------------------- |
| `/profile` | Show Last.fm profile stats | `/profile [@mention]` |
| `/plays`   | Show scrobble counts       | `/plays [@mention]`   |
| `/recent`  | Show last 5 tracks played  | `/recent [@mention]`  |

## Now Playing Commands

| Command          | Description                              | Usage                             |
| ---------------- | ---------------------------------------- | --------------------------------- |
| `/nowplaying`    | Show current or last played track        | `/nowplaying [@mention]`          |
| `/cover`         | Show album art for current/last track    | `/cover [@mention or album name]` |
| `/whoslistening` | Show who is currently listening to music | `/whoslistening`                  |

## Music Info Commands

| Command   | Description                                                    | Usage                               |
| --------- | -------------------------------------------------------------- | ----------------------------------- |
| `/song`   | Show detailed info about last played song or search for a song | `/song [@mention or song name]`     |
| `/album`  | Show detailed info about last played album                     | `/album [@mention or album name]`   |
| `/artist` | Show detailed info about last played artist                    | `/artist [@mention or artist name]` |

## Top Charts Commands

| Command       | Description                  | Usage                    |
| ------------- | ---------------------------- | ------------------------ |
| `/toptracks`  | Show all-time top 10 tracks  | `/toptracks [@mention]`  |
| `/topalbums`  | Show all-time top 10 albums  | `/topalbums [@mention]`  |
| `/topartists` | Show all-time top 10 artists | `/topartists [@mention]` |

## Whoknows Commands

| Command          | Description                                                    | Usage                             |
| ---------------- | -------------------------------------------------------------- | --------------------------------- |
| `/whoknows`      | Top 10 people who listen to an artist                          | `/whoknows [artist]`              |
| `/whoknowsalbum` | Top 10 people who listen to an album                           | `/whoknowsalbum [artist - album]` |
| `/whoknowssong`  | Top 10 people who listen to a song                             | `/whoknowssong [artist - song]`   |
| `/crownboard`    | Top 10 users with the most crowns, based off /whoknows artists | `/crownboard`                     |

## Fun Commands

| Command       | Description                                                                                     | Usage                    |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| `/roast`      | Get a roast of your music taste. Rate-limited to 3 uses per hour and 10 uses per day.           | `/roast [@mention]`      |
| `/compliment` | Opposite of roast, compliments your music. Rate-limited to 3 uses per hour and 10 uses per day. | `/compliment [@mention]` |

## Utility Commands

| Command            | Description                                            | Usage              |
| ------------------ | ------------------------------------------------------ | ------------------ |
| `/about`           | Show info about slack.fm                               | `/about`           |
| `/uptime`          | Display how long bot has been running                  | `/uptime`          |
| `/slackfmcommands` | Shows a few basic commands and a link to commands.md   | `/slackfmcommands` |
| `/linkedcount`     | Show how many users have linked their Last.fm accounts | `/linkedcount`     |
