import { z } from 'zod';
import { Config } from '../models/types.js';
import { reconcileAllStatusIndicators, ReconcileResult } from '../services/status-indicator-service.js';

// Schema for the tool
export const reconcileCanvasSchema = z.object({
  canvas_source: z.string().optional(),
});

export type ReconcileCanvasInput = z.infer<typeof reconcileCanvasSchema>;

export const reconcileCanvasDefinition = {
  name: 'reconcile_canvas',
  description: `Reconcile the canvas by syncing status indicators for all accomplishments.

Creates missing status indicators, updates incorrect ones, and removes orphaned indicators.

Status indicators are emoji badges shown next to each accomplishment:
- 🚫 Blocked (red)
- ✅ Completed (green)
- 🔄 In Progress (cyan)
- ⚪ Not Started (default)

Use this tool to fix visual inconsistencies on the canvas.`,
  inputSchema: {
    type: 'object',
    properties: {
      canvas_source: {
        type: 'string',
        description: 'Canvas file path (optional, uses default if not specified)',
      },
    },
  },
};

export interface ReconcileCanvasResult {
  success: boolean;
  created: number;
  updated: number;
  removed: number;
  total_accomplishments: number;
  message: string;
}

export async function handleReconcileCanvas(
  config: Config,
  input: ReconcileCanvasInput
): Promise<ReconcileCanvasResult> {
  const result = await reconcileAllStatusIndicators(config, input.canvas_source);

  return {
    success: true,
    created: result.created,
    updated: result.updated,
    removed: result.removed,
    total_accomplishments: result.total_accomplishments,
    message: `Reconciled ${result.total_accomplishments} accomplishments: ${result.created} created, ${result.updated} updated, ${result.removed} removed`,
  };
}

