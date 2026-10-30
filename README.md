# nirry-site

Source for the portfolio site published at **https://nirry.net**.

A single static page (`index.html`) — no build step, no dependencies. Hosted with
GitHub Pages serving from the `main` branch root.

## Files

- `index.html` — the whole site (markup, styles and scripts inline).
- `CNAME` — custom domain for GitHub Pages (`nirry.net`).
- `.nojekyll` — tells Pages to serve files as-is, skipping Jekyll processing.

## Deploy

Pages rebuilds automatically on every push to `main`. To update the site, edit
`index.html`, commit, and push:

```
git add index.html
git commit -m "Update site"
git push
```
