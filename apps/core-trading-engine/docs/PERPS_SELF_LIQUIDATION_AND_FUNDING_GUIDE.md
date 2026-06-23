# Complete Flow: Self-Liquidation and Funding Rate for Perpetual Orders

This document provides a comprehensive explanation of how self-liquidation and funding rates work in your trading platform, with detailed examples showing the complete flow from position creation through liquidation and funding settlement.

---

## Table of Contents

1. [Overview](#overview)
2. [Position Creation and Margin Calculation](#position-creation-and-margin-calculation)
3. [Index Price Flow and Liquidation Trigger](#index-price-flow-and-liquidation-trigger)
4. [Self-Liquidation Mechanism](#self-liquidation-mechanism)
5. [Funding Rate Calculation](#funding-rate-calculation)
6. [Funding Payment Distribution](#funding-payment-distribution)
7. [Complete End-to-End Example](#complete-end-to-end-example)
8. [Edge Cases and Special Scenarios](#edge-cases-and-special-scenarios)

---

## Overview

Your platform implements a sophisticated perpetual futures system with two core risk management mechanisms:

### **Self-Liquidation**
- Automatic closing of positions when they reach critical loss thresholds
- Protects the platform and other users from uncovered losses
- Triggered when a position reaches its **liquidation price**

### **Funding Rate**
- Periodic payments between traders holding opposite positions
- Keeps mark price aligned with index price
- Applied every hour (configurable interval)
- Paid from trader margin, deducted from user collateral balance

---

## Position Creation and Margin Calculation

### How Margin is Allocated

When a user opens a perpetual position, isolated margin is calculated and locked:

```
Formula: Margin = ceil(Notional / Leverage)

Where:
  Notional = ceil(Quantity × Price / 10^basePrecision)
  Quantity: Amount of base asset (e.g., BTC)
  Price: Entry price
  Leverage: 1x to 50x (platform max)
  basePrecision: Decimal places of base asset (e.g., 2 for BTC)
```

### Example 1: Opening a Long Position

**Market Configuration:**
- BTC_PERP (BTC in USD)
- Base Asset Precision: 2
- Quote Asset Precision: 2

**Trade Details:**
```
User Action: Buy (LONG) 2 BTC at $50,000 with 5x leverage

Calculations:
Quantity = 2.00 BTC = 200n (internal representation)
Price = 50,000.00 USD = 5000000n
Leverage = 5

Notional = ceil(200 × 5000000 / 10^2)
         = ceil(1,000,000,000 / 100)
         = 10,000,000n (USD)
         = $100,000.00

Margin = ceil(10,000,000 / 5)
       = 2,000,000n (USD)
       = $20,000.00

Liquidation Move = (Margin × 0.9) / Quantity
                 = (2,000,000 × 0.9) / 200
                 = 1,800,000 / 200
                 = 9,000n (USD)
                 = $9,000.00

Liquidation Price (LONG) = Entry Price - Liquidation Move
                         = $50,000 - $9,000
                         = $41,000.00

Bankruptcy Price (LONG) = Entry Price - (Margin / Quantity)
                        = $50,000 - (2,000,000 / 200)
                        = $50,000 - $10,000
                        = $40,000.00
```

**Position After Opening:**
```typescript
{
  userId: "user123",
  positionId: "pos_abc123",
  market: "BTC_PERP",
  position: OrderPosition.LONG,
  leverage: 5,
  quantity: 200n,                    // 2.00 BTC
  averagePrice: 5000000n,            // $50,000.00
  entryPrice: 5000000n,              // $50,000.00
  margin: 2000000n,                  // $20,000.00 (locked in position)
  liquidationPrice: 4100000n,        // $41,000.00
  bankruptcyPrice: 4000000n          // $40,000.00
}

User's Quote Collateral (USD):
  total: $100,000.00
  locked: $20,000.00 (for this position's margin)
  available: $80,000.00
```

---

## Index Price Flow and Liquidation Trigger

### Where Index Price Comes From

Your platform uses the **Binance Futures Index Price** as the reference:

```
Source: wss://fstream.binance.com/ws/!markPrice@arr@1s
Flow:
  Binance WebSocket
    ↓
  ws-index-poller (apps/ws-index-poller)
    ↓
  Redis Stream (market:event)
    ↓
  Core Trading Engine
    ↓
  Market Risk State Update
```

**Index Price vs Mark Price:**
- **Index Price**: Real BTC/USD price from spot exchanges (reference)
- **Mark Price**: Your platform's futures price (what users trade at)
- **Premium**: Mark Price - Index Price

### How Liquidation Prices are Used

Your system uses **Red-Black Trees** for efficient liquidation detection:

```
1. Every position is indexed by its liquidationPrice
2. Positions grouped into buckets by liquidationPrice
3. When index price updates:
   - LONG positions: liquidate when indexPrice ≤ liquidationPrice
   - SHORT positions: liquidate when indexPrice ≥ liquidationPrice
```

### Example 2: Index Price Update Triggers Liquidation

**Continuing from Example 1:**

**Current Position State:**
```
Position: LONG 2 BTC
Entry Price: $50,000.00
Liquidation Price: $41,000.00
Margin: $20,000.00
```

**Scenario: BTC Price Drops**

**Time: T1 - Index Price Update to $45,000**
```
Index Price = $45,000 (from Binance)
Position Status: SAFE (liquidation trigger: $41,000)
Unrealized PnL = (45,000 - 50,000) × 2 = -$10,000
Margin Loss Percentage = 10,000 / 20,000 = 50%

System Action: NONE (price still above liquidation threshold)
```

**Time: T2 - Index Price Update to $40,500**
```
Index Price = $40,500 (from Binance)
Position Status: ⚠️ LIQUIDATABLE!

Why?
  Liquidation Price = $41,000.00
  Index Price = $40,500.00
  40,500 < 41,000 → LIQUIDATION TRIGGERED

System Action: 
  1. Identify position as liquidatable
  2. Create automatic liquidation order:
     - Side: SELL (opposite of LONG)
     - Type: MARKET (IOC - Immediate or Cancel)
     - Quantity: 2.00 BTC
     - ReduceOnly: true
     - Liquidation: true
     - Fee: 50 basis points (vs 2 bp for regular taker orders)
```

### How Liquidation Orders Work

When a liquidation is triggered, your system creates an automatic order:

```typescript
{
  userId: "user123",
  marketId: "BTC_PERP",
  side: OrderSide.SELL,           // Opposite of LONG
  position: OrderPosition.SHORT,  // Opposite direction
  type: OrderType.MARKET,
  quantity: "2.00",
  reduceOnly: true,               // Can only close, not open new
  liquidation: true,              // Special liquidation flag
  timeInForce: TimeInForce.IOC,   // Immediate or Cancel
  postOnly: false,
  createdAt: timestamp
}
```

---

## Self-Liquidation Mechanism

### Liquidation Price Calculation Deep Dive

```
Step 1: Calculate Bankruptcy Move
  bankruptcyMove = Margin / Quantity
  = $20,000 / 2.00 BTC
  = $10,000.00 per BTC

Step 2: Calculate Liquidation Move (90% buffer)
  liquidationMove = bankruptcyMove × 0.9
  = $10,000 × 0.9
  = $9,000.00

Step 3: Apply Direction
  For LONG positions:
    liquidationPrice = entryPrice - liquidationMove
                     = $50,000 - $9,000
                     = $41,000.00
  
  For SHORT positions:
    liquidationPrice = entryPrice + liquidationMove
                     = $50,000 + $9,000
                     = $59,000.00
```

### Why 90% Threshold (10% Buffer)?

- **100% Move = Bankruptcy**: Position margin completely exhausted
- **90% Move = Liquidation Threshold**: Triggered at 10% margin loss
- **10% Buffer**: Protects against small losses during liquidation execution
- **If liquidation fails**: Position stays indexed and retried on next price update

### What Happens During Liquidation Execution

```
1. Price drops to $40,500 → liquidationPrice $41,000 triggered
2. System creates SELL market order for 2 BTC
3. Order enters matching engine
4. If buyers available:
   - Position is reduced/closed
   - Collateral released to insurance fund or user
   - Fees deducted (50 bp liquidation fee)
   - Position removed from tracking

5. If NO buyers available (illiquid market):
   - Order fails (IOC - immediate or cancel)
   - Position remains indexed
   - Next price update can retry liquidation
   - Position becomes insurance recovery candidate
```

### Example 3: Complete Liquidation Flow

**Initial State:**
```
Position: LONG 2 BTC @ $50,000
Margin: $20,000
Liquidation Price: $41,000
```

**Price drops to $40,800 (liquidation triggered)**

```
1. LIQUIDATION DETECTION
   Index Price: $40,800
   Liquidation Price: $41,000
   Status: 40,800 < 41,000 ✓ LIQUIDATABLE

2. LIQUIDATION ORDER CREATED
   Type: SELL 2.00 BTC @ Market
   ReduceOnly: true
   Liquidation: true
   IOC (Immediate or Cancel)

3. MATCHING WITH BUYERS (Market $40,800)
   Buyer 1: Wants 1 BTC @ $40,800 ✓ MATCHED
   Buyer 2: Wants 1 BTC @ $40,800 ✓ MATCHED
   
   Complete Fill at $40,800

4. POSITION SETTLEMENT
   Entry: $50,000
   Exit: $40,800
   Quantity: 2.00 BTC
   
   Realized PnL = (50,000 - 40,800) × 2
                = 9,200 × 2
                = -$18,400.00 (loss)

5. MARGIN RELEASE & FEE DEDUCTION
   Original Margin: $20,000.00
   Liquidation Fee: ceil(2 BTC × $40,800 × 0.005)
                  = ceil($408.00)
                  = $408.00
   
   Balance Impact:
   - Release Margin: $20,000.00
   - Deduct Losses: -$18,400.00
   - Deduct Fees: -$408.00
   - Insurance Fund: +$18,400.00 (platform absorbs losses)
   
   User receives: $20,000 - $408 = $19,592
   To Insurance Fund: $408 (liquidation fee)

6. POSITION CLOSED
   Status: LIQUIDATED
   Position removed from tracking
   No longer part of funding payments
```

---

## Funding Rate Calculation

### The Funding Formula

Funding rates are calculated every hour (configurable interval) using:

```
Step 1: Calculate Premium
  Premium (bps) = (indexPrice - markPrice) × 10,000 / indexPrice
  
  Example if indexPrice = $101,000 and markPrice = $100,000:
    premium = (101,000 - 100,000) × 10,000 / 101,000
            = 1,000 × 10,000 / 101,000
            = 10,000,000 / 101,000
            ≈ 99 basis points

Step 2: Calculate Interval Rate
  intervalRate (bps) = premium (bps) × intervalSeconds / 3600
  
  For 1-hour interval:
    intervalRate = 99 × 3600 / 3600
                 = 99 basis points

Step 3: Clamp to Limits
  fundingRate = clamp(intervalRate, -1%, +1%)
              = clamp(99 bp, -100 bp, +100 bp)
              = 99 basis points = 0.99%
```

### Interpretation

```
fundingRate = +99 basis points (positive)
  ↓
  This means: LONGS PAY SHORTS
  
Why?
  indexPrice ($101,000) > markPrice ($100,000)
  → Premium is positive
  → Longs pay shorts to push mark price up toward index
  → Market mechanism to keep price aligned

fundingRate = -75 basis points (negative)
  ↓
  This means: SHORTS PAY LONGS
  
Why?
  indexPrice ($99,000) < markPrice ($100,000)
  → Premium is negative
  → Shorts pay longs to push mark price down toward index
  → Market mechanism to keep price aligned
```

### Funding Rate Direction Rules

```
IF indexPrice > markPrice:
  Premium positive → Longs pay shorts
  
IF indexPrice < markPrice:
  Premium negative → Shorts pay longs
  
IF indexPrice == markPrice:
  Premium = 0 → No funding payments
```

---

## Funding Payment Distribution

### Funding Amount Calculation

```
fundingAmount = Notional × abs(fundingRate) / 10,000

Where:
  Notional = Position size in quote currency
  fundingRate = Rate in basis points
```

### Example 4: Funding Payment Scenario

**Market State (1-hour funding settlement):**
```
indexPrice = $101,000
markPrice = $100,000
fundingRate = +99 basis points (longs pay shorts)

User Positions:
  User A: LONG 5.00 BTC @ $100,000
  User B: SHORT 5.00 BTC @ $100,000
  User C: LONG 10.00 BTC @ $100,000
```

**Calculations:**

```
User A (LONG 5 BTC):
  Notional = 5 BTC × $100,000 = $500,000
  Funding Amount = 500,000 × 99 / 10,000 = $4,950.00
  Direction: PAYS (negative)
  Payment: -$4,950.00

User B (SHORT 5 BTC):
  Notional = 5 BTC × $100,000 = $500,000
  Funding Amount = 500,000 × 99 / 10,000 = $4,950.00
  Direction: RECEIVES (positive)
  Payment: +$4,950.00

User C (LONG 10 BTC):
  Notional = 10 BTC × $100,000 = $1,000,000
  Funding Amount = 1,000,000 × 99 / 10,000 = $9,900.00
  Direction: PAYS (negative)
  Payment: -$9,900.00

Total Paid by Longs: $4,950 + $9,900 = $14,850.00
Total Received by Shorts: $4,950.00
Imbalance: $9,900.00 ← Comes from Insurance Fund
```

### Margin Changes from Funding

**User A (LONG, PAYS funding):**

Before Funding:
```
Position Margin: $20,000.00
User USD Balance: $80,000.00 available, $20,000 locked
```

Funding Settlement:
```
Funding Amount: -$4,950.00

Step 1: Deduct from Position Margin
  Available margin: $20,000
  Deduct: $4,950
  Remaining margin: $15,050.00

Step 2: Adjust User Collateral
  Locked balance: $20,000 → $15,050
  Available: $80,000 → $84,950

New Liquidation Price:
  liquidationMove = (15,050 × 0.9) / 5
                  = 2,709
  liquidationPrice = $100,000 - $2,709
                   = $97,291.00 (lower than before)
```

After Funding:
```
Position Margin: $15,050.00 (reduced)
User USD Balance: $84,950.00 available (increased)
Liquidation Price: $97,291.00 (more aggressive liquidation)
Risk: HIGHER - Position now closer to liquidation
```

**User B (SHORT, RECEIVES funding):**

Before Funding:
```
Position Margin: $20,000.00
User USD Balance: $80,000.00 available, $20,000 locked
```

Funding Settlement:
```
Funding Amount: +$4,950.00

Step 1: Add to Position Margin
  Current margin: $20,000
  Add: $4,950
  New margin: $24,950.00

Step 2: Adjust User Collateral
  Locked balance: $20,000 → $24,950
  Available: $80,000 → $75,050

New Liquidation Price:
  liquidationMove = (24,950 × 0.9) / 5
                  = 4,491
  liquidationPrice = $100,000 + $4,491
                   = $104,491.00 (higher than before)
```

After Funding:
```
Position Margin: $24,950.00 (increased)
User USD Balance: $75,050.00 available (decreased)
Liquidation Price: $104,491.00 (further from liquidation)
Risk: LOWER - Position now safer
```

### What Happens If User Margin Can't Cover Funding

```
Scenario: Long position with $3,000 margin needs to pay $4,950 funding

Step 1: Deduct Available Margin
  Margin available: $3,000
  Funding needed: $4,950
  From margin: $3,000
  Remaining owed: $1,950

Step 2: Insurance Fund Covers Deficit
  insuranceFunds[marketId] -= $1,950
  Position margin: $0.00 (margin exhausted)

Step 3: Position Becomes Liquidatable
  liquidationPrice triggers at ANY price
  Position marked for liquidation on next price update
  Insurance fund becomes counterparty for losses

Risk: Platform absorbs losses. Position will be liquidated next price update.
```

---

## Complete End-to-End Example

Let's walk through a complete scenario over time:

### Scenario: Alice's Trading Journey

**Market Setup:**
```
BTC_PERP Trading
Base Precision: 2
Quote Precision: 2
Max Leverage: 50x
Initial BTC Price: $50,000
```

### T = 0: Alice Opens Long Position

**Action:**
```
Buy 2.00 BTC at $50,000 with 5x leverage
```

**Calculations:**
```
Notional = ceil(200 × 5,000,000 / 100) = 10,000,000 (USD) = $100,000
Margin = ceil(10,000,000 / 5) = 2,000,000 (USD) = $20,000

Liquidation Move = 2,000,000 × 0.9 / 200 = 9,000 (USD) = $9,000
Liquidation Price = $50,000 - $9,000 = $41,000
Bankruptcy Price = $50,000 - $10,000 = $40,000
```

**Alice's Account State:**
```
Position:
  - Quantity: 2.00 BTC
  - Entry: $50,000
  - Margin: $20,000
  - Liquidation Price: $41,000
  - Status: OPEN

Balance (USD):
  - Total: $100,000
  - Locked: $20,000 (position margin)
  - Available: $80,000
```

### T = 1H: First Funding Settlement

**Market State:**
```
Index Price: $51,000
Mark Price: $50,500
Premium: (51,000 - 50,500) × 10,000 / 51,000 ≈ 98 bps
Funding Rate: +98 bps = +0.98% (LONGS PAY)
```

**Alice's Funding Payment:**
```
Alice is LONG → Must PAY funding

Notional = 2 × $50,500 = $101,000 (using mark price or position value)
Funding Amount = 101,000 × 98 / 10,000 = $989.80

Margin before: $20,000
Margin after: $20,000 - $989.80 = $19,010.20

Balance:
  - Available: $80,000 + $989.80 = $80,989.80
  - Locked: $19,010.20
  - Liquidation Price recalculated: $50,000 - (19,010.20 × 0.9 / 2) = $45,905.91
```

**Record:**
```
Funding Payment:
  Amount: -$989.80
  Rate: +98 bps
  Direction: Paid
  Time: T = 1H
```

### T = 1H + 1MIN: Price Drops Significantly

**Market Event:**
```
Index Price drops to $47,000
Event: INDEX_PRICE_UPDATE published
```

**System Response:**
```
Position Liquidation Check:
  Entry Price: $50,000
  Liquidation Price: $45,905.91 (after funding)
  Current Index: $47,000
  
  Status: SAFE (47,000 > 45,905.91)
  
Action: None - position still above liquidation threshold
```

**Alice's Account:**
```
Unrealized PnL = (47,000 - 50,000) × 2 = -$6,000
Margin Loss: 6,000 / 19,010.20 ≈ 31.5%

Position:
  - Entry: $50,000
  - Current: $47,000
  - Loss: -$6,000 (31.5% of margin)
  - Liquidation Price: $45,905.91
```

### T = 2H: Second Funding Settlement

**Market State:**
```
Index Price: $46,200 (still dropping)
Mark Price: $46,000
Premium: (46,200 - 46,000) × 10,000 / 46,200 ≈ 43 bps
Funding Rate: +43 bps (LONGS PAY)
```

**Alice's Second Funding Payment:**
```
Notional = 2 × $46,000 = $92,000
Funding Amount = 92,000 × 43 / 10,000 = $395.20

Current Margin: $19,010.20
After Payment: $19,010.20 - $395.20 = $18,615.00

New Liquidation Price: $50,000 - (18,615 × 0.9 / 2) = $45,916.75

Balance:
  - Available: $80,989.80 + $395.20 = $81,385.00
  - Locked: $18,615.00
```

### T = 2H + 30MIN: Liquidation Triggered!

**Market Event:**
```
Index Price drops to $45,800
EVENT_INDEX_PRICE_UPDATE published
```

**System Detection:**
```
Check Liquidatable Positions:
  Position ID: pos_alice_001
  Liquidation Price: $45,916.75
  Index Price: $45,800
  
  45,800 < 45,916.75 ✓ LIQUIDATABLE!
```

**Liquidation Order Created:**
```
{
  userId: "alice",
  marketId: "BTC_PERP",
  side: OrderSide.SELL,
  position: OrderPosition.SHORT,
  type: OrderType.MARKET,
  quantity: "2.00" BTC,
  reduceOnly: true,
  liquidation: true,
  timeInForce: TimeInForce.IOC,
  createdAt: T = 2H + 30MIN
}
```

**Order Matching:**
```
Orderbook at $45,800:
  Buy orders: 3 BTC @ $45,800 and up

Liquidation SELL 2 BTC @ Market fills immediately:
  Buyer 1: 1 BTC @ $45,800 ✓
  Buyer 2: 1 BTC @ $45,800 ✓
  
  Complete fill at average $45,800
```

**Position Settlement:**
```
Entry: $50,000
Exit: $45,800
Quantity: 2 BTC

Realized Loss = ($50,000 - $45,800) × 2 = $8,400

Fee Calculation (50 bp liquidation fee):
  Notional: 2 × $45,800 = $91,600
  Fee: ceil(91,600 × 50 / 10,000) = $458.00
```

**Final Balance Update:**
```
Before Liquidation:
  Margin: $18,615.00
  Available: $81,385.00
  Total: $100,000.00

Position Closure:
  Release Margin: $18,615.00
  Realized Loss: -$8,400.00
  Liquidation Fee: -$458.00
  
  Available to Return: $18,615.00 - $8,400.00 - $458.00 = $9,757.00

After Liquidation:
  Total Balance: $81,385.00 + $9,757.00 = $91,142.00
  Position: CLOSED
  Status: LIQUIDATED
```

**Profit/Loss Summary:**
```
Initial Deposit: $100,000.00
Funding Paid: -$989.80 - $395.20 = -$1,385.00
Liquidation Loss: -$8,400.00
Liquidation Fee: -$458.00
Transaction Fees (other): (minimal)

Final Balance: $91,142.00
Total Loss: $8,858.00 (8.86%)

Timeline:
  T=0: Entry at $50,000
  T=1H: Funding payment -$989.80
  T=1H+1M: Price drops to $47,000 (still safe)
  T=2H: Funding payment -$395.20
  T=2H+30M: Price drops to $45,800 → LIQUIDATED
```

---

## Edge Cases and Special Scenarios

### Scenario 1: Funding Payment with Insufficient Margin

```
Initial Position:
  Quantity: 5 BTC
  Entry Price: $50,000
  Margin: $5,000 (80x leverage - very risky!)

Funding Rate: +100 bps (maximum)
Funding Amount = (5 × 50,000) × 100 / 10,000 = $2,500

Available Margin: $5,000
Funding Owed: $2,500
Can Cover? YES

After Payment:
  Margin: $5,000 - $2,500 = $2,500
  
Funding Rate Next: +80 bps
Funding Amount = 250,000 × 80 / 10,000 = $2,000

Available Margin: $2,500
Funding Owed: $2,000
Can Cover? YES, BUT...

Next Funding: +75 bps
Funding Amount = 250,000 × 75 / 10,000 = $1,875

Available Margin: $500
Funding Owed: $1,875
Can Cover? NO!

What Happens:
  From Margin: $500
  Insurance Deficit: $1,875 - $500 = $1,375
  
  insuranceFunds[BTC_PERP] -= $1,375
  position.margin = $0
  
  Position becomes liquidatable immediately
  Next price update liquidates at ANY price
```

### Scenario 2: Failed Liquidation (Illiquid Market)

```
Position Trigger:
  Long 10 BTC @ $50,000
  Liquidation Price: $40,000
  Margin: $5,000

Price Update:
  Index Price: $39,500 < $40,000
  Status: LIQUIDATABLE

Liquidation Order Created:
  SELL 10 BTC @ Market (IOC)
  
Orderbook:
  Buy Orders: Only 2 BTC @ $39,500 available
  Required: 10 BTC

IOC Behavior:
  Fills 2 BTC against available liquidity
  Cancels remaining 8 BTC

Result:
  Partial Liquidation: 2 BTC closed
  Remaining: 8 BTC still open
  
  New Position State:
    Quantity: 8 BTC
    Entry: $50,000
    Available Margin: Partially released from 2 BTC closure
    
  Position stays indexed for liquidation
  Next price update will retry liquidating remaining 8 BTC
```

### Scenario 3: Position Flip (Close and Reverse)

```
Current Position: LONG 5 BTC @ $50,000

User Action:
  Sell 10 BTC @ $52,000 (wants to close long AND open short)

Execution:
  Close 5 BTC (LONG exit):
    Entry: $50,000
    Exit: $52,000
    PnL: +$10,000
    Realized PnL: +$10,000
    
  Open 5 BTC (SHORT):
    Entry: $52,000
    New Margin: (5 × 52,000) / leverage
    New Direction: SHORT
    
New Position State:
  Position: SHORT 5 BTC @ $52,000
  Entry: $52,000
  Liquidation Price: $52,000 + (margin × 0.9 / 5)
  
Margin Adjustments:
  1. Release margin from closed LONG
  2. Add realized PnL (+$10,000)
  3. Deduct new SHORT margin
  4. Return excess to user
```

### Scenario 4: Multiple Positions in Same Market

```
User's Positions in BTC_PERP:
  Position A: LONG 3 BTC @ $50,000
  Position B: LONG 2 BTC @ $51,000
  Position C: SHORT 1 BTC @ $50,500

Funding Settlement:
  fundingRate = +100 bps

Applied To:
  Position A: Pays 100 bps on (3 × 50,000)
  Position B: Pays 100 bps on (2 × 51,000)
  Position C: Receives 100 bps on (1 × 50,500)

Payments:
  A: -(3 × 50,000 × 100 / 10,000) = -$1,500.00
  B: -(2 × 51,000 × 100 / 10,000) = -$1,020.00
  C: +(1 × 50,500 × 100 / 10,000) = +$505.00
  
Net Funding: -$1,500 - $1,020 + $505 = -$2,015.00

Each position's liquidation prices recalculated based on new margin
```

### Scenario 5: Position with Unrealized PnL During Liquidation

```
Position:
  Entry: $50,000 (LONG 2 BTC)
  Current Mark: $48,000
  Unrealized PnL: -$4,000

Position gets liquidated at Market Price $47,500

Liquidation Calculation:
  Entry: $50,000
  Exit (Liquidation): $47,500
  Realized Loss: (50,000 - 47,500) × 2 = -$5,000
  
Note: Realized loss ($5,000) ≠ Unrealized loss ($4,000)
  The difference is due to different exit prices
  Unrealized was calculated at mark ($48,000)
  Liquidation executed at market price ($47,500)
  Additional loss: $5,000 - $4,000 = $1,000 per BTC × 2 = $2,000
```

---

## Key Takeaways

### Self-Liquidation
1. **Automatic Protection**: Positions liquidate at 90% of bankruptcy (10% margin loss)
2. **Market Orders**: Liquidations use MARKET IOC orders at best available prices
3. **Retry Logic**: Failed liquidations retry on next price update
4. **Insurance Buffer**: Platform absorbs losses through insurance funds

### Funding Rates
1. **Premium-Based**: Funding rates driven by mark-index premium
2. **Per-Hour Settlement**: Applied to all positions in market simultaneously
3. **Margin Impact**: Paid from position margin, affects user collateral
4. **Insurance Fallback**: If margin insufficient, insurance fund covers deficit

### Index Prices
1. **Source**: Binance Futures WebSocket (real exchange data)
2. **Frequency**: Updated every 1 second from ws-index-poller
3. **Liquidation Trigger**: Directly triggers liquidation checks
4. **Reference Point**: Used for premium calculation in funding

### Position Lifecycle
1. **Creation**: Margin allocated based on leverage and notional
2. **Liquidation Indexing**: Positions tracked by liquidation price
3. **Funding Applied**: Margins adjusted hourly based on funding rate
4. **Closure/Liquidation**: Realized PnL calculated and released to user

---

## Mathematical Quick Reference

### Margin & Notional
```
Notional = ceil(Quantity × Price / 10^basePrecision)
Margin = ceil(Notional / Leverage)
```

### Liquidation Prices
```
liquidationMove = (Margin × 0.9) / Quantity
For LONG:  liquidationPrice = entryPrice - liquidationMove
For SHORT: liquidationPrice = entryPrice + liquidationMove
```

### Funding Rate
```
premiumBps = (indexPrice - markPrice) × 10,000 / indexPrice
intervalRateBps = premiumBps × intervalSeconds / 3600
fundingRateBps = clamp(intervalRateBps, -100, +100)
fundingAmount = Notional × abs(fundingRateBps) / 10,000
```

### Fees
```
makerFee = Notional × 1 / 10,000
takerFee = Notional × 2 / 10,000
liquidationFee = Notional × 50 / 10,000
```

---

## System Components Involved

| Component | Purpose |
|-----------|---------|
| **ws-index-poller** | Fetches Binance index prices every 1s |
| **market-engine.ts** | Calculates funding rates and detects liquidation |
| **single-market-positions.ts** | Manages position indexing and liquidation |
| **core-engine.ts** | Orchestrates liquidation order creation |
| **balance-engine.ts** | Manages margin and collateral changes |
| **matching-engine.ts** | Matches liquidation orders |

---

## References to Implementation Files

Key files in your codebase:

- [core-engine.ts](apps/core-trading-engine/src/engines/core-engine.ts#L794-L821) - Liquidation execution
- [market-engine.ts](apps/core-trading-engine/src/engines/market-engine.ts#L125-L150) - Funding calculation
- [single-market-positions.ts](apps/core-trading-engine/src/engines/single-market-positions.ts#L115-L147) - Position indexing and liquidation detection
- [index-funding-liquidation-guide.md](apps/core-trading-engine/docs/index-funding-liquidation-guide.md) - Original technical guide
- [balance-locking-and-matching-guide.md](apps/core-trading-engine/docs/balance-locking-and-matching-guide.md) - Balance management details
