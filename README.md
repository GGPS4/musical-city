# Musical City

**Live:** https://ggps4.github.io/musical-city/

Your music taste, built as a miniature 3D city you can explore at night.

Type in a few artists or genres (try *The Beatles, David Bowie, The Clash, The Stooges, Punk, Psychedelic Rock*) and the city builds itself: ground, roads, genre neighbourhoods, venues, landmarks, then the lights come on. Drag to orbit, scroll or pinch to zoom, and click anything that glows.

## What's in the city

- **Genre districts.** Eighteen genres (rock, punk, indie, metal, hip hop, jazz, soul, reggae, pop, electronic and more), each with its own architecture: brick warehouses and dive bars for punk, terraced streets and small venues for indie, chrome towers and arena marquees for hard rock, domes and curved towers for psychedelic, theatres and ornate blocks for classic rock, brutalist concrete for post-punk, neon towers for electronic, and more. Districts blend into each other, so a street halfway between Punk and Psychedelic mixes both styles. Strong overlaps are labelled as their own quarter (e.g. *Psychedelic × Punk Quarter*).
- **Venues.** Bars, clubs, theatres, concert halls, warehouses, rooftop stages and record stores. They're all **fictional** and labelled *Musical interpretation*. Click one to see its genres, its artists, a description, and **Listen**.
- **Record stores.** These show a *You might also like* trail (for example The Clash → Gang of Four → Wire → Television). **Add to city** opens a new venue for that artist in the right district.
- **Historical landmarks.** Thirty landmarks based on documented events: the Beatles' rooftop concert (30 Jan 1969), the Abbey Road crossing, the Cavern Club, the Sex Pistols' Jubilee boat trip, Hansa Studios, CBGB, the Troubadour, Knebworth and more. They carry a gold *Historical landmark* badge, with the place and date. Each model is a miniature *inspired by* the place, not a replica. Every genre also gets a fictional monument, labelled *Musical interpretation*.
- **Landmark soundtracks.** Each landmark has the music tied to it: Abbey Road plays *Abbey Road*, the rooftop concert plays *Let It Be* (“Get Back”, “Don't Let Me Down”…), Battersea plays *Animals*. **Play the soundtrack** finds official previews of those exact songs.
- **Musical DNA.** A rough genre breakdown, labelled *Estimated from your selections*. The bigger a genre's share, the larger and more central its district.
- **Connections.** Arcs link related artists across the city. Clicking an artist lights up everywhere they appear, highlights their connections, and lets you follow a connection to the next artist.
- **Discover.** Suggests an artist you didn't enter, based on your taste.
- **Walk the streets.** Drop to street level and walk around (WASD/arrow keys and drag to look, or the on-screen stick on phones). As you pass a venue, its artists' previews fade in and out with distance.
- **Gig night.** Any venue or landmark can host a show: crowds fill the streets, searchlights sweep, lights pulse to the beat and landmarks get fireworks, with a lineup you can step through.
- **Landmark passport.** Play a historical landmark's soundtrack to stamp your passport. Stamps are grouped into scenes (Beatlemania, Punk Year Zero, Kingston Sound…) and saved in your browser.
- **Compare cities.** Add a friend's artists (or paste their city link) to build one shared city: your side, their side and the shared ground, with a taste-overlap score and "bridge" artists that connect you.
- **Any artist.** Names outside the catalogue are looked up on MusicBrainz (genres, origin, start year, relationships) and the iTunes Search API (album and songs), then placed in the right district. Results are cached in your browser.
- **Poster.** Export a print-style PNG of your city with district names, numbered landmarks and your Musical DNA.
- **Share.** Copies a link that rebuilds the same city (`?city=...`). Generation is deterministic.

## Music playback

Playback sits behind a small provider interface (`src/music/musicService.ts`):

- `ItunesPreviewProvider` uses Apple's public iTunes Search API for official 30-second previews. It needs no API key.
- `CuratedProvider` is the offline fallback. It uses the local catalogue's songs and links out to Spotify, Apple Music and YouTube Music.

If the remote provider fails, the UI shows *Music data unavailable. Showing curated city data.* and everything else keeps working. No audio is scraped or redistributed. To add a Spotify or Apple Music SDK later, implement `MusicProvider` and pass it to `MusicService`.

## Running locally

Requires Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run typecheck  # app + tests
npm run lint
npm test           # generator, resolver, DNA and data-integrity tests
npm run check      # all of the above
```

No credentials or environment variables are needed. Every push to `main` runs type-checking, linting, tests and the build in GitHub Actions, then deploys `dist/` to GitHub Pages (`.github/workflows/deploy.yml`).

## Architecture

Vite + TypeScript + Three.js. The UI is plain DOM, because it's small and the 3D scene is the focus.

```
src/
  types.ts                 Domain types: Artist, Genre, VenuePlan, LandmarkPlan, CityPlan…
  data/
    artists.ts             Curated catalogue (~170 artists, relationships, albums, songs)
    genres.ts              Genres + architectural style per genre
    landmarks.ts           Historical landmarks (real places/events only) and their soundtracks
  core/                    Pure logic, no Three.js; unit-tested
    resolve.ts             Free text → artists/genres (aliases, fuzzy match, autocomplete)
    dna.ts                 Musical DNA estimate
    cityGenerator.ts       Seeded city plan: districts, blocks, river, bridges, buildings,
                           venues, landmarks, connections; plus introduceArtist()
    recommend.ts           Connections, "you might also like" trails, Discover
    compare.ts             Taste overlap, shared genres, district ownership
    passport.ts            Landmark stamps and scenes (localStorage)
    random.ts, store.ts    Seeded PRNG, tiny observable store
  music/musicService.ts    Provider abstraction, preview player
  music/artistLookup.ts    MusicBrainz + iTunes lookups for artists outside the catalogue
  app/                     Feature controllers: walking, gig night, compare, poster
  scene/                   Rendering
    CityScene.ts           Renderer, camera, controls, bloom, picking, camera moves, build intro, poster capture
    walk.ts                First-person walking with collisions
    cityBuilder.ts         CityPlan → meshes; build animation; selection/beam/arc helpers
    buildings.ts           Building archetypes composed from instanced parts
    models.ts              Venue, landmark and monument models
    materials.ts           Shared materials, including the procedural window shader
    instancer.ts           Instanced batches with per-instance grow/pop animation
    geometries.ts, textures.ts, labels.ts
  ui/                      Landing, HUD (DNA, explorer lists, info panel, player, passport), poster layout
  main.ts                  Wires scene, UI, music and state together
tests/city.test.ts
```

### Performance notes

- About 700 buildings are drawn as a few dozen `InstancedMesh` draw calls. Windows come from a shader (world-space, lit per instance with a hash), so there are no window textures or extra geometry.
- Materials and geometries are shared. Only venues and landmarks (a few dozen) are individual meshes.
- There is one shadow-casting light. Bloom and shadows are turned off on phones, and on any device that renders under about 30 fps.
- Instanced meshes switch frustum culling back on once the build animation finishes.

## Data and accuracy

- Landmark text sticks to well-documented facts (place and date). Models are stylised miniatures.
- Venue names and descriptions are invented and always labelled as interpretations.
- Artists you type that aren't in the catalogue still get a venue, marked as *Your pick*.
- The catalogue is intentionally small and hand-written. A remote metadata provider (for example MusicBrainz or Last.fm) could extend it later behind the same types.

## Ideas for later

- Spotify / Apple Music SDK playback (full tracks for signed-in users)
- Saving cities to an account
- More landmark models and genres (country, blues, K-pop, Latin…)
