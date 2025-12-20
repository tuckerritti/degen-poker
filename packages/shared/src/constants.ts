/**
 * Duration to wait after hand completion before cleaning up game state.
 * This gives players time to review results and chat.
 *
 * The engine sets `hand_completed_at` timestamp when a hand completes,
 * then a background cleanup scheduler deletes the game_state after this delay.
 * The frontend uses this constant to show a countdown timer.
 */
export const HAND_COMPLETE_DELAY_MS = 5000;
