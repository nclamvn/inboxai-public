/**
 * Feature Executors Unit Tests
 * Run with: npx ts-node src/lib/ai/__tests__/feature-executors.test.ts
 */

import { executorMap } from '../feature-executors';
import { AIFeatureKey } from '@/types/ai-features';

// Simple test helpers
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
  }
}

// Test definitions
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

// ===========================================
// Executor Map Tests
// ===========================================

test('executorMap should have all required executors', async () => {
  const requiredKeys: AIFeatureKey[] = [
    'classification',
    'summary',
    'smart_reply',
    'action_items',
    'follow_up',
    'sentiment',
    'translate',
  ];

  for (const key of requiredKeys) {
    assert(key in executorMap, `Executor map should have key: ${key}`);
    assert(
      typeof executorMap[key].execute === 'function',
      `Executor ${key} should have execute function`
    );
  }
});

test('all executors should have execute functions', async () => {
  for (const [key, executor] of Object.entries(executorMap)) {
    assert(
      typeof executor.execute === 'function',
      `Executor ${key} should have execute function`
    );
  }
});

// ===========================================
// Sentiment Executor Tests
// ===========================================

test('sentiment executor should handle empty body text', async () => {
  const result = await executorMap.sentiment.execute('email123', {
    body_text: '',
  });

  const typedResult = result as { sentiment: string; confidence: number; emotions: string[] };
  assertEqual(typedResult.sentiment, 'neutral', 'Sentiment should be neutral for empty body');
  assertEqual(typedResult.confidence, 0.5, 'Confidence should be 0.5 for empty body');
});

test('sentiment executor should handle short body text', async () => {
  const result = await executorMap.sentiment.execute('email123', {
    body_text: 'Hi',
  });

  const typedResult = result as { sentiment: string; confidence: number; emotions: string[] };
  assertEqual(typedResult.sentiment, 'neutral', 'Sentiment should be neutral for short body');
});

// ===========================================
// Translate Executor Tests
// ===========================================

test('translate executor should return null for empty body', async () => {
  const result = await executorMap.translate.execute('email123', {
    subject: 'Test',
    body_text: '',
  });

  assertEqual(result, null, 'Result should be null for empty body');
});

test('translate executor should return null for short body', async () => {
  const result = await executorMap.translate.execute('email123', {
    subject: 'Test',
    body_text: 'Short',
  });

  assertEqual(result, null, 'Result should be null for short body');
});

// ===========================================
// Classification Executor Tests
// ===========================================

test('classification executor should return null (handled separately)', async () => {
  const result = await executorMap.classification.execute('email123', {});
  assertEqual(result, null, 'Classification result should be null');
});

// ===========================================
// Data Mapping Tests
// ===========================================

test('email data mapping should handle missing optional fields', async () => {
  const minimalData = {
    from_address: 'test@example.com',
    received_at: new Date().toISOString(),
  };

  // Sentiment should work with minimal data
  const sentimentResult = await executorMap.sentiment.execute('email123', minimalData);
  assert(sentimentResult !== undefined, 'Sentiment should return a result');
});

test('email data structure should be valid', async () => {
  const emailData = {
    from_address: 'sender@example.com',
    from_name: 'Sender Name',
    subject: 'Test Subject',
    body_text: 'Test body content that is long enough for processing',
    received_at: '2024-12-14T10:00:00Z',
    category: 'work',
    user_email: 'user@example.com',
    user_name: 'User Name',
  };

  // Verify data structure is correct
  assert(!!emailData.from_address, 'from_address should be truthy');
  assert(!!emailData.received_at, 'received_at should be truthy');
});

// ===========================================
// Test Runner
// ===========================================

export async function runFeatureExecutorsTests(): Promise<{
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  console.log('='.repeat(60));
  console.log('🧪 FEATURE EXECUTORS TESTS');
  console.log('='.repeat(60));
  console.log('');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`✅ ${name}`);
      results.push({ name, passed: true });
    } catch (error) {
      failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ ${name}`);
      console.log(`   Error: ${errorMessage}`);
      results.push({ name, passed: false, error: errorMessage });
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`📊 RESULTS: ${passed}/${tests.length} passed`);
  console.log('='.repeat(60));

  return { passed, failed, results };
}

// Run tests if called directly
if (require.main === module) {
  runFeatureExecutorsTests()
    .then(({ failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}
