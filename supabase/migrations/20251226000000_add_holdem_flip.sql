-- Add holdem_flip game mode
ALTER TYPE game_mode ADD VALUE IF NOT EXISTS 'holdem_flip';

-- Add flip_card action type
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'flip_card';
