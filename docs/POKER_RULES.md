# Poker Betting Rules - PLO Double Board Bomb Pot

## Game Format

**Pot-Limit Omaha (PLO) Double Board Bomb Pot**

- 4 hole cards per player (must use exactly 2 in hand)
- Community cards dealt to TWO separate boards
- Pot is split between best hand on Board 1 and best hand on Board 2
- Bomb pot format: all players ante before cards are dealt, no pre-flop betting round

## Bomb Pot Mechanics

1. All seated players post the bomb pot ante (configured per room, e.g., 10 chips)
2. Players who cannot afford the ante are excluded from the hand
3. 4 hole cards dealt to each player who posted ante
4. Flop dealt immediately to both boards (3 cards each)
5. Betting begins on the flop with no pre-flop action

## Pot-Limit Betting Rules

### Valid Actions

At any point in a betting round, a player may:

- **Fold**: Forfeit hand and any claim to the pot
- **Check**: Pass action to next player (only valid when facing no bet)
- **Call**: Match the current bet amount
- **Raise**: Increase the bet amount (subject to pot-limit constraints)

### Pot-Limit Raise Sizing

In Pot-Limit Omaha, the **maximum raise** is limited by the pot size:

**Formula:**

```
Max Raise = Current Pot + Current Bet + Amount to Call

Example:
- Pot is 100 chips
- Player A bets 20 chips
- Player B wants to raise

Max Raise Calculation:
- Current pot: 100
- Player A's bet: 20
- Amount to call: 20
- Max raise = 100 + 20 + 20 = 140 chips total (120 raise on top of 20 call)
```

**Minimum Raise:**

- Must be at least the size of the previous bet or raise
- If first bet of the round, minimum is 1 chip (or big blind equivalent)

### Betting Round Structure

1. **Flop** (3 cards dealt to each board)
   - Action starts left of button
   - Betting round completes when all players have acted and either folded or matched the highest bet

2. **Turn** (1 card dealt to each board)
   - Action starts left of button
   - New betting round

3. **River** (1 card dealt to each board)
   - Action starts left of button
   - Final betting round

4. **Showdown**
   - Players reveal hole cards
   - Best hand on Board 1 wins half the pot
   - Best hand on Board 2 wins half the pot
   - Same player can win both halves

## Action Order

### Position Mechanics

- **Button** rotates clockwise after each hand
- **First to act**: Player to the left of the button
- **Last to act**: Player on the button (has position advantage)

### Within a Betting Round

1. Action starts with first active player left of button
2. Proceeds clockwise around table
3. Round ends when one of:
   - All but one player have folded (remaining player wins)
   - All active players have either checked or called the current bet

### Important Rules

- A player who checks can later call or raise if facing a bet
- A player cannot check if facing a bet (must call, raise, or fold)
- A player who calls cannot re-raise unless another player raises first
- A player who raises can be re-raised by subsequent players

## All-In Scenarios

### When a Player Goes All-In

- Player bets all remaining chips
- If all-in amount is less than minimum raise, it does not reopen betting
- If all-in amount meets or exceeds minimum raise, it reopens betting

### Side Pots

When a player is all-in for less than the current bet:

1. **Main Pot**: Amount all players contributed equally
   - All-in player(s) eligible to win

2. **Side Pot(s)**: Additional betting between players with chips remaining
   - Only players who contributed to side pot can win it

**Example:**

```
Pot: 100 chips
Player A (200 chips): Bets 50
Player B (30 chips): All-in for 30
Player C (200 chips): Calls 50

Main Pot: 100 + (30 × 3) = 190 chips (A, B, C eligible)
Side Pot: (50 - 30) × 2 = 40 chips (A, C eligible)
```

## Pot Calculation

### Current Pot Size

At any point:

```
Current Pot = Starting Pot + All Bets This Round + All Bets Previous Rounds
```

### After Betting Round Completes

All bets are swept into the pot before next street is dealt.

## Edge Cases

### Heads-Up (2 Players Remaining)

- Button acts first pre-flop (not applicable in bomb pot)
- Button acts first post-flop, turn, river
- Standard pot-limit rules apply

### Single Active Player

- If all other players fold, remaining player wins pot immediately
- No showdown required
- Player does not need to show cards

### Incomplete Raise Rule

If a player goes all-in for less than a full raise:

- Players who already acted cannot re-raise
- Betting is not reopened
- Exception: If all-in equals or exceeds the minimum raise amount, betting reopens

## Turn Timer

- Each player has a time limit to act (configurable, e.g., 30 seconds)
- If timer expires: player automatically folds
- Exception: If facing no bet, player checks instead

## Showdown Rules

### Who Shows First

1. Last aggressor (last to bet or raise) shows first
2. If no betting on river, first player left of button shows first
3. Subsequent players can muck if they know they're beaten

### Hand Evaluation

- Must use exactly 2 hole cards + 3 board cards
- Evaluated separately for Board 1 and Board 2
- Standard poker hand rankings (Royal Flush > Straight Flush > Quads > Full House > Flush > Straight > Trips > Two Pair > Pair > High Card)

### Pot Distribution

- 50% of total pot to best hand on Board 1
- 50% of total pot to best hand on Board 2
- Ties split the respective half pot equally
- Player can scoop (win both boards)

## Minimum/Maximum Bets

### Minimum Bet

- First bet of any round: 1 chip (or small blind equivalent)
- Raise: Must be at least the size of previous bet/raise

### Maximum Bet

- Cannot exceed pot-limit calculation
- Cannot bet more chips than you have (all-in)

## Summary of Key Differences from No-Limit

| Rule       | No-Limit Hold'em       | Pot-Limit Omaha             |
| ---------- | ---------------------- | --------------------------- |
| Max Bet    | Any amount (all chips) | Limited to pot size         |
| Hole Cards | 2 cards, use 0-2       | 4 cards, must use exactly 2 |
| Boards     | 1 community board      | 2 separate boards           |
| Pre-flop   | Blinds + betting       | Bomb pot (ante only)        |

## Implementation Notes

### Tracking Current Bet

- Each player has a `current_bet` tracker for the active round
- When round ends, bets are added to pot and trackers reset to 0
- Player can only raise if `their_total_bet < current_highest_bet`

### Action Validation

Before accepting an action:

1. Verify it's the player's turn
2. Check action is valid (can't check if facing a bet)
3. Validate raise amount meets minimum and doesn't exceed pot limit
4. Verify player has sufficient chips

### Completing a Betting Round

Round ends when:

- `active_players.every(p => p.current_bet === highest_bet || p.has_folded || p.is_all_in)`
- AND all players have had at least one opportunity to act
- AND at least one player has bet OR all players have checked
