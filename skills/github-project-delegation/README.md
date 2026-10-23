# github-project-delegation — installable Agent Skill

A portable [`SKILL.md`](SKILL.md) that turns [mcp-github-project-manager](https://github.com/kunwarVivek/mcp-github-project-manager) into a governed project management and delegation workflow. Compatible with Agent Skills-style directory loaders that support `SKILL.md`; actual MCP configuration and tool support depend on your client.

## Install

1. Install/register the separate MCP server in an MCP-capable client. Example stdio transport config:

   ```json
   {
     "mcpServers": {
       "github-project-manager": {
         "command": "npx",
         "args": ["-y", "mcp-github-project-manager"],
         "env": {
           "GITHUB_TOKEN": "<token-from-secret-store>",
           "GITHUB_OWNER": "<owner>",
           "GITHUB_REPO": "<repo>"
         }
       }
     }
   }
   ```

   Do not commit real tokens into config files. Use your MCP client's secure secret/env mechanism. Scope the token to the least necessary repositories and permissions.

2. Copy the entire `github-project-delegation/` directory into your agent client's skills directory (examples: `.agents/skills/` in a repository supporting Agent Skills, or a client-specific skills location). Consult your client's documentation for skill loading and MCP registration.
3. Check `discover_tools {}`. If the server only exposes `core`, enable the `agents` group as needed using the server's `MCP_TOOL_GROUPS` configuration, or the default `all`. Exact compatibility varies with server version.
4. Start a **separate worker harness** before expecting assigned agent work to execute; the MCP server stores claims and metadata but does not create an executing process by itself.
5. Test on a disposable project using [acceptance scenarios](tests/acceptance.md), then apply to production with the desired approval policy.

## Files

```text
github-project-delegation/
├── SKILL.md                   # Trigger, policy and decision workflow
├── references/
│   ├── mcp-actions.md         # Action mappings + sample inputs
│   ├── playbooks.md           # Detailed operating workflows
│   └── role-contracts.md      # PM / implementer / reviewer obligations
├── assets/
│   ├── issue-template.md
│   └── status-template.md
├── examples/
│   └── requests.md
└── tests/
    └── acceptance.md
```

## Source and limits

Grounded in repo's [README](https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/README.md), [MCP tool reference](https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/TOOLS.md), and [agent-harness guide](https://github.com/kunwarVivek/mcp-github-project-manager/blob/main/docs/agent-harness-integration.md). Reviewed 2026-10-23; runtime `discover_tools` is authoritative as APIs evolve.

This package does not contain code that independently schedules jobs, launches agents, grants repository permissions, or continuously monitors anything when no agent client is running.
