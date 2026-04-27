# Live Trading Features - Setup Instructions

## Database Migration Required

**IMPORTANT**: Before using the new features, you must run this SQL in your Supabase SQL Editor:

```sql
-- Add description column to tds_trades table
ALTER TABLE public.tds_trades 
ADD COLUMN IF NOT EXISTS description text;
```

This adds the description field to store trade notes, setups, and lessons.

## New Features Added

### 1. Trade Descriptions
- **Purpose**: Save trading setups, lessons learned, and market conditions for each trade
- **How to use**: 
  - Optional text area when recording trades (max 500 characters)
  - Appears below each trade in the trades list
  - Editable when updating trades
  - Shows in history page for review

### 2. Manual Session End
- **Purpose**: End your trading session before hitting 10 trades or 2 losses
- **How to use**:
  - "End Session Early" button appears after you have at least one trade
  - Locks the session immediately
  - Prevents revenge trading or emotional decisions
  - Session unlocks at midnight (next day)

### 3. Target Achievement System  
- **Default Target**: 50% of your deposited capital
- **Example**: If you deposit $100, target is $50 profit
- **Visual Tracking**: 
  - Target amount shown in stats (turns blue with checkmark when reached)
  - Green celebration message when target is hit
  - Option to end session and secure profits
- **Benefits**: Encourages taking profits at reasonable goals

### 4. Data Protection
- **Delete functionality DISABLED**: Since this is live trading data, trades can only be edited, not deleted
- **Why**: Prevents accidental data loss of important trading records
- **Edit capability**: You can still fix mistakes by editing trade details

## Usage Tips

1. **Add descriptions immediately**: Write your setup and reasoning right after the trade for accurate records
2. **Use target wisely**: When you hit 50% target, consider ending the session to lock in gains
3. **Manual end session**: Use this if you're tired, emotional, or market conditions change
4. **Review notes**: Check your trade descriptions in the history page to learn from patterns

## Technical Details

### Updated Functions
- `addTrade()`: Now accepts description parameter
- `updateTrade()`: Supports editing descriptions
- `endSession()`: New function to manually lock sessions

### Database Schema
```sql
tds_trades table:
  - id (bigserial)
  - username (text)
  - day (integer)
  - trade_date (date)
  - trade_time (timestamp)
  - result (text)
  - trade_amount (numeric)
  - pnl (numeric)
  - win_profit_percent (numeric)
  - description (text) -- NEW
  - created_at (timestamp)
```

### State Tracking
- `targetAmount`: Calculated as 50% of deposited capital
- `targetReached`: Boolean flag when today's P&L >= target
- Target celebration UI shows when condition is met
