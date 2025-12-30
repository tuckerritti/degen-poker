import { describe, it, expect } from "vitest";
import { dealHand } from "../../src/logic.js";
import { standardRoom, room321Mode, roomHoldem } from "../fixtures/rooms.js";
import {
  createPlayer,
  threePlayers,
  sixPlayers,
  sevenPlayers,
  ninePlayers,
} from "../fixtures/players.js";

describe("Deal Hand", () => {
  describe("dealHand", () => {
    it("should deal 4 cards to each active player", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.playerHands).toHaveLength(3);
      result.playerHands.forEach((hand) => {
        expect(hand.cards).toHaveLength(4);
        expect(typeof hand.seat_number).toBe("number");
      });
    });

    it("should deal 5 cards to each board", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.fullBoard1).toHaveLength(5);
      expect(result.fullBoard2).toHaveLength(5);
    });

    it("should only show 3 cards in initial board state (flop)", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.board_state?.board1).toHaveLength(3);
      expect(result.gameState.board_state?.board2).toHaveLength(3);
    });

    it("should generate a deck seed", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.deckSeed).toBeTruthy();
      expect(typeof result.deckSeed).toBe("string");
      expect(result.deckSeed.length).toBeGreaterThan(0);
    });

    it("should hide deck seed in game state", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.deck_seed).toBe("hidden");
    });

    it("should collect antes from all players", () => {
      const result = dealHand(standardRoom, threePlayers);

      // standardRoom has 5 ante, 3 players = 15 total
      expect(result.gameState.pot_size).toBe(15);

      result.updatedPlayers.forEach((player) => {
        expect(player.total_invested_this_hand).toBe(5);
        expect(player.current_bet).toBe(5);
        expect(player.chip_stack).toBe(495); // 500 - 5
      });
    });

    it("should set current bet to ante amount", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.current_bet).toBe(5);
    });

    it("should set button to first seat when button is null", () => {
      const result = dealHand(standardRoom, threePlayers);

      // threePlayers has seats 1, 3, 5
      expect(result.gameState.button_seat).toBe(1);
    });

    it("should rotate button from previous hand", () => {
      const roomWithButton = { ...standardRoom, button_seat: 1 };
      const result = dealHand(roomWithButton, threePlayers);

      // Button should rotate from 1 to 3 (next seat)
      expect(result.gameState.button_seat).toBe(3);
    });

    it("should set phase to flop", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.phase).toBe("flop");
    });

    it("should set correct action order (after button)", () => {
      const result = dealHand(standardRoom, threePlayers);

      // With button at seat 1, order should be [3, 5, 1]
      // seats_to_act excludes all-in players
      expect(result.gameState.seats_to_act).toEqual([3, 5, 1]);
    });

    it("should set first actor correctly", () => {
      const result = dealHand(standardRoom, threePlayers);

      // First to act is seat after button
      expect(result.gameState.current_actor_seat).toBe(3);
    });

    it("should handle more players", () => {
      const result = dealHand(standardRoom, sixPlayers);

      expect(result.playerHands).toHaveLength(6);
      expect(result.gameState.pot_size).toBe(30); // 5 * 6
      expect(result.updatedPlayers).toHaveLength(6);
    });

    it("should exclude spectators from deal", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_spectating: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const result = dealHand(standardRoom, players);

      expect(result.playerHands).toHaveLength(2);
      expect(result.gameState.pot_size).toBe(10); // 5 * 2
      expect(
        result.playerHands.find((h) => h.seat_number === 2),
      ).toBeUndefined();
    });

    it("should exclude sitting out players from deal", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, is_sitting_out: true }),
        createPlayer({ seat_number: 3 }),
      ];

      const result = dealHand(standardRoom, players);

      expect(result.playerHands).toHaveLength(2);
      expect(result.gameState.pot_size).toBe(10);
      expect(
        result.playerHands.find((h) => h.seat_number === 2),
      ).toBeUndefined();
    });

    it("should exclude players with zero chips", () => {
      const players = [
        createPlayer({ seat_number: 1 }),
        createPlayer({ seat_number: 2, chip_stack: 0 }),
        createPlayer({ seat_number: 3 }),
      ];

      const result = dealHand(standardRoom, players);

      expect(result.playerHands).toHaveLength(2);
      expect(result.gameState.pot_size).toBe(10);
      expect(
        result.playerHands.find((h) => h.seat_number === 2),
      ).toBeUndefined();
    });

    it("should mark player all-in when ante equals chip stack", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 5 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const result = dealHand(standardRoom, players);

      const player1 = result.updatedPlayers.find((p) => p.seat_number === 1);
      expect(player1?.is_all_in).toBe(true);
      expect(player1?.chip_stack).toBe(0);
      expect(player1?.total_invested_this_hand).toBe(5);
    });

    it("should handle player with chips less than ante (short stack)", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 3 }),
        createPlayer({ seat_number: 2, chip_stack: 500 }),
      ];

      const result = dealHand(standardRoom, players);

      const player1 = result.updatedPlayers.find((p) => p.seat_number === 1);
      expect(player1?.is_all_in).toBe(true);
      expect(player1?.chip_stack).toBe(0);
      expect(player1?.total_invested_this_hand).toBe(3); // Can only invest what they have

      // Pot should reflect actual contributions (3 + 5 = 8), not ante * player count
      expect(result.gameState.pot_size).toBe(8);
    });

    it("should exclude all-in players from seats to act", () => {
      const players = [
        createPlayer({ seat_number: 1, chip_stack: 5 }),
        createPlayer({ seat_number: 2 }),
        createPlayer({ seat_number: 3 }),
      ];

      const result = dealHand(standardRoom, players);

      // Seat 1 is all-in, so should not be in seats_to_act
      expect(result.gameState.seats_to_act).not.toContain(1);
      expect(result.gameState.seats_to_act).toContain(2);
      expect(result.gameState.seats_to_act).toContain(3);
    });

    it("should increment hand number", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.hand_number).toBe(1); // room.current_hand_number + 1
    });

    it("should set min raise to big blind (ante)", () => {
      const result = dealHand(standardRoom, threePlayers);

      // Ante drives the opening stake size in bomb pots
      expect(result.gameState.min_raise).toBe(5); // standardRoom.big_blind
    });

    it("should initialize action tracking fields", () => {
      const result = dealHand(standardRoom, threePlayers);

      expect(result.gameState.last_aggressor_seat).toBeNull();
      expect(result.gameState.last_raise_amount).toBeNull();
      expect(result.gameState.seats_acted).toEqual([]);
      expect(result.gameState.side_pots).toEqual([]);
    });

    it("should preserve auth_user_id in player hands", () => {
      const players = [
        createPlayer({ seat_number: 1, auth_user_id: "user-123" }),
        createPlayer({ seat_number: 2, auth_user_id: "user-456" }),
      ];

      const result = dealHand(standardRoom, players);

      const hand1 = result.playerHands.find((h) => h.seat_number === 1);
      const hand2 = result.playerHands.find((h) => h.seat_number === 2);

      expect(hand1?.auth_user_id).toBe("user-123");
      expect(hand2?.auth_user_id).toBe("user-456");
    });

    it("should deal unique cards (no duplicates)", () => {
      const result = dealHand(standardRoom, threePlayers);

      const allCards = [
        ...result.fullBoard1,
        ...result.fullBoard2,
        ...result.playerHands.flatMap((h) => h.cards),
      ];

      const uniqueCards = new Set(allCards);
      expect(uniqueCards.size).toBe(allCards.length);
    });

    it("should deal valid card strings", () => {
      const result = dealHand(standardRoom, threePlayers);

      const allCards = [
        ...result.fullBoard1,
        ...result.fullBoard2,
        ...result.playerHands.flatMap((h) => h.cards),
      ];

      allCards.forEach((card) => {
        expect(typeof card).toBe("string");
        expect(card).toHaveLength(2);
        // Valid ranks: 2-9, T, J, Q, K, A
        // Valid suits: c, d, h, s
        expect(card).toMatch(/^[2-9TJQKA][cdhs]$/);
      });
    });
  });

  describe("Two Deck Integration", () => {
    describe("321 mode with 7+ players", () => {
      it("should use two decks and set usesTwoDecks flag", () => {
        const result = dealHand(room321Mode, sevenPlayers);

        expect(result.usesTwoDecks).toBe(true);
        expect(result.playerHands).toHaveLength(7);

        // Verify all cards dealt (7 × 6 = 42 player cards + 15 board cards = 57)
        const totalCardsDealt =
          result.playerHands.flatMap((h) => h.cards).length +
          result.fullBoard1.length +
          result.fullBoard2.length +
          (result.fullBoard3?.length || 0);

        expect(totalCardsDealt).toBe(57);
      });

      it("should deal cards from a double deck correctly", () => {
        const result = dealHand(room321Mode, ninePlayers);

        // Collect all dealt cards
        const dealtCards = [
          ...result.fullBoard1,
          ...result.fullBoard2,
          ...(result.fullBoard3 || []),
          ...result.playerHands.flatMap((h) => h.cards),
        ];

        // With 9 players in 321 mode, we deal 69 cards total
        expect(dealtCards).toHaveLength(69);

        // Some cards will appear twice (since we're using a double deck with 2 of each card)
        // But no card should appear more than twice (since there are only 2 of each in double deck)
        const cardCounts = new Map<string, number>();
        dealtCards.forEach((card) => {
          cardCounts.set(card, (cardCounts.get(card) || 0) + 1);
        });

        cardCounts.forEach((count) => {
          expect(count).toBeLessThanOrEqual(2);
        });
      });

      it("should use two decks with 9 players (69 cards)", () => {
        const result = dealHand(room321Mode, ninePlayers);

        expect(result.usesTwoDecks).toBe(true);
        expect(result.playerHands).toHaveLength(9);

        // 9 × 6 = 54 player cards + 15 board cards = 69 total
        const totalCardsDealt =
          result.playerHands.flatMap((h) => h.cards).length +
          result.fullBoard1.length +
          result.fullBoard2.length +
          (result.fullBoard3?.length || 0);

        expect(totalCardsDealt).toBe(69);
      });
    });

    describe("321 mode with 6 players", () => {
      it("should use single deck when 51 cards needed", () => {
        const result = dealHand(room321Mode, sixPlayers);

        expect(result.usesTwoDecks).toBe(false);
        // 6 × 6 = 36 player cards + 15 board cards = 51 total (fits in 52)
      });
    });

    describe("PLO with many players", () => {
      it("should use two decks with 11+ players", () => {
        const elevenPlayers = [
          ...ninePlayers,
          createPlayer({ seat_number: 10 }),
          createPlayer({ seat_number: 11 }),
        ];

        const result = dealHand(standardRoom, elevenPlayers);

        expect(result.usesTwoDecks).toBe(true);
        expect(result.playerHands).toHaveLength(11);
        // 11 × 4 = 44 player cards + 10 board cards = 54 total (needs 2 decks)
      });

      it("should use single deck with 10 players", () => {
        const tenPlayers = [...ninePlayers, createPlayer({ seat_number: 10 })];

        const result = dealHand(standardRoom, tenPlayers);

        expect(result.usesTwoDecks).toBe(false);
        // 10 × 4 = 40 player cards + 10 board cards = 50 total (fits in 52)
      });
    });

    describe("Hold'em edge cases", () => {
      it("should use single deck with 23 players (51 cards)", () => {
        const twentyThreePlayers = Array.from({ length: 23 }, (_, i) =>
          createPlayer({ seat_number: i + 1 }),
        );

        const result = dealHand(roomHoldem, twentyThreePlayers);

        expect(result.usesTwoDecks).toBe(false);
        // 23 × 2 = 46 player cards + 5 board cards = 51 total
      });

      it("should use two decks with 24+ players (53+ cards)", () => {
        const twentyFourPlayers = Array.from({ length: 24 }, (_, i) =>
          createPlayer({ seat_number: i + 1 }),
        );

        const result = dealHand(roomHoldem, twentyFourPlayers);

        expect(result.usesTwoDecks).toBe(true);
        // 24 × 2 = 48 player cards + 5 board cards = 53 total
      });
    });

    describe("Card distribution with two decks", () => {
      it("should not deal more than 2 of any card (double deck limit)", () => {
        // Test with maximum players in 321 mode
        const result = dealHand(room321Mode, ninePlayers);

        const allDealtCards = [
          ...result.fullBoard1,
          ...result.fullBoard2,
          ...(result.fullBoard3 || []),
          ...result.playerHands.flatMap((h) => h.cards),
        ];

        // Create a frequency map
        const cardFrequency = new Map<string, number>();
        allDealtCards.forEach((card) => {
          cardFrequency.set(card, (cardFrequency.get(card) || 0) + 1);
        });

        // With double deck, there are exactly 2 of each card
        // So no card should appear more than twice in dealt cards
        cardFrequency.forEach((count) => {
          expect(count).toBeLessThanOrEqual(2);
        });

        // Verify we dealt 69 cards total
        expect(allDealtCards.length).toBe(69);
      });

      it("should deal valid cards from double deck", () => {
        const result = dealHand(room321Mode, ninePlayers);

        const allDealtCards = [
          ...result.fullBoard1,
          ...result.fullBoard2,
          ...(result.fullBoard3 || []),
          ...result.playerHands.flatMap((h) => h.cards),
        ];

        // All cards should be valid card strings
        allDealtCards.forEach((card) => {
          expect(typeof card).toBe("string");
          expect(card).toHaveLength(2);
          expect(card).toMatch(/^[2-9TJQKA][cdhs]$/);
        });
      });
    });
  });
});
