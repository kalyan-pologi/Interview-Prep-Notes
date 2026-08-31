Intro:

I have around three years of experience building backend systems using Java and Spring Boot. Most of my work has been around designing and developing REST APIs and event driven microservices for a real estate platform.

The platform itself connects brokers, lenders, transaction coordinators, and buyers around real estate deals and property data, everything from tracking a transaction end to end, to real time communication between the people involved, to automatically generating property appraisals and investment analysis reports. Since a lot of this touches paid transactions and production data other teams rely on, reliability and data correctness have been a constant theme across everything I've built there.

On the appraisal side, I designed and built a dual persistence architecture in Java and Spring Boot. The platform needed two different ways of handling appraisal data, a paid, permanent history record that gets billed, and a free, reusable cache for browsing that shouldn't be recomputed or recharged on every view. These two write paths could never share a code path, so I enforced that separation at the module level using two separate Spring Boot starter libraries. I also reconciled two structurally different valuation engines into a single shared schema using a normalizer, and extracted the core valuation logic into a shared service so both flows could reuse it without changing the paid endpoint's behavior at all, which I verified with before and after comparison tests since that endpoint was billing relevant.

I also built a real time chat and notifications system from scratch on Spring Boot, the data model, the messaging domain logic, and the real time transport layer, using Java, Spring Boot, WebSocket, and Kafka, so notifications dispatched asynchronously never blocked a core action like sending a message. I owned that system end to end, including a performance investigation that brought core chat operations from 30 to 60 seconds down to under 2 to 3 seconds.

Separately, I built a caching layer over a third party real estate data API using Spring WebFlux, since a single report required around 20 outbound calls, many of them for data that gets reused across different properties. I designed it as a decorator wrapping one shared transport interface, so it covered all 20 endpoints without touching any individual call site, which cut redundant external calls down to zero for repeat property lookups.

Across all of this, I've worked heavily with Spring Data JPA, Hibernate, Kafka, Redis, and Flyway, and I've written unit and integration tests using JUnit, Mockito, and Testcontainers. I enjoy problems involving real system design tradeoffs and tracking down performance issues that aren't obvious from the surface.

-----------------------------------------
Behavioral Questions

1. Tell me about a time you solved a difficult/challenging production bug. What did you learn?

Story 1: A cache miss ends up racing to write the same row
Situation: We had a caching layer over a third party real estate API, making around 20 calls per report, fired in parallel using WebFlux. Occasionally two parallel calls hit the same cache key within milliseconds, since neighborhood data gets reused across properties, and both could pass a miss check before either had written anything.
Task: Make sure two concurrent writes to the same key wouldn't produce a duplicate row or an unhandled exception that failed the whole report.
Action: I considered a Redis distributed lock, but that adds latency to every write plus its own failure mode. I also considered a native insert-on-conflict-do-update, a single atomic round trip with no window for a second exception, but our repository went through Spring Data JPA without that dialect-specific query wired in yet. So I went with try save first: the cache key column had a unique constraint, the first request to commit inserts normally, and the second throws DataIntegrityViolationException, which Postgres enforces regardless of what either thread assumed. The gotcha was scoping that catch to its own transaction, since a failed insert and its retry sharing one transaction leaves it marked for rollback even after you catch the exception.
Result: Intermittent exceptions under concurrent load stopped completely, with no distributed locking needed. A real database constraint can do the heavy lifting for concurrency safety, as long as the retry runs in a clean transaction and the integrity exception is treated as an expected signal, not a failure.

Story 2: PDF download returning 404 even though the file existed
Situation: On the appraisal side, users would click to view a previously generated PDF report and get a 404, even though we could see the file sitting in blob storage.
Task: Find out why a URL that looked completely valid wasn't resolving, without guessing and touching the URL building code blindly.
Action: Instead of jumping straight into the code, I went into the storage console first and manually checked which storage account the blob actually lived in. It turned out the PDF was uploaded to one storage account, but the code that built the download URL was pointing at a different, similarly named storage account. Since we only ever persisted the blob filename and built the SAS URL at read time from config plus that filename, the actual bug surface was small once I confirmed the blob's real location, it was a one line configuration fix changing which account name the URL builder referenced, not any logic in the URL construction itself.
Result: PDFs started resolving correctly again. The bigger lesson was to verify the actual runtime state first, in this case the real location of the blob, before touching any code, since it's very easy to spend hours debugging URL construction logic when the real issue is a mismatched config value.

2. Tell me about a time you failed and what you learned from it.

Story 1: Missing a required field in a cache key design
Situation: While building the cache key for outbound API calls, I initially built the key using only the parameters I assumed were meaningful, like property id and endpoint type, and left out a couple of secondary parameters like a months of history limit that some endpoints also accepted.
Task: Once we noticed some cached responses looked wrong for certain requests, I had to figure out what went wrong.
Action: I traced it back to the cache key generator. Two requests that were actually asking for different data were producing the same cache key, because I hadn't included every parameter that reached the transport layer, just the ones I assumed mattered. A careless fix would have just special cased that one missing parameter, but that leaves the same class of bug waiting for the next endpoint with a parameter I hadn't thought of. Instead I rebuilt the key generator to derive the key from every normalized parameter that reached the get call programmatically, so adding a new query parameter to an endpoint automatically flows into the key without anyone remembering to update a hand picked list.
Result: The collisions stopped completely. What I took away from that is that when you're building something like a cache key, you can't decide upfront which parameters matter and which don't. You have to include everything that affects the response, otherwise you end up with silent data correctness bugs that are much harder to catch than a crash.

Story 2: Assuming automatic reconnect covered the initial connection too
Situation: While building a real time messaging feature on Spring Boot with STOMP, I initially assumed the client library's automatic reconnect logic would handle any connection failure, including the very first connection attempt.
Task: During testing, some users reported the chat panel just never connecting on a flaky network, with no retry happening at all.
Action: I realized the built in automatic reconnect only kicks in after a connection has succeeded at least once, its retry loop is registered inside the STOMP connected callback, so it literally never runs if that callback never fires. If the very first handshake fails, there was nothing retrying it. I had to add a separate backoff and jitter based retry specifically for that initial connection attempt, with jitter so a network blip affecting many clients at once didn't cause a reconnect thundering herd against the same instance.
Result: Connections became reliable even on a bad first attempt. The lesson was to not assume a library's retry behavior covers every failure mode, and to actually read through what triggers the retry versus what doesn't, instead of assuming the happy path logic applies everywhere.

3. What is your greatest strength and your biggest weakness?

Story 1 (strength): Designing systems so two related but different write paths can never collide
Situation: On the appraisal side of the platform, there were two very different ways an appraisal could get saved, one where a user pays and it goes into a permanent audit history table, and one where a property is just being browsed and gets a free, reusable cached estimate.
Task: These two paths absolutely could not share a write path, because a cache miss accidentally triggering a paid history write, or vice versa, would be a real business problem, either double charging someone or corrupting the audit trail.
Action: My strength is thinking through this kind of separation at the module level, not just the method level. A weaker version of this would be a shared service class with an if-else branching on a payment flag, which looks fine until someone adds a feature to one branch that leaks into the other. I kept the caching logic and the history logic in two completely separate Spring Boot starter modules, so it wasn't just a convention that could be broken by someone adding a few lines in the wrong service class, it required a deliberate new dependency to even attempt to cross that boundary.
Result: The two systems have coexisted without a single incident of one leaking into the other, and that separation is something new engineers on the team can see just from the module structure, without needing tribal knowledge.

Story 2 (weakness): Diving into implementation before fully mapping out edge cases
Situation: Early on, when I built a chat session feature that allowed a transaction coordinator to have one on one chats with both a lender and a buyer, I put a unique index on session type and participants assuming that was enough to prevent duplicate sessions.
Task: I hadn't fully thought through the case where the transaction coordinator was also the one creating the session.
Action: A participant count check in that logic incorrectly collapsed to a single UUID when the transaction coordinator was both a participant and the creator, since a set deduplicated the creator id against the participant id, so the count check that was supposed to require two distinct people passed with one. I had to go back, drop the index, and rework both the uniqueness logic and the participant count check together.
Result: I fixed it, but it taught me that my weakness is sometimes moving to implementation a bit too quickly on features with several actors involved, instead of writing out every actor combination first. Since then, on anything involving multiple roles or participants, I explicitly list out every combination before writing the first line of code, which has saved me from repeating that mistake.

4. Tell me about a time you had a disagreement with your manager or a technical decision.

Story 1: Choosing to migrate infrastructure instead of patching around it repeatedly
Situation: We had an intermittent issue in production with our real time messaging service, where under multi instance load, a connection would succeed and then the very next request from that same client would come back as a failure. The initial instinct on the team was to keep patching around it, for example tuning sticky session settings again.
Task: I had already traced the actual root cause, which was that the sticky session mechanism we relied on to keep a client pinned to the right instance wasn't surviving a hop through our content delivery layer.
Action: I pushed back on the idea of another sticky session tuning pass, since that only reduces the odds of hitting the wrong instance, it doesn't eliminate the mismatch, so the failure would keep resurfacing under enough load. Instead I proposed migrating the underlying transport onto a managed relay service that didn't depend on sticky sessions at all, since a relay that pubs messages across instances removes the requirement for a client to stay pinned to one node in the first place. That was a bigger, less familiar change, so it took some convincing, since it meant touching infrastructure instead of just application code.
Result: We went with the migration, and the intermittent failures disappeared completely, instead of just becoming rarer. It reinforced for me that when you've actually root caused something, it's worth advocating for the structural fix even if it's a harder sell than another quick patch.

Story 2: Disagreeing on whether to touch a shared database directly for a quick fix
Situation: While building the caching layer, the cache tables needed to live inside a database that was already shared with another application team's production tables. There was a suggestion to just run DDL manually against production to get moving faster.
Task: I felt strongly that manual DDL against a shared production database was too risky, even for a schema that was technically isolated to its own tables.
Action: I proposed using Flyway migrations scoped specifically to our schema, with its own separate migration history table, so the tooling itself enforced a boundary instead of relying on people being careful, and so every environment applies the exact same versioned scripts in the exact same order instead of drifting from whatever someone typed by hand once. I also insisted on a baseline migration that explicitly created the schema first with an if-not-exists guard, since we later did hit a bug where a genuinely fresh database failed because the schema didn't exist yet.
Result: We went with the Flyway approach, and it actually caught that fresh database bug for us in a controlled way, in a test environment, rather than surprising us in production. It confirmed my instinct that upfront discipline around migrations is worth the small extra setup time on a shared database.

5. Tell me about a time you had to quickly adjust your priorities to meet changing demands.

Story 1: A performance issue jumping ahead of planned feature work
Situation: I was in the middle of building out new chat features when UAT testing showed that basic operations like sending, deleting, or reading a message were taking 30 to 60 seconds, which made the feature essentially unusable.
Task: I had to drop the feature work I was doing and treat this as the top priority, since a broken core experience is worse than a missing nice to have feature.
Action: I switched into an investigation mode, using Hibernate's SQL logging and running EXPLAIN ANALYZE against a UAT sized dataset to find out where the time was actually going, instead of guessing. It turned out to be a combination of redundant queries across message, attachment, session, and participant lookups, not one single slow query, so no single index would have fixed it.
Result: I combined several separate database writes into single transactions, merged redundant lookups into joined queries, and moved some Kafka publishing calls off the main request thread using Async. That brought the operation time down from 30 to 60 seconds to under 2 to 3 seconds, and only after that was resolved did I go back to the feature work I had paused.

Story 2: Re-prioritizing after a payment status bug was reported
Situation: A bug came in where appraisals that had already been paid for were still showing a status of Pending in the history table, even though the payment transaction id was clearly present on the record.
Task: This directly affected what customers saw about something they had paid for, so it needed to jump ahead of whatever else was scheduled that sprint.
Action: I paused other backlog work, traced the status update logic, and found the code was unconditionally defaulting to Pending regardless of whether a payment transaction id existed, essentially a missing branch rather than a broken one. I updated that logic so it checks for the presence of a payment transaction id and sets the status to FormDataReady when that's the case, and made sure the check ran on the same row the payment write had just committed rather than a possibly stale read.
Result: The status now reflects reality correctly, and because it was a small, well understood fix once diagnosed, I was able to get back to the originally planned priorities the same day.

6. Give an example of a time you faced a conflict on a team. How did you handle it?

Story 1: Disagreeing on whether to fork the database schema for two different data shapes
Situation: We had two different valuation engines producing appraisal data in structurally different shapes, one giving dollar based adjustments, the other giving percentage based adjustments. Some teammates felt the cleanest solution was to create a second schema specifically for the percentage based engine.
Task: I disagreed, because I felt that would double the number of places to maintain query logic and reporting logic going forward, for what was really the same conceptual data.
Action: I proposed instead writing a normalizer that converts the percentage adjustments into dollar amounts at write time, multiplying each percentage by sale price, so both engines could write into one shared schema, with some columns simply staying null for the engine that didn't produce that data. I walked through the tradeoffs with the team, being clear that some columns would go unused for one engine, but that this was a smaller cost than maintaining two schemas and two sets of joins for every future report.
Result: The team agreed to go with the single schema plus normalizer approach. It's held up well since, and any new reporting or query work only has to be written once instead of twice.

Story 2: A disagreement over synchronous versus asynchronous notification publishing
Situation: When building the event driven notification pipeline on Kafka, a message send was calling the notification publish step synchronously, inline with the main request. Under load, if the broker was slow, this could add up to 30 seconds of delay to a simple send operation, but not everyone initially agreed this was worth changing.
Task: I needed to convince the team that this coupling between a core user action and a downstream, less critical system was the wrong tradeoff.
Action: I laid out the actual failure scenario clearly, showing that if Kafka itself was ever briefly unavailable or slow, the producer's send call blocking on an ack would directly block core chat sends, which is a much worse user experience than a notification arriving a second or two late. I proposed converting the publish call to fire and forget using Async, with failures caught and logged inside that async method rather than propagated back to the caller, so a broker hiccup could never surface as a failed message send.
Result: We aligned on that direction, converted the call to Async, and it decoupled the reliability of a secondary system from the reliability of the core feature, which everyone agreed afterward was clearly the right call.

7. Tell me about a time you took ownership of something outside your responsibility.

Story 1: Noticing two endpoints were silently not being tracked for billing
Situation: While working on a completely different task, I noticed that two endpoints, one for land based comps and one for plex based comps, were computing a result and just discarding it, unlike the main appraisal endpoint which properly recorded every request into the paid history table.
Task: This wasn't something I was assigned to fix, but it meant billable work wasn't being tracked consistently, which is a real business risk, not just a code style issue.
Action: I flagged it and then took it on myself to bring both endpoints in line with the existing save pattern already used by the main appraisal endpoint, reusing the same historyService.saveAppraisal call rather than inventing a new pattern, so both endpoints picked up the same retry and critical-log-on-failure behavior the main endpoint already had for free.
Result: Both endpoints now get properly recorded, closing a real consistency gap, and it was a good example of noticing drift in a codebase and choosing to fix it in a way that matched existing patterns instead of introducing something new.

Story 2: Fixing a bean initialization order bug affecting monitoring, not just my feature
Situation: While working on notification delivery, I noticed our application performance monitoring logs had a gap right after startup, which wasn't related to what I was actually assigned to build.
Task: Nobody had traced this yet, and it wasn't officially my area, but it meant we had blind spots in observability that could hide real issues later.
Action: I dug into it and found the root cause was Spring bean initialization order, a log clearing configuration bean was running after the APM appender had already registered, effectively wiping out its early logs, since Spring doesn't guarantee bean creation order beyond dependency edges you declare explicitly. I reordered the bean initialization using an explicit DependsOn so the log clearing step ran before the APM appender registered, instead of relying on implicit ordering.
Result: The logging gap disappeared, and even though it wasn't part of my assigned scope, fixing it meant the whole team had reliable monitoring going forward, which felt like the right thing to prioritize when I noticed it.

8. Tell me about a time you missed a deadline or failed to deliver on time. What happened?

Story 1: Underestimating the complexity of reconciling two data shapes
Situation: I was asked to estimate how long it would take to build a shared caching schema that could serve both a residential and a commercial appraisal engine, and I initially estimated it as a fairly small task, since on paper it was just adding some database tables.
Task: I had to actually deliver a schema that correctly served both engines despite their outputs being structurally different, one giving dollar adjustments, the other percentage adjustments.
Action: Once I got into it, I realized reconciling those two shapes properly, deciding which columns should stay null for which engine, and building a normalizer to convert percentages to dollars at write time, took significantly longer than the simple schema design I had estimated, since it wasn't just column mapping, it required tracing every downstream reader to confirm a null column wouldn't break a report. I missed my original estimate and had to go back to the team with a revised timeline once I understood the real scope.
Result: I delivered a working, correct solution, just later than my first estimate. Since then, when estimating anything that involves reconciling two systems that look similar on the surface but have real structural differences, I intentionally build in extra time for the reconciliation logic itself, not just the schema or endpoint work.

Story 2: A refactor took longer than planned because of an unexpected safety requirement
Situation: I was extracting the pure valuation logic out of a paid appraisal endpoint into a shared service, so both the paid flow and a new free cache flow could reuse it, and I initially scoped this as a straightforward extraction.
Task: Partway through, it became clear the extraction needed to be provably behavior preserving, since the paid endpoint was billing relevant, so any subtle change in the response shape would be a real problem, not just a cosmetic one.
Action: That meant I had to slow down and write before and after comparison tests confirming the exact same request produced a byte for byte identical response before and after the refactor, which wasn't in my original time estimate, and I had to be careful the tests exercised the real Spring context rather than mocking the extracted service, since a mock would have hidden exactly the kind of subtle wiring bug I was trying to rule out. I communicated the delay clearly to the team rather than rushing it to hit the original date.
Result: The extraction shipped a bit later than planned, but with confidence that the paid endpoint's behavior was completely unchanged. It reinforced that when a refactor touches anything billing related, verifying behavior preservation has to be part of the estimate from the start, not an afterthought.

9. Tell me about a time you had to learn something quickly.

Story 1: Picking up WebFlux and reactive programming for a new pipeline
Situation: I needed to build a report pipeline that made around 20 calls to a third party API per report, and the existing codebase used Spring WebFlux with Mono and Flux, which I hadn't worked deeply with before.
Task: I had to understand reactive composition well enough to correctly express that some of those 20 calls had to succeed together, using Mono.zip, while others should be allowed to fail individually without aborting the whole report, using Flux with onErrorResume.
Action: I spent focused time working through how the reactive chain actually propagates errors versus values, and specifically how onErrorResume differs from just wrapping something in a try catch in blocking code, since in a reactive chain an unhandled error terminates the entire stream downstream of it rather than just the one call, which is what made Mono.zip the right fit for calls that genuinely had to succeed together. I then applied that directly to the required versus optional call phases of the pipeline.
Result: I was able to implement the four phase pipeline correctly, with required calls failing fast together and optional calls soft failing independently, and that reactive composition knowledge carried over directly into later work composing an orchestrator and a PDF renderer without extra HTTP calls.

Story 2: Learning Testcontainers to properly test database specific behavior
Situation: Our repository tests were originally running against an in memory H2 database, but I needed to verify behavior that depended on real SQL Server specific features, like a genuine unique constraint upsert and cascading deletes.
Task: I hadn't used Testcontainers before, and needed to get a real SQL Server instance spinning up automatically inside our test suite quickly, without slowing down the whole test run too much.
Action: I learned how to declare a container as a static field annotated with Container so it's shared across all test methods in a class and only started once instead of once per test, and used DynamicPropertySource to inject the container's connection details into the Spring datasource configuration before the context starts, since that runs early enough to override the datasource properties before any bean tries to connect.
Result: I got integration tests running against real SQL Server behavior within a short time, which caught real constraint and cascade behavior that H2 would have silently handled differently, giving much more confidence in that part of the system.

10. Tell me about a time you received critical/negative feedback. How did you respond?

Story 1: Being told my exception handling was hiding real failures from users
Situation: Early in building an appraisal history save flow, I had structured the code so that if a database save failed, it would silently log the error and just return the computed valuation to the user without any indication anything had gone wrong.
Task: A reviewer pointed out that while returning the valuation to the user was the right instinct, silently swallowing the failure meant the team would have no visibility into how often this was actually happening.
Action: I took that feedback and reworked the approach using Spring Retry with Retryable and Recover, so a transient failure gets retried automatically with backoff, and if it still fails after retries are exhausted, the Recover method escalates to a clearly marked critical log entry, while still returning the valuation to the user instead of failing the request on a storage problem outside the user's control.
Result: We kept the good user experience of never blocking someone on a rare storage hiccup, but gained real visibility into how often it was happening, which the original silent approach didn't give us. It taught me that failing gracefully for the user and failing silently for the team are two very different things, and you need both handled deliberately.

Story 2: Being told a cache design decision needed a fallback for its own failure mode
Situation: When I built the kill switch for the caching layer using a config property, a teammate reviewing it asked what would happen if the caching database itself became unavailable, since the application depended on that DataSource being creatable.
Task: I hadn't fully thought through that the caching feature being optional at the config level didn't automatically mean the application could start cleanly if the cache database was unreachable.
Action: I went back and made sure the caching configuration and its DataSource were only instantiated when the cache.enabled property was true, using ConditionalOnProperty, so turning the flag off completely prevented any attempt to create that DataSource bean at all, rather than creating it eagerly and just not calling it, which would have still failed application startup on a bad connection string.
Result: That closed a real gap, since now the kill switch isn't just a behavioral flag, it genuinely removes the dependency on the cache database when turned off. It reminded me to think through failure of my own infrastructure, not just failure of the systems I'm calling.

11. Describe a challenging bug or performance issue you diagnosed and resolved.

Story 1: The 30 to 60 second chat operation slowdown
Situation: In UAT, basic chat operations like sending or deleting a message were taking 30 to 60 seconds, which made the feature look completely broken, even though nothing was obviously failing.
Task: I had to find the actual source of the slowness, since it clearly wasn't one single failing query, it was something more systemic.
Action: I used Hibernate's SQL logging in a local profile combined with actual EXPLAIN ANALYZE runs against a UAT sized dataset, rather than just eyeballing the JPQL, since generated query plans can look fine on a small local dataset and still be catastrophic once row counts grow. That surfaced a pattern of cumulative redundant queries across message, attachment, session, and participant lookups, close to a classic N+1 pattern from lazy loaded associations. I combined multi step database writes into single transactions, merged separate lookups into joined JPQL queries, and reordered validation so cheap checks like authorization ran before any database call.
Result: Total time dropped from 30 to 60 seconds down to under 2 to 3 seconds, and I also found several correctness bugs hiding behind the slowness, like a delete endpoint returning the wrong status code.

Story 2: A group membership pattern getting expensive as usage grew
Situation: In the same real time messaging system, I noticed that the pattern used to check group membership on every subscription was scaling in cost with the number of open sessions a user had, meaning heavy users of the platform were disproportionately expensive to serve.
Task: I needed to rework this so cost didn't scale linearly with how many sessions someone had open at once.
Action: I reworked the subscription management logic and moved presence tracking out of a per session, in memory pattern into a global Redis backed presence service, so presence state lived in one shared place instead of being recomputed per session per user on every subscribe event, which also fixed a correctness gap since in memory state didn't survive across multiple instances anyway.
Result: The cost per heavy user dropped significantly, and the presence logic became simpler to reason about overall, since it was centralized instead of scattered across per session checks.

12. Tell me about a time you improved performance or code quality.

Story 1: Cutting redundant API calls to zero for repeat property lookups
Situation: A reporting pipeline was making around 20 calls to a paid third party real estate API for every single report, even when the same property, or the same city and neighborhood data, had just been looked up recently.
Task: I needed to reduce redundant calls without touching any of the roughly 20 call sites individually, since that would have been risky and hard to maintain.
Action: I designed a caching layer as a decorator over the single shared transport interface all those calls funneled through, so wrapping that one method automatically covered all 20 endpoints. I split freshness checking into two independent gates, whether we had the right id to even call the endpoint, and whether the cached data was still fresh, since having a valid id said nothing about whether a specific field was stale, and collapsing those into one combined check would have meant a stale record with a valid id looking indistinguishable from a genuinely missing one.
Result: Repeat lookups for fresh data dropped to zero external API calls, cutting cost and latency, while a single stale field only triggered a refetch for that one endpoint instead of the whole report recomputing from scratch.

Story 2: Reworking transactional boundaries to eliminate a partial write risk
Situation: While working on a message send flow, the database write for the message and the write updating the parent session's last message timestamp were happening as two separate operations, which meant a failure between them could leave the data inconsistent.
Task: I wanted to make sure a message and its parent session update either both succeeded or both failed together, without adding unnecessary overhead to a very frequently called code path.
Action: I combined the message insert and the session update into one write within a single Transactional boundary, and used optimistic locking with Version on the session's last message timestamp so two concurrent updates couldn't silently overwrite each other, instead surfacing an OptimisticLockException that the caller could retry. I chose optimistic over pessimistic locking here since sends are frequent and short lived, a row lock held across the whole write would have serialized unrelated sends to the same session for no real benefit.
Result: The send path became both faster, since it was fewer round trips, and safer, since a partial write could no longer happen, and it removed a subtle class of bug that could have caused sessions to show stale last message data under concurrent sends.

13. How do you handle unclear or changing requirements?

Story 1: Building enquiry sessions when the data model assumed a transaction always existed
Situation: We were asked to let a user start a chat with a transaction coordinator before any actual real estate transaction existed in the system, but the entire chat data model, from session creation to attachment lookups, had been built assuming a transactionId was always present.
Task: The requirement was fairly high level at first, just make chat possible without a transaction, and I had to work out all the concrete implications myself.
Action: I made transactionId nullable end to end across the schema and every downstream read path, and then went through session listing, closing, reopening, and attachment lookups one at a time to find and fix every place that implicitly assumed a transaction existed, since a nullable column alone doesn't stop a join or a role lookup written against the old assumption from silently returning nothing. I also had to design new role resolution logic for these sessions, since the existing logic determined a user's role from the transaction itself, which no longer applied.
Result: Enquiry sessions worked correctly across every existing chat feature without special casing scattered throughout the codebase, and it gave me a repeatable approach for these situations, systematically trace every consumer of an assumption before changing it, rather than just patching the entry point.

Story 2: Land appraisals not fitting an existing schema
Situation: We needed to support land appraisals using the exact same appraisal and comp database tables that were originally designed for residential and commercial properties, even though land data has no ARV, no beds or baths, and no adjustment breakdown at all.
Task: There wasn't a clear spec for exactly how a poorly fitting data shape should map into an existing schema, so I had to make a judgment call.
Action: I chose to reuse the existing tables rather than create a new schema just for land, mapping the fields that did exist, like as is value and lot size, and deliberately leaving the rest null, consistent with how the commercial engine already left some residential specific columns null. The alternative, a third schema, would have meant a third set of joins for every report or query that needed to work across all property types, for a property type that made up a small share of volume.
Result: Land support shipped without a schema fork, keeping one consistent set of tables for all three property types, and it reinforced for me that when requirements are ambiguous about fit, it's worth explicitly documenting which columns are intentionally null and why, so it doesn't look like an oversight later.

14. Tell me about a time a project didn't go as planned. How did you manage it?

Story 1: A migration that worked everywhere except a genuinely fresh database
Situation: I built Flyway migrations for a new caching schema, tested them, and they worked fine in our existing dev and UAT databases. Everything looked ready to ship.
Task: When we later tried running the exact same migrations against a completely fresh, empty database, they failed with a SQL Server specific error, because the migrations assumed the schema itself already existed.
Action: Instead of just patching around it in that one environment, I added a proper baseline migration that explicitly creates the schema first, using a guarded if not exists check, ordered before Flyway's own history table gets created, so the ordering was enforced by the migration's own version number rather than by remembering to run a manual step first.
Result: Migrations then succeeded reliably on a genuinely empty database, not just on databases that happened to already have the schema from earlier testing. It was a good reminder that works on my machine can extend all the way to works in every environment I've personally tested, which isn't the same as actually correct.

Story 2: An endpoint contract needing to change without breaking anyone already depending on it
Situation: An endpoint that other services already called always returned a 200 status code regardless of what actually happened, which meant those consumers couldn't distinguish a real failure from success.
Task: The plan was to introduce real status codes, but partway through I realized some consumers might already have logic, even if fragile, built around always receiving a 200 with a specific body shape.
Action: I adjusted the approach to guarantee the response DTO itself never changed shape, only the status code changed, and scoped a RestControllerAdvice specifically to that one controller using assignableTypes, so existing consumers parsing the body wouldn't break even if they hadn't updated their status code handling yet, and no other controller's error handling was affected by the new advice bean.
Result: We were able to ship more accurate error signaling without a coordinated rollout across every consuming team, which hadn't been the original simpler plan, but turned out to be the safer path given what was actually at stake.

15. Tell me about a time you had to balance quality with delivery speed.

Story 1: Choosing a full replace instead of a diffing approach for comps
Situation: Every time an appraisal was refreshed, the list of comparable properties needed to be updated in the database, and there was a question of whether to write logic that diffs the old and new comp lists, updating only what changed, or just delete everything and reinsert the new set.
Task: A diffing approach would have been more precise, but comps have no stable natural key across refreshes, since the set can shrink, grow, or reorder entirely between runs.
Action: I chose to delete and reinsert the full set of comps on every refresh instead of building diffing logic, since comp counts are small, typically single digits to low tens, so the performance cost of a full replace was negligible, and it avoided a whole category of key matching bugs a diffing approach would have introduced, like accidentally matching two unrelated comps that happened to share an address after a resale. I relied on the FK's ON DELETE CASCADE from the parent appraisal row so a delete-then-reinsert inside one transaction couldn't leave orphaned comp rows behind.
Result: The comp refresh logic stayed simple and correct, and in hindsight, building a more precise diffing system would have added real complexity for essentially no benefit given how small these datasets are.

Story 2: Keeping the response contract byte for byte identical during a refactor, even though it added test writing time
Situation: I was extracting the core valuation logic out of a paid appraisal endpoint so it could be shared with a new free caching endpoint, and the fast path would have been to just refactor it and trust that I hadn't changed the output.
Task: Since the endpoint was billing relevant, I felt I couldn't just trust that the refactor was safe, I needed to actually prove it.
Action: I wrote before and after comparison tests that captured the exact same request against the old and new code paths and asserted the responses matched byte for byte, which took extra time upfront, time that wasn't in the initial estimate, and I made sure those tests ran against the real Spring context rather than a mocked service so the comparison actually exercised the wiring, not just the extracted method in isolation.
Result: The refactor shipped with real confidence that a billing relevant endpoint's behavior was completely unchanged, and that extra time spent on comparison tests felt clearly worth it, since a subtle regression there would have been a much more expensive problem to catch after the fact.

16. How do you approach a codebase or problem you've never seen before?

Story 1: Coming into a caching problem with 20 different call sites
Situation: I was asked to add caching to a report generation pipeline that made about 20 different calls to a third party API, spread across several endpoint classes I hadn't written.
Task: Before writing any code, I needed to understand how all these calls actually flowed through the system, rather than assuming I could just wrap each call site individually.
Action: I traced the code and found that every one of those 20 calls, regardless of which endpoint class triggered it, ultimately funneled through a single shared transport interface with one method. That single point of convergence became the natural place to add caching as a decorator, rather than touching 20 separate places, since a decorator around one interface method is invisible to every caller and needs no changes at any call site.
Result: I was able to add caching with zero changes to any of the 20 existing endpoint classes, purely because I spent time understanding the actual call graph first instead of jumping straight to implementation.

Story 2: Understanding an existing dual persistence system before extending it
Situation: I joined an ongoing effort to build a free caching path for appraisal data, next to an already existing paid history path that I hadn't originally built.
Task: I needed to understand exactly how the existing history path worked, including its failure handling and its trust boundaries, before I could safely build something that had to coexist with it without ever crossing into its write path.
Action: I read through how the history path derived identity from the JWT rather than the request body, since trusting a client supplied id for a paid write is an easy way to let one user's request write into another user's record, how it used Spring Retry with an escalating critical log on failure, and how PDFs were stored with just a filename while the full URL was built at read time so nothing time sensitive ever got persisted. I deliberately mirrored several of those same patterns in the new cache module instead of inventing different ones.
Result: The new cache module felt consistent with the existing system from day one, and reusing proven patterns, like deriving identity server side and building URLs at read time, meant I avoided reintroducing problems the original system had already solved.

17. Tell me about the toughest decision you've made in the past six months.

Story 1: Deciding to migrate off self hosted WebSocket infrastructure instead of continuing to patch it
Situation: Our real time messaging system kept having intermittent connection failures in production under multi instance load, and we had already applied a couple of smaller fixes that only partially helped.
Task: I had to decide between continuing to invest in tuning our existing self hosted setup, which felt more familiar and lower risk on the surface, or migrating to a managed relay service, which was a bigger change with more unknowns.
Action: I weighed that the root cause, sticky session cookies not surviving a hop through our content delivery layer, was fundamentally an architectural mismatch, not something a config tweak could fully solve, since no amount of session affinity tuning changes the fact that the routing layer in front of us wasn't guaranteed to honor it. I decided to recommend the migration despite it being a larger, riskier change, because continuing to patch felt like it would just keep producing the same class of intermittent failure indefinitely.
Result: The migration fully resolved the issue, and looking back, it was the right call, even though at the time the safer feeling option was to keep making smaller adjustments to the existing setup.

Story 2: Choosing to reuse an ill fitting schema instead of creating a new one for land appraisals
Situation: Land appraisals produced a data shape that barely resembled the existing appraisal schema, no ARV, no bedroom or bathroom counts, no adjustment breakdown at all.
Task: I had to decide whether to force this data into the existing shared schema, leaving many columns null, or introduce a third, land specific schema that would fit the data much more precisely.
Action: I chose to reuse the existing schema, accepting that it would look like a poor fit on paper, specifically to avoid schema proliferation and to keep all three property types queryable through one consistent set of tables instead of three separate ones that every future report or migration would need to touch. I made sure to document clearly which columns were intentionally null for land, so it wouldn't look like an oversight to someone reading the code later.
Result: It kept the system simpler overall, with one shared schema instead of three, and the documentation around the intentional nulls has made it easy for others to understand the design choice without needing to ask me directly.

18. Tell me about a time you stepped into a leadership role.

Story 1: Leading a performance investigation end to end
Situation: When chat operations in UAT were taking 30 to 60 seconds, there wasn't an assigned lead for the investigation, it just needed someone to drive it to a real root cause instead of everyone independently guessing at possible fixes.
Task: I took the lead on structuring the investigation, deciding what tooling to use and in what order, rather than just fixing the first slow looking query someone happened to notice.
Action: I set up profiling with Hibernate SQL logging and ran EXPLAIN ANALYZE against realistic data volumes, categorized the redundant query patterns we found across message, attachment, session, and participant paths, and then worked through fixes systematically, combining writes, merging queries, reordering validation, verifying each change against the same profiling setup as I went rather than assuming a fix worked just because the code looked right.
Result: The investigation brought the operation time down from 30 to 60 seconds to under 2 to 3 seconds, and having a clear, repeatable investigation process meant the fixes were verified with evidence at each step, not just assumed to have worked.

Story 2: Owning a system end to end as its primary point of contact
Situation: I was the person who originally built the chat and notifications system from the ground up, the data model, the real time transport, and the domain logic, and over time I became the default person the team turned to for any production issue in that area.
Task: This meant taking ownership not just of new feature work, but of triaging and resolving production issues as they came in, prioritizing them appropriately against other planned work, and deciding when something needed an urgent fix versus a scheduled one.
Action: I made the call early on to build things like idempotency keys and optimistic locking directly into the core design, anticipating classes of production issues, like a retried send request or two concurrent updates to the same session, rather than only reacting to them after they happened. When issues did come up, I owned diagnosing them fully rather than handing off half finished investigations.
Result: The system became stable enough that production issues became infrequent relative to its complexity, and being the consistent owner meant fixes were made with full context of the original design decisions, rather than someone unfamiliar with the history having to reverse engineer intent each time.

19. Describe a time you disagreed with a team member and how you resolved it.

Story 1: Disagreeing on whether to use a hand rolled cache map or Spring's caching abstraction
Situation: A teammate had built a notification template lookup system using a hand rolled ConcurrentHashMap as an in memory cache, and I felt this was reinventing something Spring already provided well, and that it would eventually need equally hand rolled invalidation logic.
Task: I wanted to move it to Spring's Cacheable and CacheEvict annotations instead, but the teammate felt the existing map based approach was simpler and already working.
Action: I walked through a specific scenario with them, template edits made after the application had already started weren't showing up until a full restart, since the hand rolled map had no eviction path at all, only a load-on-startup step. I proposed Cacheable and CacheEvict combined with an authenticated reload endpoint that could evict the cache and fan the invalidation signal out to other instances over Redis pub sub, since CacheEvict alone only clears the cache on the instance that received the request, not the others behind the load balancer.
Result: We agreed on the Spring Cache based approach, it solved the stale template problem cleanly, and it also removed a chunk of manual cache management code, replacing it with well tested framework behavior instead of custom logic we would have had to maintain ourselves.

Story 2: Disagreeing on whether presence tracking needed to be per instance or global
Situation: A teammate had implemented presence tracking, whether a user is currently online in a session, scoped to a single application instance's memory, and I raised a concern that this would give incorrect presence status once we were running multiple instances.
Task: I needed to convince them this was worth reworking before it caused a real inconsistency in production, since presence looking wrong is a subtle bug that's easy to miss in a single instance test environment.
Action: I explained the specific failure case, a user connected to one instance would show online there, but a different instance serving a different user wouldn't know that, since there was no shared state between instances, so notifications meant to be suppressed because the recipient already had the chat open could incorrectly fire anyway. I proposed moving presence into a global Redis backed service instead, so presence state read a shared source of truth regardless of which instance handled the request.
Result: We moved presence tracking to Redis, which resolved the inconsistency, and it turned out to matter more than either of us initially expected, since it was directly tied to correctly suppressing duplicate new message notifications for users who already had a chat open.

20. Tell me about a time you communicated a technical risk to a non-technical stakeholder.

Story 1: Explaining why a cache miss must never be able to trigger a charge
Situation: Product stakeholders wanted the free property browsing experience to feel fast and seamless, and at one point there was a suggestion to simplify the backend by letting the free cache path and the paid history path share more logic to reduce engineering time.
Task: I needed to explain, in terms a non-technical stakeholder would find convincing, why sharing a write path between those two systems was a real risk, not just an engineering preference.
Action: I framed it around the concrete failure scenario rather than technical architecture terms, if these two systems ever shared a write path and a bug slipped in, a customer browsing for free could end up accidentally charged, or worse, a paid customer's record could get silently overwritten by free traffic. I explained that keeping them in fully separate modules was a small amount of extra engineering effort that removed that entire risk category permanently, rather than just reducing the odds of it happening.
Result: The stakeholder agreed the separation was worth keeping, and framing it around a specific dollars and trust scenario, rather than abstract code architecture, was what made the risk land clearly for a non-technical audience.

Story 2: Explaining a data availability tradeoff around comp refresh timing
Situation: A product stakeholder asked why comparable properties on an appraisal sometimes changed slightly between viewings of what seemed like the same cached report, and whether that indicated a bug.
Task: I needed to explain that this was expected behavior from a caching design decision, not a defect, without getting into implementation details like delete and reinsert patterns.
Action: I explained it in terms of the tradeoff, comps are refreshed as a full set whenever the underlying data becomes stale, rather than being locked in place forever, because comparable properties genuinely do change over time as new sales happen, and showing outdated comps would be worse than showing a slightly different but current set.
Result: The stakeholder understood this was an intentional freshness versus stability tradeoff rather than a bug, and it also led to a good follow up conversation about whether we wanted to communicate a last updated timestamp to end users, which became a small follow up improvement.


______________________________________________________________

- Chat performance collapse — 30–60s send/delete/read, traced to redundant queries, fixed to 2–3s.
- Duplicate Direct chat sessions — unique index plus a participant-count bug collapsed to one UUID when the TC was the creator
- Idle-tab disconnect logic — Chrome throttles timers in hidden tabs, switched to wall-clock polling instead of setTimeout
- Sent messages incorrectly incrementing the sender's own unread count (echo not filtered)
- Group-membership subscription pattern scaling cost per open session — reworked plus moved presence to global Redis
- Enquiry sessions (no transaction) breaking every downstream path assuming a transaction existed
- Empty participant names on session close/reopen — a missing join
- Wrong role assignment for Broker/Lender/Buyer in enquiry sessions — role resolution needed a transaction that didn't exist
- Attachment download URLs returning null on history/gallery endpoints — signed URL only generated on live send, not at read time
- Notification template cache staleness — edits invisible until restart, fixed with Redis pub/sub eviction fan-out
- TC comment replaced by a generic template string (notification content bug)
- Opt-out-by-default silently blocking new users from notifications — flipped to opt-in by default
- One failing scheduled job crashing the entire application context — isolated with per-job try/catch
- Appraisal PDF URL pointing at the wrong storage account, 404 despite the blob existing
- Designing the cache-vs-history split so a cache miss could never accidentally trigger a charge
- POST /api/appraisal/save's two-call flow — JSON call creates/reuses FormData + History, PDF call attaches the blob and marks it Completed, each its own transaction
- Designing two persistence paths (paid/history vs. free/cache) that must never share a write path — enforced by module separation, not just convention
- Built chat and notifications end to end — data model, real-time transport, and every production incident since — as the primary owner
- Extended chat to "enquiry sessions" with no transaction at all, so users could reach a TC before any deal existed
- Built the appraisal cache path from zero, next to an existing history path, without letting the two collide
- Duplicate chat sessions caused by a participant-count bug collapsing to one UUID
- Notification template cache going stale after edits until a restart — fixed with Redis pub/sub fan-out
- Appraisal payment status incorrectly stuck on "Pending" despite payment already deducted
- Designing two persistence paths that must never share a write path — enforced by module boundary, not convention
- Idempotency-key design on chat message send to survive client retries without duplicating
- Bringing /land-comps and /plex-comps in line with /appraise's save pattern after noticing they weren't being recorded despite being billable
- Taking chat and notifications from initial build through every subsequent production issue, becoming the system's de facto owner
- Building an event-driven notification pipeline on Kafka with per-channel delivery and multi-instance-safe live template reload
- Duplicate Direct chat sessions — a unique index plus a participant-count bug collapsing to one UUID when the TC was the creator
- Sent messages incorrectly incrementing the sender's own unread count due to an unfiltered echo
- Group-membership subscription pattern scaling cost per open session — reworked and moved presence to global Redis
- Enquiry sessions with no transaction breaking every downstream path that assumed one existed
- Empty participant names on session close/reopen caused by a missing join
- Wrong role assignment for Broker/Lender/Buyer in enquiry sessions — role resolution needed a transaction that didn't exist
- A TC's comment being replaced by a generic template string in a notification
- Opt-out-by-default silently blocking new users from notifications — flipped to opt-in by default
- One failing scheduled job crashing the entire application context — isolated with per-job try/catch
- No foreign key from the appraisal cache table to the history table — the deliberate "blob survival rule"
- Choosing delete-and-reinsert over diffing for appraisal comps, since they have no stable per-row key
- Idempotency-key design on chat message send so a client retry resolves to the same row instead of duplicating
- Frontend DTOs/enums matched against live API responses as the backend contract drifted mid-development
- /land-comps and /plex-comps brought in line with /appraise's save pattern after noticing they weren't recorded despite being billable
- Appraisal payment status stuck on "Pending" despite payment already being deducted
- Appraisal PDF 404s from a wrong storage account name, found via the storage console before touching code
- Designing the cache-vs-history split so a cache miss could never accidentally trigger a charge
- GET /check moved from exact-match single-result to partial-match multi-result with a proper index
- Choosing to cache at the transport layer instead of using @Cacheable, so one Decorator covers all ~20 Mashvisor endpoints with zero endpoint-code changes
- Designing two independent gates (ID gate and freshness gate) instead of one combined check, since having an ID never implies the data is fresh
- Building a two-layer storage model — raw JSON as source of truth, extracted typed columns derived from it, never written unless the source was fresh
- Designing the cache key to include every normalized parameter, after realizing a missing param could silently collide two different requests
- Handling SQL Server's ~450-character index limit on the cache key with truncation plus a deterministic hash suffix
- Anchoring TTL values to Mashvisor's actual publishing cadence per endpoint, since no official TTLs were provided
- Building a path-templating utility to match a concrete API path back to its TTL policy template, with special-casing for endpoints where the "ID" slot is actually a name
- Handling ~20 parallel calls racing to upsert the same cache key — try-save-first, catch the constraint violation, fall back to update
- Deciding to never persist a failed API call, letting the exception propagate through the reactive chain untouched
- Adding a cache.enabled kill switch so the entire caching layer (including its DataSource) can be bypassed without code changes
- Writing a batched, paginated cleanup job for expired cache rows so it never holds a long lock on a shared database
- Building the PropertyRentability endpoint's reidyPropertyId fast path to skip re-parsing a known address
- Collapsing three repository round trips into one by reusing the same loaded entity across the freshness check and data extraction
- Choosing WebFlux over blocking Spring MVC because the pipeline is ~20 HTTP calls per report, needing required calls to fail together and optional calls to soft-fail independently
- Designing required-vs-optional call semantics — Mono.zip aborts together, Flux + onErrorResume fails individually
- Deciding financing defaults differently between the full report (all-cash) and the rentability endpoint (financing on), so DSCR/cashflow are never null
- Tracking cache freshness per endpoint response rather than per column, so a columns-only query can still answer "is this fresh"
- Choosing not to reuse Mashvisor's own property ID as the cache identity key, since it's null on placeholder responses — using a normalized address instead
- Scoping a @RestControllerAdvice to just one controller so no other controller's error handling was affected
- Designing two persistence paths — paid/append-only history vs. free/upsert cache — that must never share a write path
- Deciding the history-vs-cache branch point up front (whether an address resolves to a PropertyId), never inferred later from payment state
- Building the cache classification check to short-circuit — a cache hit skips the classification query entirely, so the common case costs one query
- Adding a real unique constraint on PropertyId to the new cache table, since the old table allowed duplicate rows for the same property
- Deciding comps should be deleted and reinserted wholesale on every refresh instead of diffed, since they have no stable per-row key
- Parameterizing the PDF upload path with an optional container argument so the same rendering code could target either the history or cache blob container
- Storing only a PDF blob filename per row and building the full SAS URL at read time, rather than persisting anything time-sensitive
- Deciding retries on the history write path log-and-continue on failure rather than blocking the user's already-computed result
- Escalating to a CRITICAL log marker once retries on a history save exhaust, so a lost record is still visible to the team even though invisible to the user
- Keeping the history and cache write paths in two separate starter modules specifically so a future same-file edit couldn't accidentally let one touch the other
- Scoping this project's Flyway migrations to only its own two new tables inside a much larger shared database owned by a different team
- Explaining the pool-permit invariant risk — a reused connection incorrectly taking a new permit would silently shrink the pool until requests deadlock
- Choosing WebFlux for the commercial service specifically because its PDF job needs to stream incremental status over Server-Sent Events
- Writing before/after contract-preservation tests on /appraise to prove the extraction refactor didn't change the paid endpoint's behavior
