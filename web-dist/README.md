# @rsrsai/web-dist

Static frontend assets consumed by `rsrs web`. This layout belongs to the client repository; the CLI does not vendor the frontend source.

| Path | Purpose |
| --- | --- |
| `dist/index.html` | Built frontend |
| `dist/fonts/` | Font assets and their original license |
| `package.json` | Versioned package metadata and asset inclusion |

Build the UI in `client/tree-ui/` and keep distributed assets aligned with that build. Package publication is a separate release step. The CLI provides the local HTTP runtime and invokes memory commands; this package contains no Core implementation.
