# Workflow Tool Resolution: `mcp` + `runner` Fields

**Parent Story:** S-046 (D1: Infrastructure & Workflow Setup)
**Milestone:** M-031 (D1: OSS Developer Demo)
**Priority:** P1
**Blocks:** T-484 (Author diagnose_ci_failure workflow via agent), T-690 (Demo env verification)

---

## Problem

When an agent authors a workflow YAML in Claude Desktop, it writes bare tool
names it knows from its own MCP connections (e.g., `tool: list_workflow_runs`).
But Ploston's CP ToolRegistry stores runner-hosted tools with a
`runner__mcp__tool` prefix (e.g., `mac__github__list_workflow_runs`).

The agent has **no way to know**:
1. Which tools Ploston can actually invoke at workflow execution time
2. What the correct tool name format is for workflow YAML
3. Which MCP server hosts each tool (needed for routing)

This causes `workflow_validate` to fail with "Tool not found" and the agent
cannot self-correct because it doesn't know the valid names.

---

## Design

### 1. New YAML fields: `mcp` on steps, `runner` on defaults

#### Step-level `mcp` (required for tool steps)

```yaml
steps:
  - id: fetch_runs
    tool: list_workflow_runs
    mcp: github                  # NEW — which MCP server hosts this tool
    params:
      owner: "{{ inputs.owner }}"
```

#### Workflow-level `defaults.runner` (optional)

```yaml
defaults:
  runner: mac                    # NEW — target runner for all tool steps
  timeout: 60
```

Per-step `runner` override is NOT added in this iteration — workflow-level
default covers all demo scenarios. Can be added later if multi-runner
workflows are needed.

### 2. Resolution logic

```
For each tool step:
  mcp = step.mcp                         # required, validated
  runner = workflow.defaults.runner       # optional
  tool = step.tool                        # required, validated

  if runner is set:
    # Runner-hosted tool — reconstruct prefixed name
    canonical = f"{runner}__{mcp}__{tool}"
    look up canonical in runner_registry.available_tools
  else:
    # CP-direct tool — look up by server_name + tool name
    look up tool in tool_registry where server_name == mcp
```

### 3. Schema changes — `tool_steps` section in `workflow_schema`

Add a `tool_steps` key to `generate_workflow_schema()` output (parallel to
existing `code_steps`). This is the **primary mechanism** for the agent to
discover which tools are available.

The `tool_steps` section is split into two parts:
- **Static** (from `generate_workflow_schema()`): syntax rules, field
  descriptions, anti-patterns
- **Dynamic** (injected by `_handle_schema`): live `available_tools` list
  from ToolRegistry + RunnerRegistry

```json
{
  "tool_steps": {
    "description": "Tool steps invoke an MCP tool registered in Ploston. ...",
    "fields": {
      "tool": "The tool name as registered on the MCP server (e.g., list_workflow_runs)",
      "mcp": "Required. The MCP server name that hosts the tool (e.g., github, filesystem)",
      "params": "Tool parameters — supports {{ }} template syntax"
    },
    "runner_resolution": "If defaults.runner is set, tools resolve as ...",
    "available_tools": [
      {
        "mcp_server": "github",
        "runner": "mac",
        "tools": ["list_workflow_runs", "get_commit", "download_job_logs", ...]
      },
      {
        "mcp_server": "native_tools",
        "runner": null,
        "tools": ["filesystem_read", "filesystem_write", ...]
      }
    ]
  }
}
```

The `available_tools` list gives the agent everything it needs:
- Which MCP servers exist and what to put in the `mcp:` field
- Which runner (if any) to set in `defaults.runner:`
- The exact tool names to use in `tool:` fields

### 4. Validator improvements — helpful errors + `available_tools` on failure

When `workflow_validate` encounters a tool-not-found error, the error
response includes `available_tools` so the agent can self-correct:

```json
{
  "valid": false,
  "errors": [
    {
      "path": "steps.fetch_runs.tool",
      "message": "Tool 'list_workflow_runs' not found on MCP server 'github'",
      "available_tools_on_server": ["list_workflow_runs", "get_commit", ...],
      "hint": "Check that the runner 'mac' is connected and the tool name matches exactly"
    }
  ]
}
```

### 5. Tool description updates

Update the `workflow_schema` tool description to mention tool discovery:

```python
WORKFLOW_SCHEMA_TOOL = {
    "name": "workflow_schema",
    "description": (
        "Get the workflow YAML schema documentation. "
        "Returns the complete structure for authoring workflow YAML files, "
        "including all fields, types, defaults, accepted syntax variants, "
        "a concrete example, and the list of available tools that can be "
        "used in workflow tool steps."
    ),
    ...
}
```

