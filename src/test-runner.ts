/**
 * Simple test runner for the MCP server
 * Run with: npx ts-node src/test-runner.ts
 */

import { getConfig } from './utils/config.js';
import {
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
} from './tools/index.js';

// Set environment variables for testing
process.env.VAULT_PATH = process.cwd() + '/test-vault';
process.env.ACCOMPLISHMENTS_FOLDER = 'accomplishments';
process.env.DEFAULT_CANVAS = 'projects/main.canvas';

const config = getConfig();

async function runTests() {
  console.log('=== Obsidian Accomplishments MCP Server Tests ===\n');
  console.log('Config:', config, '\n');

  try {
    // Test 1: Create accomplishments
    console.log('--- Test 1: Create Accomplishments ---');
    
    const acc1 = await handleManageAccomplishment(config, {
      operation: 'create',
      data: {
        title: 'Setup Development Environment',
        effort: 'Engineering',
        priority: 'High',
        outcome: 'Development environment is fully configured and ready for coding',
        acceptance_criteria: ['Node.js installed', 'IDE configured', 'Git setup'],
      },
    });
    console.log('Created ACC1:', JSON.stringify(acc1, null, 2));

    const acc2 = await handleManageAccomplishment(config, {
      operation: 'create',
      data: {
        title: 'Implement Core Features',
        effort: 'Engineering',
        priority: 'Critical',
        outcome: 'Core features are implemented and working',
      },
    });
    console.log('Created ACC2:', JSON.stringify(acc2, null, 2));

    const acc3 = await handleManageAccomplishment(config, {
      operation: 'create',
      data: {
        title: 'Write Documentation',
        effort: 'Business',
        priority: 'Medium',
        outcome: 'Documentation is complete and published',
      },
    });
    console.log('Created ACC3:', JSON.stringify(acc3, null, 2));

    // Test 2: Add dependencies
    console.log('\n--- Test 2: Add Dependencies ---');
    
    // ACC-002 depends on ACC-001
    const dep1 = await handleManageDependency(config, {
      operation: 'add',
      blocker_id: 'ACC-001',
      blocked_id: 'ACC-002',
    });
    console.log('Added dependency:', JSON.stringify(dep1, null, 2));

    // ACC-003 depends on ACC-002
    const dep2 = await handleManageDependency(config, {
      operation: 'add',
      blocker_id: 'ACC-002',
      blocked_id: 'ACC-003',
    });
    console.log('Added dependency:', JSON.stringify(dep2, null, 2));

    // Test 3: Add tasks
    console.log('\n--- Test 3: Add Tasks ---');
    
    const task1 = await handleManageTask(config, {
      operation: 'add',
      accomplishment_id: 'ACC-001',
      data: {
        name: 'Install Node.js',
        goal: 'Have Node.js v20+ installed',
        description: 'Download and install Node.js LTS',
        estimate: 0.5,
      },
    });
    console.log('Added task:', JSON.stringify(task1, null, 2));

    const task2 = await handleManageTask(config, {
      operation: 'add',
      accomplishment_id: 'ACC-001',
      data: {
        name: 'Configure IDE',
        goal: 'IDE is set up with extensions',
        description: 'Install VS Code and required extensions',
        estimate: 1,
      },
    });
    console.log('Added task:', JSON.stringify(task2, null, 2));

    // Test 4: Set work focus
    console.log('\n--- Test 4: Set Work Focus ---');
    
    const focus = await handleSetWorkFocus(config, {
      accomplishment_id: 'ACC-001',
      in_progress: true,
      task_id: 'ACC-001:Task 1:Install Node.js',
      task_status: 'InProgress',
    });
    console.log('Set focus:', JSON.stringify(focus, null, 2));

    // Test 5: Get accomplishment details
    console.log('\n--- Test 5: Get Accomplishment Details ---');
    
    const details = await handleGetAccomplishment(config, { id: 'ACC-001' });
    console.log('ACC-001 details:', JSON.stringify(details, null, 2));

    // Test 6: List accomplishments
    console.log('\n--- Test 6: List Accomplishments ---');
    
    const list = await handleListAccomplishments(config, {});
    console.log('All accomplishments:', JSON.stringify(list, null, 2));

    // Test 7: Get current work
    console.log('\n--- Test 7: Get Current Work ---');
    
    const currentWork = await handleGetCurrentWork(config, {});
    console.log('Current work:', JSON.stringify(currentWork, null, 2));

    // Test 8: Get blocked items
    console.log('\n--- Test 8: Get Blocked Items ---');
    
    const blocked = await handleGetBlockedItems(config, {});
    console.log('Blocked items:', JSON.stringify(blocked, null, 2));

    // Test 9: Get ready to start
    console.log('\n--- Test 9: Get Ready to Start ---');
    
    const ready = await handleGetReadyToStart(config, {});
    console.log('Ready to start:', JSON.stringify(ready, null, 2));

    // Test 10: Get project status
    console.log('\n--- Test 10: Get Project Status ---');
    
    const status = await handleGetProjectStatus(config, {});
    console.log('Project status:', JSON.stringify(status, null, 2));

    console.log('\n=== All Tests Completed Successfully ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTests();

