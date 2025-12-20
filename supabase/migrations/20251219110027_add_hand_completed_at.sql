-- Add hand_completed_at column to game_states table
-- This timestamp is set when a hand completes and triggers the 5-second countdown timer on the frontend

alter table game_states add column hand_completed_at timestamptz;
