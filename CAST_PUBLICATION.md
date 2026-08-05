# Google Cast publication details

## Application

- Application ID: `F869B6B1`
- Type: Custom Receiver
- Name: FlipCast
- Receiver URL: replace with the permanent static HTTPS URL after deployment
- Supports relay casting: No
- Supports audio-only devices: No

## Web sender

- Platform: Web
- Sender URL: `https://jml845.github.io/seven-up-scorekeeper/`

## Listing

- Listed on Google properties: No (unlisted)
- Countries: All countries
- Category: Games
- Title: `FlipCast`
- Description: `A fast scorekeeper and live TV leaderboard for press-your-luck card games.`
- Icon: `cast-icon-512.png` (512×512 PNG)

## Deployment contents

Publish the contents of `cast-receiver/` at the root of a permanent HTTPS static site. The page stores no player or game data. Live scoreboard state arrives only through the custom Cast namespace `urn:x-cast:com.sevenup.scoreboard`.

After deployment, update the Custom Receiver URL in the Cast Developer Console, save, complete the Web sender and listing fields above, and submit the application for publication.
