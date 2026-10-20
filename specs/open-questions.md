# Open questions

1. **Who uses the chat?** Only us, or customers too?
   Using Claude subscription tokens (`*.token`) to serve outside users goes against Anthropic's terms. For customers, use API keys (`*.key`).
2. **What may Claude do?** Plain chat with no tools, or also read files, run commands, search the web, or reach a handball stats data source? This decides `--allowedTools` and what goes into each chat's working folder.
3. **How does Claude read the rokomet stats?** Through files, a tool, or an MCP server? (Where the data comes from is answered: the RZS public API, see [data-source.md](data-source.md).)
4. **Auth**: one shared password, email + password accounts, or login with Google/GitHub?
5. **Off-server backups**: where to (another server, S3-compatible storage)?
