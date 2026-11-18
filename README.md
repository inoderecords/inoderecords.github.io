# INODERECORDS, the shelf

One static page listing the records physically on hand, for linking from the
Facebook Page, from Marketplace listings and from group posts.

This is not the store. The store is the monorepo at
[antuK3n/inoderecords](https://github.com/antuK3n/inoderecords) and it is not
launching yet. This page exists so there is something to link to in the
meantime, and so a buyer deciding whether to trust a stranger on Marketplace
has somewhere real to land.

## The idea

**The page is a crate. One record at a time, centre stage, and you flip
through it.**

Four versions got this wrong before the current one, and each looked
defensible while it was being built.

The first made the *information* clever, presenting stock as inodes and
blocks on a volume. It looked technical and it was unusable: nobody should
decode a metaphor to find out a record costs 2,500 pesos. Awwwards scores
usability at 30%, second only to design, and striking work loses ground
exactly where the purchase path goes murky.

The second fixed the words and broke the picture. The copy went plain and all
the ambition went into abstract instrument panels beside each row: a dial
reading the price position, rings counting copies, a seeded polygon per
record. Every line meant something. None of it answered the only question a
visitor has, which is *what does the record look like*. **A record shop that
will not show you the record is a spreadsheet with a shader on it.**

The third put real cover art on a real 3D sleeve, which was right, and then
put five of them on one screen, which was not. Five covers, five prices, five
buttons and five sets of linework means nothing is the subject.

The fourth kept every cover permanently dithered. That applied the identity
to the one thing on the page that must not be stylised: a buyer has to
*recognise* the record, and a 1-bit cover is a good-looking thing to have to
decode.

The fifth got the stage right and dressed the page around it in parts from
four different sites: a serif for artist names, two extra monos for labels
and the wordmark, boxed chips, boxed arrows, graph paper burned into the
void. Each piece was defensible. Together they had no ruling voice, and the
page read as copy-paste rather than design.

So now: one record, in the middle, with its real cover in colour, examined
like a type specimen examines a glyph. The dither did not go away, it
stopped being the resting state. The full design language is below.

## Why it is built this way

No framework, no npm install, no build toolchain. A handful of files, a
folder of fonts and a folder of artwork. It deploys by existing.

**The markup is a plain list of every record**, with its cover, price and
button. `crate.js` upgrades that list into the stage. With no JavaScript you
get all five stacked down the page and every one is shoppable, which also
means a Facebook crawler fetching a link preview sees the whole shelf rather
than one slide of a carousel.

WebGL failing is a *separate, smaller* failure. The carousel is layout and
navigation; the shader only fills the middle of it. Lose the shader and the
stage shows the cover as a plain `<img>`, flipping exactly the same way.

## Changing the shelf

Edit `stock.json`, then:

```sh
node build.mjs
```

Commit the regenerated `index.html` alongside it.

Landed costs and selling notes do not belong in this repo at all. They live
in `owner.json`, which is gitignored and never pushed. The one underscore
field left in `stock.json` is `_photo`, a pointer to an owner photograph of
the disc. `build.mjs` still refuses to emit any underscore field and throws
if one ever reaches the output.

The first record in `stock.json` is the one the page opens on. `/#chatpile`
opens on that record instead.

### Adding artwork for a new record

```sh
node art.mjs          # --force to refetch what is already there
```

This one needs the main checkout beside this one, for the cover matcher and
for sharp. What it writes into `art/` is committed, so a fresh clone builds
the page with nothing installed. You only run it when a record joins the
shelf.

It finds the canonical artwork through the brain's existing matcher
(`packages/agent/core/coverart.mjs`): a MusicBrainz release-group, then the
Cover Art Archive. That is the artwork contributed against the album, not a
shop's photograph of a shrink-wrapped product with an obi strip and a price
sticker on it. **The matcher refuses rather than guesses**, so "no confident
match" is a normal outcome, not a failure. The sleeve then renders without a
texture and the record still sells. Drop a cover in by hand if you have one.

One file per album, in colour, serving as both the shader's texture and the
plain `<img>`. Charli's LP and CD are one album and one picture.

> MusicBrainz answers a burst with a "currently busy" body rather than a 503,
> and `coverart.mjs` turns any throw into a null, which reads identically to
> "this album has no art". That cost a wrong conclusion once already: Chat
> Pile looked artless when the artwork was there all along. `art.mjs` retries
> and keeps the two outcomes apart.

## The crate

`crate.js` raytraces the sleeves in a WebGL fragment shader. One fractional
`pos` runs the whole thing: slots are placed by their distance from centre,
so a transition is nothing but `pos` travelling and every sleeve following
from it. **Drag scrubs `pos` directly**, which is why it feels like a crate
and not like a slideshow.

Wheel, arrow keys, Home and End, the number keys, the arrow buttons, the
spine ticks, swipe, and a tap on either side of the stage all move it.

**The disc retracts while you flip.** When a record settles in the middle its
disc slides out on its own and turns; start flipping and it tucks back in
first. That is what you would have to do with the real thing, and it keeps
the sleeves clean as they pass each other. The disc is the actual pressing,
so bone white comes out bone white and the splatter turns *with* the record
instead of swimming across it.

**CDs never open.** A CD is a closed jewel case, always, because disc photos
are unobtainable and drawing one would imply we have it. It is built wider
than tall at the real 142 by 125, or it reads as a DVD case and quietly tells
the buyer the wrong thing. Nothing slides out, and nothing steps aside to
make room for a disc that is not coming.

**Neighbours are barely dimmed, and that is deliberate.** The obvious move is
to fade them back so the centre dominates. It does not work here: there is no
grey to fade into. Push a 1-bit surface down and the ordered dither thins
into scattered dots, so a dimmed sleeve stops reading as a sleeve further
away and starts reading as dirt on the screen. They recede the only way this
palette allows: turned nearly edge on, pushed back, and placed so most of
each one is outside the frame.

The framing is computed from the stage's actual shape rather than from a
constant, working back from the sleeve plus however far the disc is currently
out. A hardcoded zoom was wrong for both ends: too small on a desktop, and on
a phone the disc ran off the edge.

## Colour, and the dither

**The dither is how a thing arrives, not what it is.** Both the cover and
the record resolve out of an ordered Bayer pattern into their real colour.
That single move, applied twice, is why the page reads as one idea rather
than two effects.

- **The cover** resolves top to bottom when you reach a record, once, with a
  thin blue front riding the boundary. `STYLE.md` keeps `#2400ff` for
  interference only, and a signal resolving is the one honest place for it.
  A record you have already seen does not replay it.
- **The record** develops as it slides out of the sleeve. It leaves as a
  dither and is the photograph by the time it is clear of the mouth, so the
  change lands on something you can already see rather than happening
  behind the sleeve.

Everything the page draws and does *not* resolve stays 1-bit: the sleeve's
edges and spine, the empty stage, the whole shell. Colour means "this is a
real object we are selling"; the dither is the house.

There is no procedural record left in the shader. There used to be a groove
field ported from the flat mark, which was a nice idea and the wrong one:
the record on a shop page has to be the record, not our drawing of it.

### Where the record comes from: `disc.mjs`

**Photo-only. The record is a photograph of the record.** It is never drawn
from the edition text and never approximated procedurally. Both were tried
on the main site and both were rejected:

> "a word is not a look"

An earlier version of this page did exactly that: it read the variant string
for colour words and rendered a green splatter because the listing said
"splatter". That fabricates the one thing the buyer is paying extra for.

```sh
node --env-file=../inoderecords/.env.local disc.mjs
```

The pipeline is the brain's, not ours. `core/discogs.mjs` finds the pressing
and its photos, `core/disc-resolve.mjs` tries the catalog first and then a
self-hosted sweep of sibling pressings, and `core/pressing.mjs` runs a
vision pass whose job is **geometry**: find each disc and return its full
bounding circle, extrapolated even where the record is hidden behind the
sleeve. This file then cuts the circle out and writes a square PNG with the
outside transparent, which is the same crop the main viewer does at runtime.

**How far a record comes out is measured, not assumed.** The main viewer
tucks every photo disc to a fixed third, because a crop usually only holds
the arc the camera saw and the rest of the circle is transparent. Copying
that constant here hid a complete, fully photographed record down to a
sliver for a constraint it did not have.

So `disc.mjs` reports `open`: the leftmost point from which the crop is
solid. A whole record comes all the way out; an arc stays tucked behind the
sleeve where its missing side is hidden. Nothing spins either way, because
spinning would rotate the empty half into view.

### Three guards, all of which caught something real

A photo of the **wrong** pressing is worse than no photo. No photo is honest
and the footer offers a real one; the wrong photo looks authoritative.

1. **A failed look is not a missing disc.** The first run reported all four
   records as having no disc in any photo. They had 20, 39, 10 and 13 photos
   and every vision call had 503'd or timed out, which `analyzeDiscPhoto`
   catches and returns as null. `disc.mjs` throws instead and counts
   `FAILED` separately from cover-only. It also walks a model chain, because
   `gemini-flash-latest` was overloaded while `-lite-` answered fine.
2. **The release has to be ours, so go and find it.** `resolveDiscogsByText`
   returns the first release by the right artist, which for "Amazon
   Exclusive Bone White Vinyl" was a *baby blue* pressing. `pressingHunt`
   now pulls the master's whole version list, fetches each vinyl pressing
   and ranks them by how well their colour matches our variant, then walks
   them best-first. Charli resolves to "White Bone", Chat Pile to "Stereo,
   Black vinyl", Underscores to "Clear".

   The version list does **not** carry the colour: its `format` is
   `"LP, Album, Limited Edition, Numbered, Stereo"` for every pressing, and
   the colour lives in `formats[0].text` on the individual release. Ranking
   on the list alone finds nothing, which is exactly what a first attempt
   did.
3. **The photo has to match the edition.** Told in plain words that a "Green
   Glow In The Dark Splatter" edition must not return a standard black
   record, the model returned one anyway. Instructions are not a check, so
   the crop is measured: if the edition names a colour and the pixels are a
   plain black record, it is thrown away.

Two ways to overrule it when you know better.

Pin the exact release:

```json
{ "id": "charli-lp", "discogs": "https://www.discogs.com/release/12345678" }
```

Or use your own photograph, which outranks everything. Drop the file in
`art/` and point at it with the owner-only `_photo` field:

```json
{ "id": "phoebe", "_photo": "art/phoebe-source.webp" }
```

This is the escape hatch the photo-only rule needs. Phoebe's Rogue Planet
pressing has no usable disc photo anywhere on Discogs -- six versions claim
the green glow splatter and the only discs pictured are plain black -- so
the owner photographed it. The analyser still runs, because finding the
circle is geometry, but none of the is-this-ours guards do: you are holding
the record.

Anything unconfirmed renders **cover-only**, which is the honest answer and
exactly what the rule is for.

Two things that are easy to undo by accident:

- **Resolution and cell size are separate on purpose.** The canvas renders
  at the display's real resolution and the shader sizes its own dither cell
  (`uCell`, in CSS pixels). It used to render at half resolution and upscale
  with `image-rendering: pixelated`, which was right when every surface was
  a dither and wrong the day the cover became a photograph: a blocky
  photograph at a quarter of the pixels the screen has.
- **The live dither is ordered (Bayer), not Atkinson.** Atkinson pushes its
  error to six neighbours in sequence, which is strictly serial and can never
  be a fragment shader.
- The resolve front starts a full band *above* the top edge and ends a full
  band *below* the bottom. Park it at the boundary and it welds a blue line
  across the top of every cover, permanently.

## The design language: a specimen sheet

The model is the specimen page of the page's own typeface
([typographic.systems/obel-mono](https://typographic.systems/obel-mono)):
one object centre stage, annotated by small technical readouts, everything
in a single voice. Here the record is the specimen. The rules, so the next
edit keeps them:

- **One typeface.** Obel Mono carries the whole page and weight is the
  hierarchy: 800 for the wordmark and the artist, 700 for prices and the
  button, 500 for every readout, 400 for the one sentence, 300 for the
  album. Adding a second family is how the fifth version failed.
- **Structure from punctuation, never boxes.** `( LP / SEALED / ONLY 1 )`
  is the tag line; slashes and middle dots separate; the only rules are the
  spine rail and the crate list's dotted price leaders, both data, not
  walls. No chips, no boxed arrows, no section borders.
- **Caps + tracking for every readout**, sentence case for exactly one line
  per record: the hook. That contrast is the human voice inside the
  instrument.
- **The readouts share one top line.** Provenance left ("DISC ·
  PHOTOGRAPHED / THIS PRESSING", straight from the photo-only rule), the
  tag line centre, the crate list right, all hanging from the same y under
  the stage. The counter `01 / 05` sits between bare arrow glyphs.
- **Blue is interference only**: the shader's resolve front, `::selection`,
  the boot's READY line. Never buttons, never numbers, never hover.
- **The void is void.** No background grids. The scanline film and the
  corner registration marks are the only things on it.
- **The buy row is pinned** to the same height for every record, so
  flipping never bounces the one row you are about to press.

## Type

**Obel Mono** by Cody Collier, [Typographic
Systems](https://typographic.systems/obel-mono), SIL OFL 1.1. The variable
font: one file covering weights 100 to 900, subset to Latin by `font.py`,
35 KB. Its own README calls it "a monospaced typeface for terminals, code
and agents", which is this shop's identity described by somebody who had
never heard of it. It is the only typeface the page loads; the wordmark's
disc glyph is an inline SVG, not a second font's character.

To update it, download the WOFF2 zip from the link above and:

```sh
python -m pip install "fonttools[woff]"     # once
python font.py path/to/ObelMono-VF.woff2
```

The output is committed, so nobody needs fonttools to build the page.

Two things `font.py` is careful about:

- **It subsets by range, not by the characters currently on the page.** Keep
  only what `index.html` uses today and the first record by Sigur Rós falls
  back to a different typeface mid-word.
- **It puts the licence back.** `pyftsubset` drops name IDs 13 and 14, which
  is where the OFL notice lives inside the file. Subsetting is explicitly
  permitted; quietly stripping the licence out of the binary while doing it
  is not. `fonts/ObelMono-OFL.txt` and `fonts/ObelMono-AUTHORS.txt` ship
  alongside.

## Brand assets

`brand/` holds files generated in the main repo, not here:

| file | made by |
|---|---|
| `mark-lg.svg`, `favicon.svg` | `npm run gen-mark` |
| `og.png` | `node brand-lab/export-og.mjs` |

If the mark changes, regenerate them there and copy them over. There is one
definition of the mark and it lives in `brand-lab/mark.js`.

## What it costs

One canvas. It renders only while something is moving, or while a disc is
turning, and never behind a hidden tab. With `prefers-reduced-motion` there
is no boot, no reveal, no spin and no flip animation: every cover is simply
there and the page is fully shoppable standing still.

`boot.js` runs a short instrument start-up, honest about costing the visitor
time: under a second and a half, once per tab rather than per page view,
never for a reader who asked for reduced motion, and skippable with any click
or key. Its count is read off the page, so it cannot announce a shelf we do
not have.

Known gap: the covers are the published artwork, not photographs of the
actual copy. Those are a different job and are sent on request, which the
footer says plainly.

## Deploying

GitHub Pages, from the repository root on the default branch. No action, no
build step. Settings, Pages, Deploy from a branch.
