# Extensions

Streaming extensions are grouped by application:

- `sora/<extension>/`: Sora manifests and JavaScript scrapers.
- `mangayomi/<extension>/`: MangaYomi extensions.
- `debugger/`: local browser UI for testing Sora extension functions.

Current extensions:

- `sora/aflaam/`: Aflam Arabic-subbed movies and shows source.
- `sora/okanime/`: Okanime Arabic-subbed anime source.
- `sora/ristoanime/`: Risto Anime Arabic-subbed anime source.
- `sora/imdb-su/`: IMDb ID-based movies and shows source with adaptive HLS streams.

## Debugging

Run `python3 debugger/app.py`, then open `http://127.0.0.1:8000`.
