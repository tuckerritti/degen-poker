import { describe, it, expect } from "vitest";
import { endOfHandPayout } from "../../src/logic.js";

describe("End of Hand Payout", () => {
  describe("endOfHandPayout", () => {
    it("should return empty array when no winners", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2, 3] }];
      const result = endOfHandPayout(sidePots, [], []);
      expect(result).toEqual([]);
    });

    it("should split pot evenly when same player wins both boards", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2, 3] }];
      const result = endOfHandPayout(sidePots, [1], [1]);

      expect(result).toEqual([{ seat: 1, amount: 100 }]);
    });

    it("should split pot between two different board winners", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2] }];
      const result = endOfHandPayout(sidePots, [1], [2]);

      expect(result).toEqual([
        { seat: 1, amount: 50 },
        { seat: 2, amount: 50 },
      ]);
    });

    it("should handle odd pot size (remainder goes to board2)", () => {
      const sidePots = [{ amount: 101, eligibleSeats: [1, 2] }];
      const result = endOfHandPayout(sidePots, [1], [2]);

      // 101 / 2 = 50 (floor), remainder = 51
      expect(result).toEqual([
        { seat: 1, amount: 50 },
        { seat: 2, amount: 51 },
      ]);
    });

    it("should split board1 half among tied winners", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2, 3] }];
      const result = endOfHandPayout(sidePots, [1, 2], [3]);

      // Half pot (50) split between seats 1 and 2 (25 each)
      // Other half (50) goes to seat 3
      expect(result).toEqual([
        { seat: 1, amount: 25 },
        { seat: 2, amount: 25 },
        { seat: 3, amount: 50 },
      ]);
    });

    it("should split board2 half among tied winners", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2, 3] }];
      const result = endOfHandPayout(sidePots, [1], [2, 3]);

      // Half pot (50) goes to seat 1
      // Other half (50) split between seats 2 and 3 (25 each)
      expect(result).toEqual([
        { seat: 1, amount: 50 },
        { seat: 2, amount: 25 },
        { seat: 3, amount: 25 },
      ]);
    });

    it("should split both boards among all tied winners", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2, 3] }];
      const result = endOfHandPayout(sidePots, [1, 2], [1, 2]);

      // Both halves (50 + 50) split between seats 1 and 2
      expect(result).toEqual([
        { seat: 1, amount: 50 },
        { seat: 2, amount: 50 },
      ]);
    });

    it("should handle remainder distribution when splitting (lower seat gets extra)", () => {
      const sidePots = [{ amount: 100, eligibleSeats: [1, 2, 3, 4] }];
      const result = endOfHandPayout(sidePots, [1, 2, 3], [4]);

      // Board1: 50 / 3 = 16 each, remainder 2 goes to seats 1 and 2
      // Board2: 50 to seat 4
      expect(result).toEqual([
        { seat: 1, amount: 17 }, // 16 + 1 (extra from remainder)
        { seat: 2, amount: 17 }, // 16 + 1 (extra from remainder)
        { seat: 3, amount: 16 },
        { seat: 4, amount: 50 },
      ]);
    });

    it("should process multiple side pots correctly", () => {
      const sidePots = [
        { amount: 150, eligibleSeats: [1, 2, 3] }, // Main pot
        { amount: 100, eligibleSeats: [2, 3] }, // Side pot
      ];
      const result = endOfHandPayout(sidePots, [1], [2]);

      // Main pot (150): 75 to seat 1, 75 to seat 2
      // Side pot (100): seat 1 not eligible, so fallback logic applies
      // - Board1 winners [1] not in eligible [2,3], use board2 winners [2]
      // - Board2 winners [2] in eligible [2,3]
      // - 50 to seat 2, 50 to seat 2 = 100 total to seat 2
      expect(result).toEqual([
        { seat: 1, amount: 75 },
        { seat: 2, amount: 175 }, // 75 from main + 100 from side
      ]);
    });

    it("should handle side pot where winner is not eligible (all-in scenario)", () => {
      const sidePots = [
        { amount: 150, eligibleSeats: [1, 2, 3] },
        { amount: 100, eligibleSeats: [2, 3] },
      ];
      const result = endOfHandPayout(sidePots, [1], [1]);

      // Main pot: seat 1 wins both boards, gets 150
      // Side pot: seat 1 not eligible, board1 winners [1] not in [2,3]
      //           fallback to board2 winners [1], still not in [2,3]
      //           fallback to eligibleSeats [2,3]
      //           Split 100 between seats 2 and 3
      expect(result).toEqual([
        { seat: 1, amount: 150 },
        { seat: 2, amount: 50 },
        { seat: 3, amount: 50 },
      ]);
    });

    it("should accumulate multiple pot winnings for same player", () => {
      const sidePots = [
        { amount: 100, eligibleSeats: [1, 2] },
        { amount: 50, eligibleSeats: [1, 2] },
      ];
      const result = endOfHandPayout(sidePots, [1], [1]);

      expect(result).toEqual([
        { seat: 1, amount: 150 }, // 100 + 50
      ]);
    });

    it("should handle three-way tie on one board", () => {
      const sidePots = [{ amount: 90, eligibleSeats: [1, 2, 3] }];
      const result = endOfHandPayout(sidePots, [1, 2, 3], [4]);

      // Board1 (45): 15 each to seats 1, 2, 3
      // Board2 (45): seat 4 not eligible in this pot, fallback to board1 winners
      // Actually, board2 winners [4] not in eligible [1,2,3], use board1 winners
      // So all 45 split among 1, 2, 3 again = 15 each
      expect(result).toEqual([
        { seat: 1, amount: 30 }, // 15 + 15
        { seat: 2, amount: 30 }, // 15 + 15
        { seat: 3, amount: 30 }, // 15 + 15
      ]);
    });

    it("should handle empty side pots array", () => {
      const result = endOfHandPayout([], [1], [2]);
      // With no pots, creates a dummy pot with amount 0
      expect(result).toEqual([]);
    });
  });
});
