import axios from 'axios';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyToken = null;
let tokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < tokenExpiry) {
    return spotifyToken;
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
      }
    );

    spotifyToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; // 5 min buffer
    return spotifyToken;
  } catch (error) {
    console.warn('Failed to get Spotify token:', error.message);
    return null;
  }
}

function getLastFmImage(
  imageArray,
  preferredSizes = ['extralarge', 'large', 'medium']
) {
  if (!imageArray || !Array.isArray(imageArray)) return null;

  for (const size of preferredSizes) {
    const image = imageArray.find(
      (img) =>
        img.size === size &&
        img['#text'] &&
        img['#text'] !== '' &&
        !img['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')
    );
    if (image) return image['#text'];
  }
  return null;
}

async function getSpotifyArtistImage(artistName) {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;

    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: `artist:"${artistName}"`,
        type: 'artist',
        limit: 1,
      },
    });

    const artist = response.data.artists?.items?.[0];
    return artist?.images?.[0]?.url || null;
  } catch (error) {
    console.warn(
      `Spotify artist search failed for "${artistName}":`,
      error.message
    );
    return null;
  }
}

async function getSpotifyAlbumImage(artist, album) {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;

    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: `album:"${album}" artist:"${artist}"`,
        type: 'album',
        limit: 1,
      },
    });

    const albumResult = response.data.albums?.items?.[0];
    return albumResult?.images?.[0]?.url || null;
  } catch (error) {
    console.warn(
      `Spotify album search failed for "${artist} - ${album}":`,
      error.message
    );
    return null;
  }
}

async function getSpotifyTrackImage(artist, track) {
  try {
    const token = await getSpotifyToken();
    if (!token) return null;

    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: `track:"${track}" artist:"${artist}"`,
        type: 'track',
        limit: 1,
      },
    });

    const trackResult = response.data.tracks?.items?.[0];
    return trackResult?.album?.images?.[0]?.url || null;
  } catch (error) {
    console.warn(
      `Spotify track search failed for "${artist} - ${track}":`,
      error.message
    );
    return null;
  }
}

async function getMusicBrainzImage(artist, album) {
  try {
    const searchResponse = await axios.get(
      'https://musicbrainz.org/ws/2/release',
      {
        params: {
          query: `artist:"${artist}" AND release:"${album}"`,
          fmt: 'json',
          limit: 1,
        },
        headers: {
          'User-Agent':
            'slack.fm/1.0 (https://github.com/bananajeanss/slack.fm)',
        },
      }
    );

    const release = searchResponse.data.releases?.[0];
    if (!release?.id) return null;

    // Get cover art from Cover Art Archive
    const coverResponse = await axios.get(
      `https://coverartarchive.org/release/${release.id}`,
      {
        timeout: 5000,
      }
    );

    return coverResponse.data.images?.[0]?.image || null;
  } catch (error) {
    console.warn(
      `MusicBrainz search failed for "${artist} - ${album}":`,
      error.message
    );
    return null;
  }
}

export async function resolveArtistImage(artistName, lastfmImageArray = null) {
  // try last.fm first
  if (lastfmImageArray) {
    const lastfmImage = getLastFmImage(lastfmImageArray);
    if (lastfmImage) return lastfmImage;
  }

  // try spotify
  const spotifyImage = await getSpotifyArtistImage(artistName);
  if (spotifyImage) return spotifyImage;

  // return null instead of placeholder - let caller decide
  return null;
}

export async function resolveAlbumImage(
  artist,
  album,
  lastfmImageArray = null
) {
  // try last.fm first
  if (lastfmImageArray) {
    const lastfmImage = getLastFmImage(lastfmImageArray);
    if (lastfmImage) return lastfmImage;
  }

  // try spotify
  const spotifyImage = await getSpotifyAlbumImage(artist, album);
  if (spotifyImage) return spotifyImage;

  // try musicbrainz
  const mbImage = await getMusicBrainzImage(artist, album);
  if (mbImage) return mbImage;

  // Return null instead of placeholder
  return null;
}

export async function resolveTrackImage(
  artist,
  track,
  album = null,
  lastfmImageArray = null
) {
  // try last.fm first
  if (lastfmImageArray) {
    const lastfmImage = getLastFmImage(lastfmImageArray);
    if (lastfmImage) return lastfmImage;
  }

  // try spotify
  const spotifyImage = await getSpotifyTrackImage(artist, track);
  if (spotifyImage) return spotifyImage;

  if (album) {
    return await resolveAlbumImage(artist, album);
  }

  // Return null instead of placeholder
  return null;
}

export function getPlaceholderImage() {
  return 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
}
