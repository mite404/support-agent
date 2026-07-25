# Memory & Agents

How an agent decides what it knows before it thinks, and why that is a scheduling problem rather
than a search problem.
The worked example is Monty's Stage 2, but the model is general.

## The four things people conflate

"Memory" gets used for four unrelated problems with four different trigger points.
Naming them separately is most of the work.

| Thing | What it means | Trigger to build it |
|---|---|---|
| **Turn memory** | Message history within one conversation | Immediately. Usually the framework owns it |
| **Session durability** | That history surviving a process restart | As soon as the process can restart mid-conversation |
| **Knowledge** | Policy, rules, reference material | When the agent needs facts not in its training data |
| **Long-term memory** | Facts about this person carried across sessions | When a returning user expects to be remembered |

Retrieval-Augmented Generation (RAG) is not on that list.
RAG is one possible implementation of the third row, and only when the knowledge is unstructured
text too large to put in the prompt.
Reaching for it before that point solves a problem you do not have and introduces one you did not
have either.

## Tiering is not scoring

This is the distinction the rest of the document rests on.

**Scoring** happens at request time.
Given 780 documents, rate each one's relevance and take the best few.
That is a search problem, it is probabilistic, and it runs on every turn.

**Tiering** happens at design time.
Decide in advance that this data always loads, that data loads only when a specific reference
resolves, and this other data never loads unless something explicitly asks for it.
That is a scheduling problem, it is deterministic, and it runs the same way every time.

The point of the schedule is that it keeps the working set small enough that the search is never
needed.
Tiers 1 through 3 below involve no ranking at all.

## The analogy: what you carry on set

| Tier | On set | Bounded by |
|---|---|---|
| **1. Pockets** | Phone, keys, call sheet | Small by construction. You never audit your pockets |
| **2. The cart** | Today's scene's gear, within arm's reach | The scene |
| **3. Equipment truck** | The 400mm lens, fetched when someone calls for it | Whoever called for it |
| **4. Rental house** | Across town, costs a runner and an hour | Nothing. This is where you finally have to choose |

Nobody scores whether to bring their keys.
They are in your pocket because they are always in your pocket.

Ranking only appears at the rental house, and even there the mount type has already cut the
candidates from every lens in the city down to the ones that physically fit.
Filtering comes before ranking, always.

The term comes from CPU design, where registers, L1 cache, RAM, and disk form the same shape.
The fast tier is tiny and always present, the slow tier is enormous and you work hard to avoid
touching it.

## The general model

**Tier 1 - Identity, always loaded.**
Who this person is and the small bounded sets that define their world.
Bounded by the business rather than by a limit you impose, which is what makes it safe to load
unconditionally.

**Tier 2 - Thread, always loaded.**
Recent turns, plus any workflow this message continues.
This is what makes pronouns and references resolvable.

**Tier 3 - On resolve, loaded by reference.**
Nothing here loads speculatively.
Resolving a reference is what pulls the corresponding record, and the record should be a maintained
rollup rather than a computed join.

**Tier 4 - Archive, loaded on demand.**
The only unstructured tier and the only one where ranking exists.
Entered when a resolved reference needs source text that the Tier 3 rollup could not answer.

Three of the four tiers are queries.
That ratio is the useful part.

---

## Worked example: Monty's Stage 2

The original said "we load the memory that this turn needs deterministically" without saying how
"needs" was decided.
That word was carrying the entire mechanism.
Below is the same stage with the mechanism written down.

> ### 2. Memory Load
>
> The gateway says who and where.
> This stage says what the agent knows before it thinks.
>
> Memory loads in tiers.
> A tier is not a relevance score, it is a rule about when data enters the turn, decided at design
> time rather than per request.
> Nothing here ranks or judges; every tier is a bounded query, so the same turn state rebuilds
> identically offline.
>
> **Tier 1 - Identity, always loaded.**
> The person's profile, pinned facts, aliases, contacts, and active projects.
> This is bounded by the business, not by a limit we impose: a contractor has a handful of open
> jobs and a few dozen contacts.
> It fits, it is cheap, and it is what makes "send it to her" resolvable at all.
>
> **Tier 2 - Thread, always loaded.**
> The recent turns of this thread, plus the workflow this message continues if the gateway marked
> it as one.
> This is what makes "that bid" mean something.
>
> **Tier 3 - On resolve, loaded by reference.**
> Nothing in this tier loads speculatively.
> When Stage 3 resolves "Duluth" to project #88, that resolution pulls project #88's summary
> record - a maintained rollup carrying balance, open jobs, last contact, and outstanding disputes.
> One row, updated on write rather than computed at read.
> Most turns are fully answered by a Tier 3 rollup and never touch Tier 4.
>
> **Tier 4 - Archive, loaded on demand.**
> Email and SMS bodies, document text.
> The only unstructured tier, and the only one where ranking exists.
> It is entered when a resolved reference demands source text that the Tier 3 rollup could not
> answer - "what did they say about the gate code," not "what's the balance."
>
> Retrieval inside Tier 4 is filter-first.
> Permission and entity scope are applied as query constraints, never as a post-filter on search
> results, so a person can never rank against a document they cannot read.
> Semantic similarity orders the already-eligible set; it never decides eligibility.
> Each returned item keeps its real identifier, so a reference sourced from Tier 4 carries the same
> kind of provenance as one sourced from Tier 1 - `invoice #4471`, not `chunk scored 0.82`.
>
> **The escalation is the point.**
> Tiers 1 through 3 are deterministic queries, and they resolve the large majority of turns.
> Tier 4 is the exception path, gated behind a specific unanswered reference.
> That ordering is deliberate: retrieval always returns something, even when nothing relevant
> exists, so the design keeps it out of the path where a miss would become a confident wrong answer.

---

## When retrieval earns its place

Retrieval is a funnel, not a search.

```
1. PERMISSION + SCOPE   (structured, deterministic)
   WHERE person can access AND customer_id = 22 AND job_id = 88
   -> 780 documents eligible

2. ROLLUP               (derived record, zero retrieval)
   customer_summary: balance, open jobs, last contact, disputes
   -> answers most turns right here. Stop.

3. SEMANTIC RANK        (only if 2 was insufficient AND the set is unstructured text)
   rank those 780 by similarity to "what did they say about the gate code"
   -> top 8 email bodies, each still carrying its real ID
```

Three properties make this defensible where a naive vector search is not.

**Permission runs before retrieval, never after.**
If you search the whole corpus and filter results by permission afterward, recall silently degrades
based on who is asking, and you are one bug away from a cross-tenant leak.
Retrieval belongs inside the permission boundary, as a query constraint.

**The rollup is the step everybody skips.**
A maintained summary record, updated on write rather than computed at query time, answers most
turns with one row.
It is deterministic, cheap, and carries real provenance.
Reaching past it for embeddings solves a hard problem to avoid an easy one.

**Semantic ranking only orders an already-eligible set.**
It never determines eligibility.
That keeps the fuzzy component from being load-bearing for correctness; it affects ordering within a
set that structured logic already proved correct.

## Why not a per-turn judge

An obvious-looking alternative is to score each candidate with a model at request time.
It fails on three counts for a latency-sensitive product.

**Cost and latency.**
Scoring 780 documents is 780 model calls per message, including for the many messages that need
zero documents.

**Determinism.**
A model-based scorer in the load path means the same fixture can grade differently on two runs, so
the offline corpus stops being reproducible.

**Redundancy.**
If the tiers are doing their job, the candidate set is already small enough that ranking it adds
little.
A judge is most attractive precisely when the tiering is weak.

LLM-as-judge is a good offline evaluation tool.
It is a poor request-time filter.

## The thing to remember

Retrieval has no honest miss.

When the relevant document does not exist, a vector search returns the top few nearest neighbours
anyway.
There is no null, no `found: false`, no signal to the model that the result set is noise.
For any product whose contract is that a confident wrong answer is worse than a clarification, that
property alone decides where retrieval may and may not sit.

## Further reading

Pointers rather than summaries; each is worth reading directly.

- **Mem0**, **SuperMemory** - memory layers for agents, useful for seeing how others frame the
  extract, store, and recall loop.
- **Plastic Labs** (Honcho) - user modelling and theory-of-mind framing for agent memory.
- **AgentFS** - filesystem-shaped abstractions for agent state.
- **Multiple Instance Learning** - classic ML on bags of instances carrying only a bag-level label.
  The relevant question it formalises: given this bag of documents, which instance actually drove
  the answer, when no per-document ground truth exists.
