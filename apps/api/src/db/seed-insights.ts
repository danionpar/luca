import { db } from "./index.js";
import { linkInsights, relationsForObservation, saveInsight } from "../mcp/insights/store.js";

// Four conventions the owner already taught in real sessions, currently
// living only in Engram memory (see MEMORY.md in this repository's Claude
// project directory) and not yet queryable by the tool itself. Seeding them
// here gives the insight layer real starting content instead of an empty
// table. Every figure below is exact and integer CLP, as recorded when each
// convention was learned.
interface SeedObservation {
  topicKey: string;
  type: string;
  title: string;
  content: string;
}

const seedObservations: SeedObservation[] = [
  {
    topicKey: "payment-section-never-categorized",
    type: "convention",
    title: "Payment section (`payment`) is never categorised",
    content:
      "Section `payment` holds card-statement movements that are payments TO the card, not spending: `Pago Pesos TEF` (x11), `MONTO CANCELADO` (x3), and `PAGO AUTOMATICO` (x1), totalling -13,942,625 CLP. Categorising them would make these negatives subtract inside whatever category they were assigned, corrupting that category's totals. They stay queryable via `section: \"payment\"` but must never receive a category or a create_rule.",
  },
  {
    topicKey: "insurance-split-by-coverage",
    type: "convention",
    title: "Insurance is split by what it covers, not by being insurance",
    content:
      "Insurance is categorised by what it covers, never grouped under one insurance category. Life/patrimony insurance goes to Servicios financieros. Health insurance goes to Salud. Rationale: \"how much do I spend on health\" must include health insurance premiums, while life insurance protects third parties and is not a health cost. Accepted cost of this convention: there is no single \"insurance\" line to look at.",
  },
  {
    topicKey: "fuel-round-number-heuristic",
    type: "pattern",
    title: "Fuel purchases are always over 10,000 CLP and a round number",
    content:
      "Fuel purchases at a gas-station merchant are always over 10,000 CLP and a round number: 10,000 / 15,000 / 30,000 CLP. Anything smaller or non-round at that same merchant is the attached kiosk, not fuel. Verified: both SHELL rows on this card are 2,300 CLP and 1,290 CLP — kiosk purchases, not fuel. A search across COPEC / PETROBRAS / TERPEL / ENEX / SHELL / BENCIN merchant patterns found zero actual fuel purchases on this card. Therefore a gas-station merchant must never get a create_rule: the same merchant name is two different things depending on the amount.",
  },
  {
    topicKey: "apple-com-multi-purchase-merchant-group",
    type: "warning",
    title: "`APPLE.COM CL APPLE` holds three unrelated purchases across 11 rows",
    content:
      "`APPLE.COM CL APPLE` holds 11 transaction rows that are actually three unrelated purchases: 24 instalments of 120,833 CLP starting 2025-09-24; 12 instalments of 66,665 CLP starting 2026-07-17; and 12 instalments of 12,332 CLP also starting 2026-07-17. A create_rule on \"APPLE\" would sweep all three into one category. Instalment rows repeat their original purchase date and amount, so one merchant group can hide several distinct purchases years apart — merchant count is not the same as purchase count. Before creating a rule on a merchant with many instalment rows, check installmentTotal and purchase date to confirm how many distinct purchases are actually present.",
  },
];

async function seed(): Promise<void> {
  const idByTopicKey = new Map<string, number>();

  for (const observation of seedObservations) {
    const result = saveInsight(db, observation);
    idByTopicKey.set(observation.topicKey, result.id);
    const outcome = result.created ? "created" : result.upserted ? "upserted" : "deduplicated";
    console.log(`${outcome} observation ${result.id} (${observation.topicKey})`);
  }

  // Observations 3 and 4 reach the same operational conclusion — never
  // create_rule on that merchant — for unrelated reasons (amount/roundness
  // vs. installment/date collision), so they are linked as `related`. This
  // is idempotent: re-running the seed does not add a second copy of the
  // same relation.
  const fuelId = idByTopicKey.get("fuel-round-number-heuristic");
  const appleId = idByTopicKey.get("apple-com-multi-purchase-merchant-group");
  if (fuelId === undefined || appleId === undefined) {
    throw new Error("Expected both the fuel heuristic and the Apple.com warning to have been seeded above.");
  }

  const alreadyLinked = relationsForObservation(db, fuelId).some(
    (relation) => (relation.sourceId === appleId || relation.targetId === appleId) && relation.relation === "related",
  );

  if (alreadyLinked) {
    console.log(`Already linked ${fuelId} <-> ${appleId} as related`);
  } else {
    linkInsights(db, {
      sourceId: fuelId,
      targetId: appleId,
      relation: "related",
      reason:
        "Both observations establish that create_rule must never be based on merchant name alone for these two merchants — the fuel heuristic and the Apple.com purchase-splitting check reach the same operational conclusion (verify before ruling) via unrelated mechanisms (amount/roundness vs. installment/date collision).",
      evidence:
        "SHELL rows of 2,300 CLP and 1,290 CLP are kiosk purchases, not fuel (fuel is always >=10,000 CLP and round); APPLE.COM CL APPLE's 11 rows are 3 distinct purchases (120,833 CLP x24 from 2025-09-24, 66,665 CLP x12 from 2026-07-17, 12,332 CLP x12 from 2026-07-17).",
      confidence: 0.95,
    });
    console.log(`Linked ${fuelId} <-> ${appleId} as related`);
  }
}

seed().catch(console.error);
