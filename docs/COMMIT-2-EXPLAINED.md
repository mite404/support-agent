# Commit 2, Explained Simply

Plain-language walkthrough of the "seed source of truth + index-scoped order lookup" change.
No jargon. For the full technical version see `IMPLEMENTATION_PLAN.md`, Commit 2.

## The setup

This project is a customer-support chatbot. A customer types "where is order #1234?" and the bot
looks it up in a database and answers.

Think of the database as **a film vault** full of reel cans. Every can has a label.

## Scene 1: The bug that hadn't happened yet

The old code looked up an order like this:

> "Go find the can labeled **#1234**."

Sounds fine. But order numbers aren't unique across the whole world. Two different customers can
both have an order #1234, the same way two different productions can both have a "Reel 3."

So when the clerk went looking for #1234, sometimes **two cans came back**.

The clerk had been given a strict rule: *"There will be exactly one. If you ever find two, stop
everything and throw an error."* That's a real function in the code called `.unique()`.

Here's the sneaky part. The old code *did* have a security check - after finding the can, it asked
"does this actually belong to the customer who requested it?" But look at the order of operations:

```
1. Find can #1234        <- clerk finds TWO, panics, crashes here
2. Check who owns it     <- never runs
```

The security check was standing **inside the room** instead of **at the door**. The crash happened
first, so the check never got a turn. The app would break with a confusing error instead of politely
saying "no such order."

## Scene 2: The fix

Instead of asking for the can by number alone, we now ask:

> "Go find the can labeled **#1234 that belongs to customer Maya**."

Two labels together. Now it's impossible for two cans to match, because Maya only has one order
#1234.

```
BEFORE:  search by [order number]        -> maybe 2 results -> crash
AFTER:   search by [customer + number]   -> always 1 or 0   -> fine
```

Two files changed for this:

- `packages/backend/convex/schema.ts` - the vault's filing system. The shelf labels changed from
  "sorted by order number" to "sorted by customer, then order number."
- `packages/backend/convex/orders.ts` - the clerk's instructions. Now asks using both labels.

The nice part: the security check got *deleted*. Not because we gave up on security, but because
scoping is now built into **how we search** rather than something we verify afterward. The bug can't
happen anymore instead of being caught after it happens.

## Scene 3: Fake data for the demo

You can't demo a support bot with an empty database. Two new files:

- `packages/backend/convex/seedData.ts` - just a *list*. Four pretend orders: #1234 (shipped),
  #2345 (packed), #3456 (delivered), #4567 (cancelled). It doesn't *do* anything. It's the script.
- `packages/backend/convex/seed.ts` - the command that plants that list into the database. It's the
  crew that follows the script.

Why two files instead of one? The same list gets used in two places - the real demo *and* the
automated tests. One list means the demo and the tests can never disagree about what the data is.

**One clever bit:** running the plant-the-data command twice doesn't create duplicates. It finds the
existing order and updates it. This matters a lot, because duplicates are exactly what causes the
crash from Scene 1. A command meant to *refresh* the demo would otherwise have *broken* it.

## Scene 4: The safety net

Two test files. Tests are little robots that automatically try to break your code every time you
change something.

The important one creates **two customers who both have an order #1234**, then checks that each one
sees their own. That's the exact situation that used to crash.

**And the test was itself tested.** Like holding a match under a smoke detector to confirm it beeps.
The old broken code went back in temporarily, and the tests ran:

- The new test: **failed**, with exactly the crash we predicted
- The three older tests: **passed**, happily

That second line is the real lesson. The old tests were green while the code was broken, because
they only ever created *one* customer, so they never triggered the collision. A test that passes on
broken code is worse than no test, because it makes you *feel* safe. Then the good code went back.

## Scene 5: Odds and ends

- `.oxlintrc.json` - the automatic style checker complained about a variable named `_id` (it has a
  rule against names starting with underscores). That name isn't our choice; the database itself
  names it that. So the checker was told "underscore is fine for these two specific database names,
  keep complaining about everything else."
- `README.md` and `flue-support-agent-plan.md` - written instructions for loading the demo data
  later, and the corrected index name.

## The one-sentence version

We stopped looking up orders by a number that isn't actually unique, added fake demo data that's
safe to load twice, and wrote a test that proves the old bug can't come back - then deliberately
broke the code to make sure that test actually catches it.
