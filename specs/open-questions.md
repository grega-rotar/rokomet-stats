# Open questions

1. **What may Claude do?** Plain chat with no tools, or also read files, run commands, search the web, or reach a handball stats data source? This decides `--allowedTools` and what goes into each chat's working folder.
2. **How does Claude read the rokomet stats?** Through files, a tool, or an MCP server? (Where the data comes from is answered: the RZS public API, see [data-source.md](data-source.md).)
3. **Off-server backups**: where to (another server, S3-compatible storage)?

## Answered
- **Who uses the chat?** Only us, no customers (2026-10-20). Subscription tokens (`*.token`) are fine.
- **Auth**: keep the one shared password (2026-10-20). No user accounts.
