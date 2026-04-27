# Trading Discipline System

Next.js App Router application for binary trading with strict discipline rules, capital management, and trade history analytics.

## 🚀 Quick Start

```bash
cd /Users/apple/Documents/Development/trades/trading-discipline-system
npm install
npm run dev
```

Open **http://localhost:3000** (or the port shown in terminal)

## ✨ Features

### Smart Capital Management

**Initial Setup**
- Enter total capital and deposit amount (max 20% of total)
- Configure win profit percentage (70% or 80%)
- One-time setup per deposit cycle

**Auto-Reload When Depleted**
- System automatically shows setup page when deposited capital reaches $0
- Add new deposit to continue trading
- Previous deposits cannot be edited (anti-cheat protection)

### Trading Rules (Strictly Enforced)

- ✅ **Trade Amount**: 10% of deposited capital per trade
- ✅ **Bonus After 2 Wins**: Can increase up to 20% of deposited capital
- ✅ **Session Lock**: 2 consecutive losses = locked for the day
- ✅ **Daily Limit**: Max 10 trades per day
- ✅ **Win Profit**: 70% or 80% (configurable at setup)
- ✅ **Loss**: -100% of trade amount
- ✅ **30-Day Challenge**: Complete disciplined trading over 30 days

### Trade History & Analytics

**📊 History Page** (`/history`)
- **Last 7 Days**: Recent performance overview
- **This Month**: 30-day breakdown
- **All Time**: Complete trading history

**Analytics Dashboard**
- Total trades count
- Win/loss breakdown
- Win rate percentage
- Total P&L with color coding
- Daily breakdown with per-day stats

### UI Design

- 🎨 Clean light mode theme (white/gray palette)
- 📱 Mobile-first responsive design
- 🎯 Visual win/loss indicators (green/red)
- ⚡ Real-time P&L updates
- 📈 Profit target chart (200/300/500)
- 🔒 Session lock screen when market out

## 📄 Pages

### Main Page (`/`)
- Auto-routes to **Setup** if no capital or funds depleted
- Auto-routes to **Trading** if capital configured
- Shows current session status
- Displays today's trades list
- Real-time P&L tracking

### History Page (`/history`)
- Filter trades by period (7 days / month / all)
- Statistics cards (trades, wins, losses, win rate)
- Detailed trade list with timestamps
- Daily breakdown summary

## 🔄 How It Works

1. **First Launch**
   - Enter total capital (e.g., $10,000)
   - Enter deposit amount (max 20%, e.g., $2,000)
   - Choose win profit (70% or 80%)

2. **Trading**
   - Enter trade amount (≤ 10% of deposited, e.g., $200)
   - Click **WIN** or **LOSS**
   - System updates P&L, consecutive wins/losses
   - After 2 consecutive wins: can trade up to 20% ($400)

3. **Funds Depleted**
   - When deposited capital reaches $0
   - Setup page appears automatically
   - Add new deposit to continue (max 20% of total)

4. **View Performance**
   - Click **📊 History** link
   - Filter by period
   - Review win rate, P&L, daily stats

## 🛡️ Anti-Cheat Features

- **Fingerprint Tracking**: Detects localStorage clearing
- **Date Validation**: Prevents system clock manipulation
- **Immutable Capital**: No mid-session editing allowed
- **Automatic Locking**: Enforces 2-loss and 10-trade limits

## 💾 Data Persistence

### LocalStorage (Primary)
- All state saved locally with anti-cheat validation
- Survives page refreshes
- Day rollover handled automatically

### Supabase (Optional Cloud Sync)

**Setup Steps:**

1. Create project at https://supabase.com

2. Run schema from `supabase-schema.sql` in SQL Editor

3. Configure `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

4. Restart dev server

**Sync Status** (shown in header):
- Gray dot = Not configured (localStorage only)
- Yellow pulsing = Syncing...
- Green = Synced successfully
- Red = Sync error

## 📊 Profit Chart

Inline SVG chart showing:
- Cumulative P&L over time
- Target lines at $200, $300, $500
- Visual progress tracking

## 🛠️ Tech Stack

- **Framework**: Next.js 13.5.6 (App Router)
- **UI**: React 18.2.0, Tailwind CSS 3.3.0
- **Database**: Supabase (PostgreSQL with REST API)
- **State**: localStorage + optional cloud sync
- **Styling**: Custom utility classes, responsive design

## 📝 Project Structure

```
app/
  ├── page.js           # Main page (setup + trading)
  ├── history/
  │   └── page.js       # Trade history & analytics
  ├── layout.js         # Root layout (light mode)
  └── globals.css       # Tailwind + custom styles
lib/
  ├── localStorage.js   # State management functions
  └── supabase.js       # Supabase client
supabase-schema.sql     # Database table schema
```

## 🎯 Key Functions (lib/localStorage.js)

- `initOrValidate()` - Initialize/validate state, handle day rollover
- `addTrade(result, amount)` - Record trade, update P&L, check locks
- `setCapital(total, deposit)` - Configure capital (initial or add deposit)
- `setWinProfitPercent(pct)` - Set win profit (0.7 or 0.8)
- `syncToSupabase()` - Upload state to cloud

## 🚦 Trading States

- **ACTIVE**: Trading allowed
- **LOCKED**: Session ended (2 losses OR 10 trades)
- **COMPLETED**: 30-day challenge finished

## 📱 Responsive Design

- Mobile: Single column, full-width cards
- Tablet: 2-column stats grids
- Desktop: Optimized max-width containers

## 🔐 Security

- Row Level Security (RLS) enabled on Supabase
- Environment variables for API keys
- `.gitignore` protects `.env.local`
- No server-side code (client-only for now)

---

**Built for disciplined binary traders who need strict rule enforcement and detailed analytics.**
# trades
