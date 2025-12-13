#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getConfig } from './utils/config.js';
import { MCPError } from './models/types.js';
import {
  allToolDefinitions,
  handleBatchOperations,
  handleManageAccomplishment,
  handleManageDependency,
  handleManageTask,
  handleSetWorkFocus,
  handleGetAccomplishment,
  handleListAccomplishments,
  handleGetCurrentWork,
  handleGetBlockedItems,
  handleGetReadyToStart,
  handleGetProjectStatus,
  handleGetAccomplishmentsGraph,
  handleReadDocs,
  handleUpdateDoc,
  handleListWorkspaces,
  handleListFiles,
} from './tools/index.js';

// Create server instance
const server = new Server(
  {
    name: 'obsidian-accomplishments',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Get configuration
let config: ReturnType<typeof getConfig>;
try {
  config = getConfig();
} catch (error) {
  console.error('Configuration error:', error);
  process.exit(1);
}

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allToolDefinitions,
  };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'manage_accomplishment':
        result = await handleManageAccomplishment(config, args as any);
        break;

      case 'batch_operations':
        result = await handleBatchOperations(config, args as any);
        break;

      case 'manage_dependency':
        result = await handleManageDependency(config, args as any);
        break;

      case 'manage_task':
        result = await handleManageTask(config, args as any);
        break;

      case 'set_work_focus':
        result = await handleSetWorkFocus(config, args as any);
        break;

      case 'get_accomplishment':
        result = await handleGetAccomplishment(config, args as any);
        break;

      case 'list_accomplishments':
        result = await handleListAccomplishments(config, args as any);
        break;

      case 'get_current_work':
        result = await handleGetCurrentWork(config, args as any);
        break;

      case 'get_blocked_items':
        result = await handleGetBlockedItems(config, args as any);
        break;

      case 'get_ready_to_start':
        result = await handleGetReadyToStart(config, args as any);
        break;

      case 'get_project_status':
        result = await handleGetProjectStatus(config, args as any);
        break;

      case 'get_accomplishments_graph':
        result = await handleGetAccomplishmentsGraph(config, args as any);
        break;

      case 'read_docs':
        result = await handleReadDocs(config, args as any);
        break;

      case 'update_doc':
        result = await handleUpdateDoc(config, args as any);
        break;

      case 'list_workspaces':
        result = await handleListWorkspaces(config, args as any);
        break;

      case 'list_files':
        result = await handleListFiles(config, args as any);
        break;

      default:
        throw new MCPError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL', 400);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof MCPError ? error.code : 'INTERNAL_ERROR';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: true,
              code: errorCode,
              message: errorMessage,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Obsidian Accomplishments MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

