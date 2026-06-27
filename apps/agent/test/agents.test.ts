import test from 'node:test';
import assert from 'node:assert/strict';
import { analyst } from '../src/mastra/agents/analyst';
import { dataDiscoveryAgent } from '../src/mastra/agents/discovery';
import { visualizationAgent } from '../src/mastra/agents/visualization';
import { delegateDiscoveryTool } from '../src/mastra/tools/delegate-discovery';
import { delegateVisualizationTool } from '../src/mastra/tools/delegate-visualization';

// Specialized agents (v1.2) — structural wiring (no model calls). The contract is
// that `analyst` stays the entry point and the specialists are internal.

test('the analyst keeps its registered id (web contract)', () => {
  assert.equal(analyst.id, 'analyst');
});

test('the specialist sub-agents are constructed with stable ids', () => {
  assert.equal(dataDiscoveryAgent.id, 'dataDiscovery');
  assert.equal(visualizationAgent.id, 'visualization');
});

test('the delegation tools expose the expected ids', () => {
  assert.equal(delegateDiscoveryTool.id, 'DelegateToDataDiscoveryAgent');
  assert.equal(delegateVisualizationTool.id, 'DelegateToVisualizationAgent');
});
