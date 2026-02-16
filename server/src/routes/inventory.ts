/**
 * Inventory API Routes
 * Handles player inventory management
 */

import { Router } from 'express';
import { Player } from '../models/Player.js';

const router = Router();

/**
 * GET /api/v1/inventory
 * Get player's current inventory
 */
router.get('/', async (req, res) => {
  try {
    const { playerId } = req.query;

    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({ error: 'playerId is required' });
    }

    // Find or create player
    let player = await Player.findOne({ playerId });
    if (!player) {
      player = new Player({ playerId, inventory: {} });
      await player.save();
    }

    // Convert Map to plain object
    const inventory = player.inventory ? Object.fromEntries(player.inventory) : {};

    res.json({ playerId, inventory });
  } catch (error) {
    console.error('[inventory] GET error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/inventory/sync
 * Sync player's inventory after item consumption
 */
router.post('/sync', async (req, res) => {
  try {
    const { playerId, inventory } = req.body;

    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({ error: 'playerId is required' });
    }

    if (!inventory || typeof inventory !== 'object') {
      return res.status(400).json({ error: 'inventory object is required' });
    }

    // Find or create player
    let player = await Player.findOne({ playerId });
    if (!player) {
      player = new Player({ playerId });
    }

    // Update inventory
    player.inventory = new Map(Object.entries(inventory));
    await player.save();

    res.json({ success: true, playerId, inventory });
  } catch (error) {
    console.error('[inventory] POST sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
