import { describe, it, expect } from 'vitest';
import { dealHand } from '../../src/logic.js';
import { standardRoom } from '../fixtures/rooms.js';
import { createPlayer, threePlayers, sixPlayers } from '../fixtures/players.js';

describe('Deal Hand', () => {
  describe('dealHand', () => {
    it('should deal 4 cards to each active player', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.playerHands).toHaveLength(3);
      result.playerHands.forEach(hand => {
        expect(hand.cards).toHaveLength(4);
        expect(typeof hand.seat_number).toBe('number');
      });
    });

    it('should deal 5 cards to each board', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.fullBoard1).toHaveLength(5);
      expect(result.fullBoard2).toHaveLength(5);
    });

    it('should only show 3 cards in initial board state (flop)', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.board_state?.board1).toHaveLength(3);
      expect(result.gameState.board_state?.board2).toHaveLength(3);
    });

    it('should generate a deck seed', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.deckSeed).toBeTruthy();
      expect(typeof result.deckSeed).toBe('string');
      expect(result.deckSeed.length).toBeGreaterThan(0);
    });

    it('should hide deck seed in game state', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.deck_seed).toBe('hidden');
    });

    it('should collect antes from all players', () => {
      const result = dealHand(standardRoom, threePlayers);

      // standardRoom has 5 ante, 3 players = 15 total
      expect(result.gameState.pot_size).toBe(15);

      result.updatedPlayers.forEach(player => {
        expect(player.total_invested_this_hand).toBe(5);
        expect(player.current_bet).toBe(5);
        expect(player.chip_stack).toBe(495); // 500 - 5
      });
    });

    it('should set current bet to ante amount', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.current_bet).toBe(5);
    });

    it('should set button to first seat when button is null', () => {
      const result = dealHand(standardRoom, threePlayers);

      // threePlayers has seats 1, 3, 5
      expect(result.gameState.button_seat).toBe(1);
    });

    it('should rotate button from previous hand', () => {
      const roomWithButton = { ...standardRoom, button_seat: 1 };
      const result = dealHand(roomWithButton, threePlayers);

      // Button should rotate from 1 to 3 (next seat)
      expect(result.gameState.button_seat).toBe(3);
    });

    it('should set phase to flop', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.phase).toBe('flop');
    });

    it('should set correct action order (after button)', () => {
      const result = dealHand(standardRoom, threePlayers);

      // With button at seat 1, order should be [3, 5, 1]
      // seats_to_act excludes all-in players
      expect(result.gameState.seats_to_act).toEqual([3, 5, 1]);
    });

    it('should set first actor correctly', () => {
      const result = dealHand(standardRoom, threePlayers);

      // First to act is seat after button
      expect(result.gameState.current_actor_seat).toBe(3);
    });

    it('should handle more players', () => {
      const result = dealHand(standardRoom, sixPlayers);

      expect(result.playerHands).toHaveLength(6);
      expect(result.gameState.pot_size).toBe(30); // 5 * 6
      expect(result.updatedPlayers).toHaveLength(6);
    });

    it('should exclude spectators from deal', () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_spectating: true }),
        createPlayer({ seat_number: 3 })
      ];

      const result = dealHand(standardRoom, players);

      expect(result.playerHands).toHaveLength(2);
      expect(result.gameState.pot_size).toBe(10); // 5 * 2
      expect(result.playerHands.find(h => h.seat_number === 2)).toBeUndefined();
    });

    it('should exclude sitting out players from deal', () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_sitting_out: true }),
        createPlayer({ seat_number: 3 })
      ];

      const result = dealHand(standardRoom, players);

      expect(result.playerHands).toHaveLength(2);
      expect(result.gameState.pot_size).toBe(10);
      expect(result.playerHands.find(h => h.seat_number === 2)).toBeUndefined();
    });

    it('should exclude players with zero chips', () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, chip_stack: 0 }),
        createPlayer({ seat_number: 3 })
      ];

      const result = dealHand(standardRoom, players);

      expect(result.playerHands).toHaveLength(2);
      expect(result.gameState.pot_size).toBe(10);
      expect(result.playerHands.find(h => h.seat_number === 2)).toBeUndefined();
    });

    it('should mark player all-in when ante equals chip stack', () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 5 }),
        createPlayer({ seat_number: 2, chip_stack: 500 })
      ];

      const result = dealHand(standardRoom, players);

      const player1 = result.updatedPlayers.find(p => p.seat_number === 1);
      expect(player1?.is_all_in).toBe(true);
      expect(player1?.chip_stack).toBe(0);
      expect(player1?.total_invested_this_hand).toBe(5);
    });

    it('should handle player with chips less than ante (short stack)', () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 3 }),
        createPlayer({ seat_number: 2, chip_stack: 500 })
      ];

      const result = dealHand(standardRoom, players);

      const player1 = result.updatedPlayers.find(p => p.seat_number === 1);
      expect(player1?.is_all_in).toBe(true);
      expect(player1?.chip_stack).toBe(0);
      expect(player1?.total_invested_this_hand).toBe(3); // Can only invest what they have

      // Pot should reflect actual contributions (3 + 5 = 8), not ante * player count
      expect(result.gameState.pot_size).toBe(8);
    });

    it('should exclude all-in players from seats to act', () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 5 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 })
      ];

      const result = dealHand(standardRoom, players);

      // Seat 1 is all-in, so should not be in seats_to_act
      expect(result.gameState.seats_to_act).not.toContain(1);
      expect(result.gameState.seats_to_act).toContain(2);
      expect(result.gameState.seats_to_act).toContain(3);
    });

    it('should increment hand number', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.hand_number).toBe(1); // room.current_hand_number + 1
    });

    it('should set min raise to big blind (ante)', () => {
      const result = dealHand(standardRoom, threePlayers);

      // Ante drives the opening stake size in bomb pots
      expect(result.gameState.min_raise).toBe(5); // standardRoom.big_blind
    });

    it('should initialize action tracking fields', () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.last_aggressor_seat).toBeNull();
      expect(result.gameState.last_raise_amount).toBeNull();
      expect(result.gameState.seats_acted).toEqual([]);
      expect(result.gameState.side_pots).toEqual([]);
    });

    it('should preserve auth_user_id in player hands', () => {
      const players = [
        createPlayer({ seat_number: 1, auth_user_id: 'user-123' }),
        createPlayer({ seat_number: 2, auth_user_id: 'user-456' })
      ];

      const result = dealHand(standardRoom, players);

      const hand1 = result.playerHands.find(h => h.seat_number === 1);
      const hand2 = result.playerHands.find(h => h.seat_number === 2);

      expect(hand1?.auth_user_id).toBe('user-123');
      expect(hand2?.auth_user_id).toBe('user-456');
    });

    it('should deal unique cards (no duplicates)', () => {
      const result = dealHand(standardRoom, threePlayers);

      const allCards = [
        ...result.fullBoard1,
        ...result.fullBoard2,
        ...result.playerHands.flatMap(h => h.cards)
      ];

      const uniqueCards = new Set(allCards);
      expect(uniqueCards.size).toBe(allCards.length);
    });

    it('should deal valid card strings', () => {
      const result = dealHand(standardRoom, threePlayers);

      const allCards = [
        ...result.fullBoard1,
        ...result.fullBoard2,
        ...result.playerHands.flatMap(h => h.cards)
      ];

      allCards.forEach(card => {
        expect(typeof card).toBe('string');
        expect(card).toHaveLength(2);
        // Valid ranks: 2-9, T, J, Q, K, A
        // Valid suits: c, d, h, s
        expect(card).toMatch(/^[2-9TJQKA][cdhs]$/);
      });
    });
  });
});
