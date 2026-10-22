import type { FileMap } from "../src/filemap.js";

/** Build a small fixture FileMap: 2 people + 1 play crediting one of them. */
export function fixtureFiles(): FileMap {
  const map: FileMap = new Map();
  const j = (o: unknown) => JSON.stringify(o, null, 2) + "\n";

  map.set(
    "src/content/people/esin-alpogan.json",
    j({
      title: "Esin Alpogan",
      slug: "esin-alpogan",
      date: "2020-07-16T16:57:35.000Z",
      headshot: "/wp-content/uploads/2020/07/IMG_2676-1.jpg",
      role: null,
      published: true,
      body: "<p>Writer and actress.</p>",
    }),
  );
  map.set(
    "src/content/people/secil-honeywill.json",
    j({
      title: "Secil Honeywill",
      slug: "secil-honeywill",
      date: "2020-07-16T16:57:35.000Z",
      headshot: null,
      role: null,
      published: true,
      body: "<p>Founder.</p>",
    }),
  );
  map.set(
    "src/content/plays/transmission.json",
    j({
      title: "Transmission",
      slug: "transmission",
      date: "2020-07-29T17:09:19.000Z",
      poster: null,
      youtube: null,
      bgColour: "#c38d9e",
      credits: [
        { role: "Director", name: "Secil Honeywill", slug: "secil-honeywill" },
        { role: "Cast", name: "Esin Alpogan", slug: "esin-alpogan" },
      ],
      published: true,
      body: "<p>A short play.</p>",
    }),
  );
  map.set(
    "src/content/posts/background-noise.json",
    j({
      title: "Background Noise",
      slug: "background-noise",
      date: "2023-05-25T00:00:00.000Z",
      featuredImage: null,
      published: true,
      body: "<p>by Marcela Scarpellini</p>",
    }),
  );
  return map;
}
