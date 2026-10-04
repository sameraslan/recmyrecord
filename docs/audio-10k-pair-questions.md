# Audio for the 10k catalog: pairs to confirm

4 October 2026. Branch `feat/audio-10k`.

All 190 doubtful pairs and the 10 same-album duplicates are decided: 43 site albums were paired with their chart row, 12 were left off the chart, and the 104 pairs the builder had already made were kept. The catalog went from 10,510 to 10,467 albums. `catalog/doubtful_pairs.csv` is empty.

The questions below are the decisions I am least sure of. Each default is already applied. Answer only where the default is wrong.

## Pairs

1. Is the site's Ichiko Aoba, *0%* (2014) the live album *0%*, and not the studio album *0* (2013)? Its Spotify link and its current audio are the studio album. Default: yes, it is the live album.
2. Is the site's Os Tincoãs, *Os Tincoãs* (1973) the 1973 album, and not the 1977 album its Spotify link points at? Default: yes, the 1973 album.
3. Is the site's Berliner Philharmoniker / Karajan, *Symphony No. 9* (1963) the same album as RYM's Beethoven, *IX. Symphonie* (1963, same orchestra and conductor)? Default: yes.
4. Is the site's Various Artists, *A Clockwork Orange* (1972) the same album as RYM's *A Clockwork Orange* credited to Rossini and Wendy Carlos (1972)? The other candidate is *Clockwork Orange* credited to Beethoven and Wendy Carlos (1972). Default: yes, the first one.
5. Is the site's Various Artists, *Barry Lyndon* (1975) the same album as RYM's *Barry Lyndon* credited to Händel (1975)? Default: yes.
6. Is the site's The Residents, *Duck Stab* (1978) the same album as RYM's *Duck Stab / Buster & Glen* (1978)? Default: yes. Both link the same 14-track Spotify album.
7. Is the site's Dolly Mixture, *Demonstration Tapes* (1983) the same album as RYM's *Demonstration Tapes: A Double Album* (1984)? Default: yes.
8. Is the site's Can, *Soundtracks* (1970) the same album as RYM's Can, *Soundtracks* (1973)? Default: yes.
9. Is the site's LCD Soundsystem, *45:33* (2006) the same album as RYM's *45:33: Nike+ Original Run* (2006)? Default: yes.
10. Is the site's Dream Theater, *Score: 20th Anniversary World Tour* (2006) the same album as RYM's *Score* (2006)? Default: yes.

## Audio

11. The site's *Barry Lyndon* and *A Clockwork Orange* soundtracks have audio from the wrong records (a single by Pecan, and a rock compilation). Neither store has the soundtracks. Should they lose that audio and be imputed from descriptors? Default: yes. Not done yet.
12. RYM's *Cowboy Bebop* (2002, Yoko Kanno and Seatbelts) shares the audio of the 1998 soundtrack, because no store lists the 2002 release. Should it keep that audio? Default: yes.

## To change an answer

Edit the album's row in `data-pipeline/audio/keys.csv` (put the placeholder `sp:<Spotify id>` back, or another RYM id, and keep `matched_by` as `manual`), then run the builder and `scripts/rekey_audio_store.py --previous <the old keys.csv>` as the README's "Catalog and keys" section says.
