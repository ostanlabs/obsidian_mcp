import { z } from 'zod';
import { Config } from '../models/types.js';
import { listAllAccomplishments, getAccomplishment } from '../services/accomplishment-service.js';

// Schema for the tool (no parameters)
export const getBlockedItemsSchema = z.object({});

export type GetBlockedItemsInput = z.infer<typeof getBlockedItemsSchema>;

export const getBlockedItemsDefinition = {
  name: 'get_blocked_items',
  description: 'Get all accomplishments that are blocked by incomplete dependencies. Shows what cannot be started yet and what is blocking them.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetBlockedItems(
  config: Config,
  _input: GetBlockedItemsInput
): Promise<unknown> {
  const allAccomplishments = await listAllAccomplishments(config);

  // Build a map of accomplishment IDs to their status
  const statusMap = new Map<string, { title: string; status: string }>();
  for (const acc of allAccomplishments) {
    statusMap.set(acc.frontmatter.id, {
      title: acc.frontmatter.title,
      status: acc.frontmatter.status,
    });
  }

  // Find blocked accomplishments
  const blockedItems: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    effort: string;
    updated: string;
    blocking_items: Array<{
      id: string;
      title: string;
      status: string;
    }>;
  }> = [];

  for (const acc of allAccomplishments) {
    if (!acc.is_blocked) continue;

    // Find which dependencies are incomplete
    const blockingItems: Array<{ id: string; title: string; status: string }> = [];
    
    for (const depId of acc.frontmatter.depends_on) {
      const depInfo = statusMap.get(depId);
      if (depInfo && depInfo.status !== 'Completed') {
        blockingItems.push({
          id: depId,
          title: depInfo.title,
          status: depInfo.status,
        });
      } else if (!depInfo) {
        // Dependency not found - still blocking
        blockingItems.push({
          id: depId,
          title: '(not found)',
          status: 'unknown',
        });
      }
    }

    if (blockingItems.length > 0) {
      blockedItems.push({
        id: acc.frontmatter.id,
        title: acc.frontmatter.title,
        status: acc.frontmatter.status,
        priority: acc.frontmatter.priority,
        effort: acc.frontmatter.effort,
        updated: acc.frontmatter.updated,
        blocking_items: blockingItems,
      });
    }
  }

  // Sort by priority (Critical > High > Medium > Low)
  const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  blockedItems.sort((a, b) => {
    const aOrder = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
    const bOrder = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
    return aOrder - bOrder;
  });

  return {
    count: blockedItems.length,
    blocked_items: blockedItems,
  };
}

