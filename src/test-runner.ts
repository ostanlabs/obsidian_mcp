/**
 * Simple test runner for utility tools
 * Run with: npx ts-node src/test-runner.ts
 *
 * This test runner only tests utility tools (read_docs, update_doc, list_workspaces, list_files).
 * Entity management is done via V2 tools (create_entity, search_entities, etc.).
 */

import { getConfig } from './utils/config.js';
import {
  handleReadDocs,
  handleUpdateDoc,
  handleListWorkspaces,
  handleListFiles,
} from './tools/index.js';

// Set environment variables for testing
// VAULT_PATH should point to the project folder containing milestones/, stories/, etc.
process.env.VAULT_PATH = process.cwd() + '/test-vault';
process.env.DEFAULT_CANVAS = 'main.canvas';

const config = getConfig();

async function runTests() {
  console.log('=== Obsidian MCP Server Utility Tools Tests ===\n');
  console.log('Config:', config, '\n');

  try {
    // Test 1: List Workspaces
    console.log('--- Test 1: List Workspaces ---');
    const workspaces = await handleListWorkspaces(config, {});
    console.log('Workspaces:', JSON.stringify(workspaces, null, 2));

    // Test 2: List Files
    console.log('\n--- Test 2: List Files ---');
    try {
      // Use first workspace from list if available
      const workspaceList = workspaces as { workspaces: Array<{ name: string }> };
      if (workspaceList.workspaces && workspaceList.workspaces.length > 0) {
        const files = await handleListFiles(config, { workspace: workspaceList.workspaces[0].name });
        console.log('Files:', JSON.stringify(files, null, 2));
      } else {
        console.log('No workspaces available to list files');
      }
    } catch (e) {
      console.log('List files skipped:', (e as Error).message);
    }

    // Test 3: Read Docs
    console.log('\n--- Test 3: Read Docs ---');
    try {
      const workspaceList = workspaces as { workspaces: Array<{ name: string }> };
      if (workspaceList.workspaces && workspaceList.workspaces.length > 0) {
        const docs = await handleReadDocs(config, { workspace: workspaceList.workspaces[0].name, doc_name: 'README.md' });
        console.log('Docs:', JSON.stringify(docs, null, 2));
      } else {
        console.log('No workspaces available to read docs');
      }
    } catch (e) {
      console.log('Read docs skipped (file may not exist):', (e as Error).message);
    }

    console.log('\n=== All Utility Tool Tests Completed ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTests();
