# Musical City

**Live:** https://ggps4.github.io/musical-city/

Your music taste, built as a miniature 3D city you can explore at night.

Type in a few artists or genres (try *The Beatles, David Bowie, The Clash, The Stooges, Punk, Psychedelic Rock*) and the city builds itself: ground, roads, genre neighbourhoods, venues, landmarks, then the lights come on. Drag to orbit, scroll or pinch to zoom, and click anything that glows.

## What's in the city

- **Genre districts.** Each genre has its own architecture: brick warehouses and dive bars for punk, domes and curved towers for psychedelic, theatres and ornate blocks for classic rock, brutalist concrete for post-punk, neon towers for electronic, and more. Districts blend into each other, so a street halfway between Punk and Psychedelic mixes both styles. Strong overlaps are labelled as their own quarter (e.g. *Psychedelic × Punk Quarter*).
- **Venues.** Bars, clubs, theatres, concert halls, warehouses, rooftop stages and record stores. They're all **fictional** and labelled *Musical interpretation*. Click one to see its genres, its artists, a description, and **Listen**.
- **Record stores.** These show a *You might also like* trail (for example The Clash → Gang of Four → Wire → Television). **Add to city** opens a new venue for that artist in the right district.
- **Historical landmarks.** These are based on documented events: the Beatles' rooftop concert (30 Jan 1969), the Abbey Road crossing, the Cavern Club, the Sex Pistols' Jubilee boat trip, Hansa Studios, CBGB, Battersea Power Station and more. They carry a gold *Historical landmark* badge, with the place and date. Each model is a miniature *inspired by* the place, not a replica. Every genre also gets a fictional monument, labelled *Musical interpretation*.
- **Musical DNA.** A rough genre breakdown, labelled *Estimated from your selections*. The bigger a genre's share, the larger and more central its district.
- **Connections.** Arcs link related artists across the city. Clicking an artist lights up everywhere they appear, highlights their connections, and lets you follow a connection to the next artist.
- **Discover.** Suggests an artist you didn't enter, based on your taste.
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
    artists.ts             Curated catalogue (~50 artists, relationships, albums, songs)
    genres.ts              Genres + architectural style per genre
    landmarks.ts           Historical landmarks (real places/events only)
  core/                    Pure logic, no Three.js; unit-tested
    resolve.ts             Free text → artists/genres (aliases, fuzzy match, autocomplete)
    dna.ts                 Musical DNA estimate
    cityGenerator.ts       Seeded city plan: districts, blocks, river, bridges, buildings,
                           venues, landmarks, connections; plus introduceArtist()
    recommend.ts           Connections, "you might also like" trails, Discover
    random.ts, store.ts    Seeded PRNG, tiny observable store
  music/musicService.ts    Provider abstraction, preview player
  scene/                   Rendering
    CityScene.ts           Renderer, camera, controls, bloom, picking, camera moves, build intro
    cityBuilder.ts         CityPlan → meshes; build animation; selection/beam/arc helpers
    buildings.ts           Building archetypes composed from instanced parts
    models.ts              Venue, landmark and monument models
    materials.ts           Shared materials, including the procedural window shader
    instancer.ts           Instanced batches with per-instance grow/pop animation
    geometries.ts, textures.ts, labels.ts
  ui/                      Landing, HUD (DNA, explorer lists, info panel, player), helpers
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

- A remote artist metadata provider for names outside the catalogue
- Spotify / Apple Music SDK playback (full tracks for signed-in users)
- Walking or driving mode through the streets
- Saving cities to an account and comparing two people's cities
- More landmark models and more genres (hip hop, jazz, soul, metal…)
