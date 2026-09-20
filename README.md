# gallery-website
A personal photography gallery with horizontal browsing, reflections beneath each photograph, and a details panel for camera information, locations, and personal notes.

**[View the gallery](https://gallery.martinqj.com)**

## Features

- Horizontal scrolling with mouse, touch, and keyboard navigation.
- Responsive layout with reflections and a gallery progress indicator.
- Images loaded as they approach the visible gallery area.
- Embedded photo metadata read when the details panel opens.
- Location maps powered by Leaflet and OpenStreetMap when GPS data is available.
- Personal notes and optional metadata overrides maintained in JSON.

## Architecture

| Component | Technology |
| --- | --- |
| Interface | HTML, CSS, and JavaScript |
| Catalog | Personal photos |
| Metadata extraction | exifr |
| Maps | Leaflet and OpenStreetMap |
| Photo storage | Cloudflare R2 |

| Path | Purpose |
| --- | --- |
| `index.html` | Page structure and photo details panel |
| `styles.css` | Layout, responsive styles, and reflections |
| `gallery.js` | Gallery navigation, photo loading, details, and maps |
| `metadata.js` | Metadata extraction, formatting, caching, and overrides |
| `photos.json` | Photo URLs, titles, alternative text, notes, and optional overrides |
| `vendor/exifr.js` | Metadata parsing library |
| `vendor/leaflet/` | Locally hosted map library and assets |

## Photo Details

The details table displays these fields, in order, when available:

1. Display dimensions
2. Camera manufacturer
3. Camera model
4. Capture date
5. Lens
6. Location
7. Personal notes

---
### Acknowledgments

- [exifr](https://github.com/MikeKovarik/exifr) — embedded metadata parsing.
- [Leaflet](https://leafletjs.com/) — interactive maps.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) — map data.
