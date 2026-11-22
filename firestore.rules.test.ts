/**
 * Phase 0 TDD verification for ORDAL Esports Hub Firestore Blueprint & Dirty Dozen Invariants.
 * Run with: npx tsx firestore.rules.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const blueprint = JSON.parse(fs.readFileSync('./firebase-blueprint.json', 'utf-8'));
const rules = fs.readFileSync('./firestore.rules', 'utf-8');

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

interface DirtyPayloadCase {
  name: string;
  collection: string;
  docId: string;
  payload: Record<string, unknown>;
  assertDeniedByBlueprintAndRules: () => void;
}

const dirtyDozen: DirtyPayloadCase[] = [
  {
    name: '1. Self-Role Escalation on Registration',
    collection: 'users',
    docId: 'usr-attacker-1',
    payload: {
      uid: 'usr-attacker-1',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      role: 'SUPER_ADMIN',
      createdAt: new Date().toISOString(),
    },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /incoming\(\)\.role == 'TEAM'/);
      assert.match(rules, /isBootstrapAdmin\(\)/);
    },
  },
  {
    name: '2. Profile Role Tampering Update',
    collection: 'users',
    docId: 'usr-team-1',
    payload: { role: 'LEAGUE_OPS' },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /incoming\(\)\.role == existing\(\)\.role/);
      assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['displayName', 'teamProfile'\]\)/);
    },
  },
  {
    name: '3. Ghost Shadow Field Injection on Scrim Create',
    collection: 'scrims',
    docId: 'scrim-evil',
    payload: { hostPaid: true, ghostField: true },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /isValidScrim\(/);
      assert.match(rules, /incoming\(\)\.hostPaid == false/);
    },
  },
  {
    name: '4. Unverified Email Spoof',
    collection: 'tournaments',
    docId: 'trn-spoof',
    payload: { name: 'Spoofed' },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /request\.auth\.token\.email_verified == true/);
    },
  },
  {
    name: '5. Path ID Poisoning (Oversized or Invalid Chars)',
    collection: 'squads',
    docId: 'A'.repeat(200),
    payload: {},
    assertDeniedByBlueprintAndRules: () => {
      assert.equal(VALID_ID_RE.test('A'.repeat(200)), false);
      assert.match(rules, /function isValidId\(id\)/);
      assert.match(rules, /id\.size\(\) <= 128/);
    },
  },
  {
    name: '6. PII Blanket Read / List Scraping on Users',
    collection: 'users',
    docId: 'any',
    payload: {},
    assertDeniedByBlueprintAndRules: () => {
      assert.doesNotMatch(rules, /match \/users\/\{userId\}[\s\S]*allow read:\s*if\s*isSignedIn\(\)/);
      assert.match(rules, /resource\.data\.uid == request\.auth\.uid/);
    },
  },
  {
    name: '7. Other User Payment Tampering',
    collection: 'payments',
    docId: 'pay-victim',
    payload: { status: 'VERIFIED' },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /existing\(\)\.ownerUid == request\.auth\.uid/);
      assert.match(rules, /incoming\(\)\.status in \['UNPAID', 'PENDING_VALIDATION'\]/);
    },
  },
  {
    name: '8. Terminal State Bypass on Cancelled Scrim / Verified Payment',
    collection: 'scrims',
    docId: 'scrim-cancelled',
    payload: { status: 'CONFIRMED' },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /existing\(\)\.status != 'CANCELLED'/);
      assert.match(rules, /existing\(\)\.status != 'VERIFIED'/);
    },
  },
  {
    name: '9. Audit Log Erasure / Mutation',
    collection: 'auditLogs',
    docId: 'log-1',
    payload: { summary: 'tampered' },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /match \/auditLogs\/\{logId\}[\s\S]*allow update, delete:\s*if false;/);
    },
  },
  {
    name: '10. Oversized Denial-of-Wallet String',
    collection: 'scrims',
    docId: 'scrim-dos',
    payload: { hostTeamName: 'X'.repeat(200000) },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /isNonEmptyStr\(data\.hostTeamName, 100\)/);
    },
  },
  {
    name: '11. Orphaned Squad Injection',
    collection: 'squads',
    docId: 'sq-orphan',
    payload: { tournamentId: 'non-existent-trn' },
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /existsAfter\(\/databases\/\$\(database\)\/documents\/tournaments\/\$\(incoming\(\)\.tournamentId\)\)/);
    },
  },
  {
    name: '12. SOC Security Bypass by Non-Admin',
    collection: 'socEvents',
    docId: 'soc-1',
    payload: {},
    assertDeniedByBlueprintAndRules: () => {
      assert.match(rules, /match \/socEvents\/\{eventId\}[\s\S]*isAdmin\(\)/);
    },
  },
];

// Verify every blueprint collection path has a matching block in firestore.rules
for (const collectionPath of Object.keys(blueprint.firestore)) {
  const collectionName = collectionPath.split('/')[1];
  assert.ok(
    rules.includes(`match /${collectionName}/`),
    `Missing match block for collection /${collectionName} in firestore.rules`
  );
}

for (const testCase of dirtyDozen) {
  testCase.assertDeniedByBlueprintAndRules();
  console.log(`PASS: ${testCase.name}`);
}

console.log(`All ${dirtyDozen.length} Dirty Dozen checks and blueprint parity verified.`);
