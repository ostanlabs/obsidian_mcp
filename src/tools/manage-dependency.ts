import { z } from 'zod';
import { Config, MCPError } from '../models/types.js';
import { addDependency, removeDependency } from '../services/dependency-service.js';

// Schema for the tool
export const manageDependencySchema = z.object({
  operation: z.enum(['add', 'remove']),
  blocker_id: z.string(),
  blocked_id: z.string(),
});

export type ManageDependencyInput = z.infer<typeof manageDependencySchema>;

export const manageDependencyDefinition = {
  name: 'manage_dependency',
  description: `Add or remove a dependency between accomplishments.

NOTE: When creating accomplishments, prefer passing depends_on directly to manage_accomplishment or batch_operations.
This tool is mainly for adding/removing dependencies AFTER accomplishments already exist.

The blocker must complete before the blocked can start. Adding a dependency automatically repositions the blocked node on the canvas.`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'remove'],
        description: 'The operation to perform',
      },
      blocker_id: {
        type: 'string',
        description: 'ID of the blocking accomplishment (must complete first)',
      },
      blocked_id: {
        type: 'string',
        description: 'ID of the blocked accomplishment (depends on blocker)',
      },
    },
    required: ['operation', 'blocker_id', 'blocked_id'],
  },
};

export async function handleManageDependency(
  config: Config,
  input: ManageDependencyInput
): Promise<unknown> {
  const { operation, blocker_id, blocked_id } = input;

  switch (operation) {
    case 'add': {
      const result = await addDependency(config, blocker_id, blocked_id);
      
      return {
        success: true,
        operation: 'add',
        blocker_id,
        blocked_id,
        new_position: result.position,
        message: `Dependency added: ${blocker_id} blocks ${blocked_id}`,
      };
    }

    case 'remove': {
      await removeDependency(config, blocker_id, blocked_id);
      
      return {
        success: true,
        operation: 'remove',
        blocker_id,
        blocked_id,
        message: `Dependency removed: ${blocker_id} no longer blocks ${blocked_id}`,
      };
    }

    default:
      throw new MCPError(`Unknown operation: ${operation}`, 'VALIDATION_ERROR', 400);
  }
}

