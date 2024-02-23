const fs = require('fs-extra')
const cheerio = require('cheerio');
const request = require('request-promise');

const LISTENBRAINZ_TOKEN = process.env.LISTENBRAINZ_TOKEN; //Put your token here.
const FILE = process.env.FILE; //Put your path to the XML file here.

const delay = async (ms) => { 
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const scrobble = async (payload) => {
    request({
        uri: 'https://api.listenbrainz.org/1/submit-listens',
        resolveWithFullResponse: true,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Token ${LISTENBRAINZ_TOKEN}`,
        },
        body: JSON.stringify({
          listen_type: 'import',
          payload: payload,
        })
    }).then((response) => {
        console.log(response.statusCode); //Did we succeed?
    }).catch((e) => {
        console.error(e); //If not, send the error to the error console.
    });
};

const run = async () => {
  const listens = fs.readFileSync(FILE);
  const $ = cheerio.load(listens, { xmlMode: true });
  const tracks = $('scrobbles').find('track');
  const payloads = [];
  let payload = []; //Array of tracks listened to.

  for(let i = 0; i < tracks.length; i++) {
    if(i == 500) { //ListenBrainz limits bulk imports to 1,000 tracks at a time, let's send them in batches of 500 to be safe.
      const arr = payload;
      payloads.push(arr);
      payload = [];
    }
    const track = tracks[i];
    let album = $(track).find('album').text();
    if(album == null || album == '') { //Sometimes there is no album. If this is the case, send the track name as the album.
      album = $(track).find('name').text()
    }
    const listen = {
        track_metadata: {
          track_name: $(track).find('name').text(),
          artist_name: $(track).find('artist').text(),
          release_name: album,
          additional_info: {
            submission_client: 'lastfm-xml-listenbrainz-sync',
            lastfm_track_mbid: $(track).find('mbid').text(),
            lastfm_release_mbid: $(track).find('album').attr('mbid'),
            lastfm_artist_mbid: $(track).find('artist').attr('mbid')
          }
        },
        listened_at: $(track).find('date').attr('uts')
    };
    payload.push(listen);
  }

  payloads.push(payload);

  for(let i = 0; i < payloads.length; i++) { //Loop the payloads and make the API calls.
    await scrobble(payloads[i]);
    await delay(10000); //Set a 10 second delay to avoid the API rate limit.
  }

};

run();
